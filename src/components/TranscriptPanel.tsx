/**
 * TranscriptPanel — Editable transcript working draft.
 *
 * - Transcript is an editable textarea (coach can fix STT errors).
 * - Pass 1: two-step Parse → Apply to Draft (anchor parser).
 * - Pass 2+: SINGLE "Update Proposal" action that parses personnel narration
 *   and writes canonical pos* fields directly into proposal/draft state via
 *   applySystemPatch. No silent commit. Same-slot conflicts, off-roster, and
 *   duplicate jersey assignments are surfaced visibly and excluded from the
 *   patch.
 * - No auto-parse. No AI. No silent mutation of committed state.
 */

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Trash2, Keyboard, Play, AlertTriangle, ArrowRight, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranscriptCapture } from "@/hooks/useTranscriptCapture";
import { parseRawInput, type ParseResult } from "@/engine/rawInputParser";
import { normalizeTranscriptForParse } from "@/engine/transcriptNormalize";
import { useTransaction, type SystemPatchCollision } from "@/engine/transaction";
import { RawInputCollisionDialog, type Collision } from "@/components/RawInputCollisionDialog";
import {
  parsePersonnelNarration,
  type PersonnelParseResult,
} from "@/engine/personnelParser";
import { useSeason } from "@/engine/seasonContext";
import { useRoster } from "@/engine/rosterContext";
import { getSeasonConfig } from "@/engine/db";
import { getAliasFor, type PositionAliasMap } from "@/engine/positionAliases";
import { PERSONNEL_LABELS } from "@/engine/personnel";
import { RosterResolveDialog, type OffRosterPending } from "@/components/RosterResolveDialog";
import { toast } from "sonner";

interface ParseSnapshot {
  /** The exact text that was parsed */
  sourceText: string;
  /** The merged parse result (anchor + personnel narration) */
  result: ParseResult;
  /** Personnel parser report (Pass 2+) */
  personnel?: PersonnelParseResult;
  /** ISO timestamp of when parse was triggered */
  parsedAt: string;
}

interface TranscriptPanelProps {
  /** Called after successful Apply to Draft with observation text and deterministic patch */
  onApply?: (observationText: string, deterministicPatch: Record<string, unknown>) => void;
  /** Active pass (1, 2, 3) — gates personnel-narration parsing for Pass 2+. */
  activePass?: number;
  /** Current candidate snapshot — used to detect jersey moves in Pass 2 parsing. */
  currentCandidate?: Record<string, unknown> | null;
}

export function TranscriptPanel({ onApply, activePass, currentCandidate }: TranscriptPanelProps = {}) {
  const {
    text,
    interim,
    listening,
    supported,
    hasContent,
    setText,
    toggleListening,
    clear,
  } = useTranscriptCapture();

  const { applySystemPatch, commitCount } = useTransaction();
  const { activeSeason } = useSeason();
  const { roster, addPlayer } = useRoster();

  // Set of roster jersey numbers, used by personnel parser to gate
  // off-roster assignments out of the patch.
  const rosterJerseys = React.useMemo(
    () => new Set<number>(roster.map((r) => r.jerseyNumber)),
    [roster],
  );

  // Roster resolution dialog state for off-roster jerseys surfaced by
  // the most recent personnel parse. Preserves intended canonical slot +
  // raw narration clause so we can re-apply on resolution.
  const [rosterResolve, setRosterResolve] = useState<{
    pending: OffRosterPending[];
    /** the source text we should re-parse against after resolution */
    sourceText: string;
  } | null>(null);

  // Load season alias map for personnel-narration token resolution.
  const [aliasMap, setAliasMap] = useState<PositionAliasMap>({});
  React.useEffect(() => {
    let cancelled = false;
    if (!activeSeason?.seasonId) { setAliasMap({}); return; }
    getSeasonConfig(activeSeason.seasonId).then((cfg) => {
      if (cancelled) return;
      setAliasMap((cfg?.positionAliases ?? {}) as PositionAliasMap);
    });
    return () => { cancelled = true; };
  }, [activeSeason?.seasonId]);

  const [showTyped, setShowTyped] = useState(false);
  const [typedLine, setTypedLine] = useState("");
  const [lastSnapshot, setLastSnapshot] = useState<ParseSnapshot | null>(null);
  const [applied, setApplied] = useState(false);

  // Collision dialog state
  const [collisionState, setCollisionState] = useState<{
    collisions: Collision[];
    nonCollisionCount: number;
    fullPatch: Record<string, unknown>;
  } | null>(null);

  // Determine if transcript has changed since last parse
  const isDirtyAfterParse = lastSnapshot !== null && text.trim() !== lastSnapshot.sourceText;
  const hasParsed = lastSnapshot !== null;
  const hasParseableText = text.trim().length > 0;
  const hasPatchFields = hasParsed && Object.keys(lastSnapshot.result.patch).length > 0;

  // Apply is available only when: parsed, not dirty, not already applied, has fields
  const canApply = hasPatchFields && !isDirtyAfterParse && !applied;

  // Show typed fallback automatically when speech is not supported
  React.useEffect(() => {
    if (!supported) setShowTyped(true);
  }, [supported]);

  // Bug 6 fix: Clear transcript state after successful commit
  const commitCountRef = React.useRef(commitCount);
  React.useEffect(() => {
    if (commitCountRef.current !== commitCount) {
      commitCountRef.current = commitCount;
      clear();
      setLastSnapshot(null);
      setTypedLine("");
      setApplied(false);
      setCollisionState(null);
    }
  }, [commitCount, clear]);

  const handleTypedSubmit = useCallback(() => {
    const trimmed = typedLine.trim();
    if (!trimmed) return;
    setText(text ? text.trimEnd() + "\n" + trimmed : trimmed);
    setTypedLine("");
  }, [typedLine, text, setText]);

  const handleTypedKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTypedSubmit();
    }
  };

  const handleClear = useCallback(() => {
    clear();
    setLastSnapshot(null);
    setTypedLine("");
    setApplied(false);
    setCollisionState(null);
  }, [clear]);

  /**
   * Explicit Parse action — freezes current text into a snapshot,
   * normalizes it, runs the deterministic parser, and stores the result.
   */
  const handleParse = useCallback(() => {
    const sourceText = text.trim();
    if (!sourceText) return;

    const normalized = normalizeTranscriptForParse(sourceText);
    const anchorResult = parseRawInput(normalized);

    // Pass 2+: also run deterministic personnel-narration parser. Personnel
    // patch keys are always canonical pos* fields. Merge into anchor patch
    // (personnel takes precedence on canonical pos* keys — it's the only
    // producer of those keys).
    let personnel: PersonnelParseResult | undefined;
    let mergedPatch = anchorResult.patch;
    if ((activePass ?? 1) >= 2) {
      personnel = parsePersonnelNarration(
        sourceText,
        aliasMap,
        currentCandidate ?? null,
        rosterJerseys,
      );
      if (Object.keys(personnel.patch).length > 0) {
        mergedPatch = { ...anchorResult.patch, ...personnel.patch };
      }

      // Surface roster + duplicate problems immediately and visibly so
      // parsed personnel assignments never silently disappear.
      if (personnel.offRosterJerseys.length > 0) {
        const list = personnel.offRosterJerseys.map((j) => `#${j}`).join(", ");
        toast.error(
          `Off-roster jersey ${list} not applied. Add to roster, then re-parse.`,
        );
      }
      if (personnel.duplicateJerseys.length > 0) {
        const list = personnel.duplicateJerseys.map((j) => `#${j}`).join(", ");
        toast.error(
          `Duplicate assignment for jersey ${list} blocked. Each jersey may hold only one position.`,
        );
      }
      if (personnel.sameSlotConflicts.length > 0) {
        const list = personnel.sameSlotConflicts
          .map((c) => `${c.canonicalField} (${c.jerseys.map((j) => `#${j}`).join(" vs ")})`)
          .join("; ");
        toast.error(
          `Same-slot conflict blocked: ${list}. Resolve before updating proposal.`,
        );
      }
    }

    setLastSnapshot({
      sourceText,
      result: { patch: mergedPatch, report: anchorResult.report },
      personnel,
      parsedAt: new Date().toISOString(),
    });
    setApplied(false);
    return { sourceText, mergedPatch, personnel };
  }, [text, activePass, aliasMap, currentCandidate, rosterJerseys]);

  /**
   * Pass 2+ consolidated action — parse personnel narration AND immediately
   * write the canonical pos* patch into proposal/draft state. Single button.
   * Same-slot conflicts, off-roster, and duplicate jerseys are surfaced via
   * toast + the inline issues panel and excluded from the patch. Existing-
   * field draft collisions still go through the standard collision dialog
   * (no silent overwrite). No commit happens here.
   */
  const handleUpdateProposal = useCallback(() => {
    const parsed = handleParse();
    if (!parsed) return;
    const { sourceText, mergedPatch, personnel } = parsed;

    // Auto-launch roster resolution dialog when off-roster jerseys were
    // surfaced. Preserves intended canonical slot + raw narration clause so
    // the assignment can continue against the intended slot once the jersey
    // is added to the roster. Coach can still cancel — blocked state is
    // preserved.
    if (personnel && personnel.offRosterJerseys.length > 0) {
      const pending: OffRosterPending[] = personnel.report
        .filter((r) => r.status === "off_roster" && r.jersey != null)
        .map((r) => ({
          jersey: r.jersey as number,
          canonicalField: r.canonicalField,
          rawSentence: r.rawSentence,
        }));
      setRosterResolve({ pending, sourceText });
      // Fall through and apply any non-off-roster fields that did make it
      // into mergedPatch so partial progress isn't lost.
    }

    if (Object.keys(mergedPatch).length === 0) {
      // Nothing applied yet, but roster dialog (if any) is now open.
      if (!personnel || personnel.offRosterJerseys.length === 0) {
        toast.info("No personnel assignments recognized in narration.");
      }
      return;
    }
    // Build per-field evidence from the personnel parse report so each
    // narration-updated pos* slot carries its source clause as transcript
    // evidence (visible via the Parse provenance badge tooltip).
    const evidence: Record<string, { snippet: string }> = {};
    if (personnel) {
      for (const entry of personnel.report) {
        if (entry.status !== "matched" || !entry.canonicalField) continue;
        evidence[entry.canonicalField] = { snippet: entry.rawSentence };
        if (entry.movedFrom) {
          evidence[entry.movedFrom] = {
            snippet: `moved #${entry.jersey} → ${entry.canonicalField}`,
          };
        }
      }
    }
    const collisions = applySystemPatch(mergedPatch, {
      fillOnly: true,
      evidence,
      source: "deterministic_parse",
    });
    if (collisions.length > 0) {
      const nonCollisionCount = Object.keys(mergedPatch).length - collisions.length;
      setCollisionState({
        collisions: collisions.map((c: SystemPatchCollision) => ({
          fieldName: c.fieldName,
          currentValue: c.currentValue,
          proposedValue: c.proposedValue,
        })),
        nonCollisionCount,
        fullPatch: mergedPatch,
      });
    } else {
      setApplied(true);
      toast.success(`Updated proposal: ${Object.keys(mergedPatch).length} field(s)`);
      onApply?.(sourceText, mergedPatch);
    }
  }, [handleParse, applySystemPatch, onApply]);

  /**
   * Handle roster-resolution outcome. Re-parses the original narration with
   * an extended roster set (the jerseys just added) and applies ONLY the
   * newly-unblocked off-roster assignments to proposal state. Same-slot
   * conflicts and duplicates remain blocked. No silent commit.
   */
  const handleRosterResolved = useCallback((addedJerseys: number[]) => {
    const ctx = rosterResolve;
    setRosterResolve(null);
    if (!ctx || addedJerseys.length === 0) return;

    // Build extended roster set: current + just-added jerseys (state may
    // not have flushed yet through reload()).
    const extendedRoster = new Set<number>(rosterJerseys);
    for (const j of addedJerseys) extendedRoster.add(j);

    const personnel = parsePersonnelNarration(
      ctx.sourceText,
      aliasMap,
      currentCandidate ?? null,
      extendedRoster,
    );

    // Restrict re-application to the jerseys we just added — do not retread
    // assignments that were already applied (or already blocked for other
    // reasons like same-slot conflicts).
    const addedSet = new Set(addedJerseys);
    const reapplyPatch: Record<string, number | null> = {};
    const evidence: Record<string, { snippet: string }> = {};
    for (const entry of personnel.report) {
      if (entry.status !== "matched" || !entry.canonicalField || entry.jersey == null) continue;
      if (!addedSet.has(entry.jersey)) continue;
      reapplyPatch[entry.canonicalField] = entry.jersey;
      evidence[entry.canonicalField] = { snippet: entry.rawSentence };
      if (entry.movedFrom) {
        reapplyPatch[entry.movedFrom] = null;
        evidence[entry.movedFrom] = {
          snippet: `moved #${entry.jersey} → ${entry.canonicalField}`,
        };
      }
    }

    if (Object.keys(reapplyPatch).length === 0) {
      toast.info("Roster updated, but no eligible assignments to re-apply.");
      return;
    }

    const collisions = applySystemPatch(reapplyPatch, {
      fillOnly: true,
      evidence,
      source: "deterministic_parse",
    });
    if (collisions.length > 0) {
      const nonCollisionCount = Object.keys(reapplyPatch).length - collisions.length;
      setCollisionState({
        collisions: collisions.map((c: SystemPatchCollision) => ({
          fieldName: c.fieldName,
          currentValue: c.currentValue,
          proposedValue: c.proposedValue,
        })),
        nonCollisionCount,
        fullPatch: reapplyPatch,
      });
    } else {
      toast.success(
        `Re-applied ${Object.keys(reapplyPatch).length} field(s) after roster update.`,
      );
      // Replace the visible personnel snapshot with the fresh re-parse so
      // the blocked banner render path is driven by current blocked arrays /
      // report state instead of partially patched stale snapshot data.
      // Any unresolved jerseys remain blocked because they are still absent
      // from the extended roster used for this re-parse.
      setLastSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          result: {
            ...prev.result,
            patch: { ...prev.result.patch, ...personnel.patch },
          },
          personnel,
        };
      });
      onApply?.(ctx.sourceText, reapplyPatch);
    }
  }, [rosterResolve, rosterJerseys, aliasMap, currentCandidate, applySystemPatch, onApply]);

  const handleRosterResolveCancel = useCallback(() => {
    setRosterResolve(null);
    toast.info("Off-roster assignments remain blocked.");
  }, []);

  /**
   * Apply to Draft — transfers frozen parse snapshot into draft via applySystemPatch.
   * Collisions are surfaced via the standard RawInputCollisionDialog.
   */
  const handleApplyToDraft = useCallback(() => {
    if (!lastSnapshot || isDirtyAfterParse || applied) return;

    const patch = { ...lastSnapshot.result.patch };
    if (Object.keys(patch).length === 0) return;

    const collisions = applySystemPatch(patch, { fillOnly: true });

    if (collisions.length > 0) {
      // Show collision dialog for user to pick overrides
      const nonCollisionCount = Object.keys(patch).length - collisions.length;
      setCollisionState({
        collisions: collisions.map((c: SystemPatchCollision) => ({
          fieldName: c.fieldName,
          currentValue: c.currentValue,
          proposedValue: c.proposedValue,
        })),
        nonCollisionCount,
        fullPatch: patch,
      });
    } else {
      setApplied(true);
      toast.success(`Applied ${Object.keys(patch).length} field(s) to draft`);
      onApply?.(lastSnapshot.sourceText, patch);
    }
  }, [lastSnapshot, isDirtyAfterParse, applied, applySystemPatch]);

  /** Handle collision resolution — apply selected overrides */
  const handleCollisionConfirm = useCallback((selectedFields: Set<string>) => {
    if (!collisionState) return;

    // Build override patch from selected collision fields
    const overridePatch: Record<string, unknown> = {};
    for (const c of collisionState.collisions) {
      if (selectedFields.has(c.fieldName)) {
        overridePatch[c.fieldName] = c.proposedValue;
      }
    }

    if (Object.keys(overridePatch).length > 0) {
      applySystemPatch(overridePatch, { fillOnly: false });
    }

    const overrideCount = Object.keys(overridePatch).length;
    const skippedCount = collisionState.collisions.length - overrideCount;
    const totalApplied = collisionState.nonCollisionCount + overrideCount;
    const msg = skippedCount > 0
      ? `Applied ${totalApplied} field(s) to draft. ${skippedCount} conflict(s) left unchanged.`
      : `Applied ${totalApplied} field(s) to draft.`;
    toast.success(msg);
    setApplied(true);
    setCollisionState(null);
    // Fire onApply with the full patch (including resolved collisions)
    if (lastSnapshot) {
      onApply?.(lastSnapshot.sourceText, collisionState.fullPatch);
    }
  }, [collisionState, applySystemPatch]);

  const handleCollisionCancel = useCallback(() => {
    if (!collisionState) return;
    const { nonCollisionCount, collisions } = collisionState;
    // Non-collision fields were already applied by the first applySystemPatch call.
    if (nonCollisionCount > 0) {
      setApplied(true);
      toast.info(
        `${nonCollisionCount} field(s) applied. ${collisions.length} conflicting field(s) left unchanged.`
      );
    } else {
      toast.info(`${collisions.length} conflicting field(s) left unchanged. No fields were applied.`);
    }
    setCollisionState(null);
  }, [collisionState]);

  const isPass2Plus = (activePass ?? 1) >= 2;

  return (
    <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-muted/30">
      {/* Surface label — makes the authoritative narration surface explicit. */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {isPass2Plus ? "Pass 2 · Personnel narration" : "Transcript"}
        </span>
        {isPass2Plus && (
          <span className="text-[10px] text-muted-foreground">
            Authoritative input for personnel assignments
          </span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {supported && (
            <Button
              size="sm"
              variant={listening ? "destructive" : "outline"}
              className="h-7 text-xs gap-1"
              onClick={toggleListening}
            >
              {listening ? (
                <>
                  <MicOff className="h-3 w-3" />
                  Stop
                </>
              ) : (
                <>
                  <Mic className="h-3 w-3" />
                  Dictate
                </>
              )}
            </Button>
          )}

          {listening && (
            <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
              Listening…
            </span>
          )}

          {!listening && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={() => setShowTyped((v) => !v)}
            >
              <Keyboard className="h-3 w-3" />
              {showTyped ? "Hide keyboard" : "Type"}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Pass 2+: single consolidated "Update Proposal" action.
              Pass 1: legacy two-step Parse → Apply to Draft. */}
          {isPass2Plus ? (
            hasParseableText && !listening && (
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs gap-1"
                onClick={handleUpdateProposal}
                title="Parse narration and update proposal immediately. No commit."
              >
                <Wand2 className="h-3 w-3" />
                Update Proposal
              </Button>
            )
          ) : (
            <>
              {hasParseableText && !listening && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs gap-1"
                  onClick={handleParse}
                >
                  <Play className="h-3 w-3" />
                  Parse
                </Button>
              )}
              {hasPatchFields && !listening && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={handleApplyToDraft}
                  disabled={!canApply}
                >
                  <ArrowRight className="h-3 w-3" />
                  Apply to Draft
                </Button>
              )}
            </>
          )}

          {hasContent && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={handleClear}
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Editable transcript area */}
      <Textarea
        className={cn(
          "text-xs font-mono min-h-[60px] resize-y bg-background/50",
          listening && "border-destructive/30"
        )}
        placeholder={
          listening
            ? "Listening — speech will appear here…"
            : (activePass ?? 1) >= 2
              ? 'Pass 2 personnel narration — type or dictate, then press Parse.\nExamples:\n  • "20 is playing RG"\n  • "number one is at QB"\n  • "7 is playing left guard"\n  • "20 moves to H"'
              : "Transcript working draft — type or dictate, then press Parse."
        }
        value={text + (interim ? (text ? "\n" : "") + interim : "")}
        onChange={(e) => {
          if (!listening) setText(e.target.value);
        }}
        readOnly={listening}
      />

      {/* Typed line input */}
      {showTyped && !listening && (
        <div className="flex gap-1.5">
          <Textarea
            className="text-xs font-mono h-10 min-h-[40px] resize-none flex-1"
            placeholder="Type a line and press Enter to add…"
            value={typedLine}
            onChange={(e) => setTypedLine(e.target.value)}
            onKeyDown={handleTypedKeyDown}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-10 text-xs px-2"
            onClick={handleTypedSubmit}
            disabled={!typedLine.trim()}
          >
            Add
          </Button>
        </div>
      )}

      {/* Parse status indicators */}
      {isDirtyAfterParse && (
        <div className="flex items-center gap-1 text-[10px] text-destructive">
          <AlertTriangle className="h-3 w-3" />
          Transcript changed since last parse. Press Parse to re-parse.
        </div>
      )}

      {hasParsed && !isDirtyAfterParse && !applied && (
        <p className="text-[10px] text-muted-foreground">
          ✓ Parsed {Object.keys(lastSnapshot.result.patch).length} field(s)
          {lastSnapshot.result.report.filter((r) => r.status === "unrecognized").length > 0 &&
            ` · ${lastSnapshot.result.report.filter((r) => r.status === "unrecognized").length} unrecognized`}
          {lastSnapshot.personnel && lastSnapshot.personnel.report.length > 0 && (
            <>
              {" · "}
              {lastSnapshot.personnel.report.filter((r) => r.status === "matched").length} personnel matched
              {lastSnapshot.personnel.report.filter((r) => r.status === "unrecognized").length > 0 &&
                ` (${lastSnapshot.personnel.report.filter((r) => r.status === "unrecognized").length} unrecognized)`}
              {lastSnapshot.personnel.offRosterJerseys.length > 0 &&
                ` · ${lastSnapshot.personnel.offRosterJerseys.length} off-roster blocked`}
              {lastSnapshot.personnel.duplicateJerseys.length > 0 &&
                ` · ${lastSnapshot.personnel.duplicateJerseys.length} duplicate blocked`}
              {lastSnapshot.personnel.sameSlotConflicts.length > 0 &&
                ` · ${lastSnapshot.personnel.sameSlotConflicts.length} same-slot conflict(s) blocked`}
            </>
          )}
        </p>
      )}

      {/* Personnel issues panel — visible whenever roster, duplicate, or same-slot conflicts were detected. */}
      {hasParsed && lastSnapshot.personnel &&
        (lastSnapshot.personnel.offRosterJerseys.length > 0 ||
          lastSnapshot.personnel.duplicateJerseys.length > 0 ||
          lastSnapshot.personnel.sameSlotConflicts.length > 0) && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-2 space-y-1">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Personnel assignments blocked — resolve before updating proposal
            </div>
            <ul className="text-[10px] text-destructive/90 space-y-0.5 pl-4 list-disc">
              {lastSnapshot.personnel.report
                .filter((r) => r.status === "off_roster" || r.status === "duplicate" || r.status === "same_slot_conflict")
                .map((r, i) => {
                  const slotLabel = r.canonicalField
                    ? (PERSONNEL_LABELS[r.canonicalField] ?? r.canonicalField)
                    : "?";
                  const alias = r.canonicalField ? getAliasFor(r.canonicalField, aliasMap) : null;
                  const slotDisplay = alias ? `${slotLabel} (${alias})` : slotLabel;
                  return (
                    <li key={i}>
                      <span className="font-mono">"{r.rawSentence}"</span> — {r.reason}
                      {r.canonicalField && (
                        <>
                          {" "}→ would target <span className="font-mono">{slotDisplay}</span>
                        </>
                      )}
                    </li>
                  );
                })}
            </ul>
            {lastSnapshot.personnel.offRosterJerseys.length > 0 && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-[10px] text-destructive/80">
                  Off-roster jerseys block their assignments. Resolve to add them to the roster and re-apply.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] gap-1 shrink-0"
                  onClick={() => {
                    if (!lastSnapshot?.personnel) return;
                    const pending: OffRosterPending[] = lastSnapshot.personnel.report
                      .filter((r) => r.status === "off_roster" && r.jersey != null)
                      .map((r) => ({
                        jersey: r.jersey as number,
                        canonicalField: r.canonicalField,
                        rawSentence: r.rawSentence,
                      }));
                    setRosterResolve({ pending, sourceText: lastSnapshot.sourceText });
                  }}
                >
                  Resolve off-roster
                </Button>
              </div>
            )}
          </div>
        )}

      {applied && (
        <p className="text-[10px] text-muted-foreground">
          ✓ Applied to draft. Edit transcript and re-parse for new data.
        </p>
      )}

      {/* Parse result preview */}
      {hasParsed && Object.keys(lastSnapshot.result.patch).length > 0 && (
        <div className="rounded border border-border/30 bg-background/50 px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground mb-1 font-medium">
            {applied ? "Applied fields:" : "Parse result (preview — press Apply to Draft):"}
          </p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(lastSnapshot.result.patch).map(([field, value]) => (
              <span
                key={field}
                className={cn(
                  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono",
                  applied
                    ? "bg-primary/10 text-primary"
                    : "bg-accent/50 text-accent-foreground"
                )}
              >
                {field}: {String(value)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasContent && !listening && !showTyped && (
        <p className="text-[10px] text-muted-foreground text-center py-1">
          Tap Dictate or Type to begin capturing transcript.
        </p>
      )}

      {/* Collision dialog */}
      {collisionState && (
        <RawInputCollisionDialog
          open
          collisions={collisionState.collisions}
          nonCollisionCount={collisionState.nonCollisionCount}
          onConfirm={handleCollisionConfirm}
          onCancel={handleCollisionCancel}
        />
      )}

      {/* Roster resolution dialog — preserves intended slot context for
          off-roster jerseys surfaced by Pass 2 narration. */}
      {rosterResolve && (
        <RosterResolveDialog
          open
          pending={rosterResolve.pending}
          aliasMap={aliasMap}
          addPlayer={addPlayer}
          onResolved={handleRosterResolved}
          onCancel={handleRosterResolveCancel}
        />
      )}
    </div>
  );
}
