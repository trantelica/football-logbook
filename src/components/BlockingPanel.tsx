/**
 * BlockingPanel — Pass 3 UI for blocking grades.
 *
 * Layout:
 *   1. Pass 3 banner
 *   2. Gating banners (no committed row / not offense)
 *   3. Pass 3 grade narration entry
 *   4. Read-only play context (from committedRow)
 *   5. Read-only personnel (from committedRow)
 *   6. Grade grid — ordered rows with visual indicators and provenance tags.
 *
 * Canonical grade field keys unchanged: gradeLT, gradeLG, gradeC, gradeRG,
 * gradeRT, gradeX, gradeY, grade1..grade4.
 */

import React, { useState, useCallback, useEffect } from "react";
import { useTransaction } from "@/engine/transaction";
import { useRoster } from "@/engine/rosterContext";
import { useSeason } from "@/engine/seasonContext";
import { getSeasonConfig } from "@/engine/db";
import { GRADE_FIELDS, GRADE_LABELS } from "@/engine/personnel";
import { parseGradeNarration, normalizeGradePatchKeys } from "@/engine/gradeNarrationParser";
import { parseGradeBulkCommand, computeBulkFillPatch } from "@/engine/gradeBulkCommand";
import { useTranscriptCapture } from "@/hooks/useTranscriptCapture";
import { getAliasFor, type PositionAliasMap } from "@/engine/positionAliases";
import { fetchAiGradeProposal, type AiGradeConflict } from "@/engine/aiGradeClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock, AlertTriangle, Wand2, Trash2, Mic, MicOff, Terminal, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Map grade field → corresponding personnel position field */
const GRADE_TO_POS: Record<string, string> = {
  gradeLT: "posLT", gradeLG: "posLG", gradeC: "posC", gradeRG: "posRG", gradeRT: "posRT",
  gradeX: "posX", gradeY: "posY", grade1: "pos1", grade2: "pos2", grade3: "pos3", grade4: "pos4",
};

const CONTEXT_FIELDS = [
  { key: "odk", label: "ODK" },
  { key: "yardLn", label: "Yard Ln" },
  { key: "dn", label: "Down" },
  { key: "dist", label: "Dist" },
  { key: "result", label: "Result" },
  { key: "offForm", label: "Off Form" },
  { key: "offPlay", label: "Off Play" },
  { key: "motion", label: "Motion" },
];

const GRADE_OPTIONS = ["-3", "-2", "-1", "0", "1", "2", "3"];

/** Ordered grade field layout: Row1 (OL+Y), Row2 (X,3,2,4), Row3 (1) */
const GRADE_ROW_1 = ["gradeLT", "gradeLG", "gradeC", "gradeRG", "gradeRT", "gradeY"];
const GRADE_ROW_2 = ["gradeX", "grade3", "grade2", "grade4"];
const GRADE_ROW_3 = ["grade1"];

// ── Grade Visual Indicator ─────────────────────────────────────────────────

/** Fixed-width indicator container so controls don't jitter */
const INDICATOR_BOX = "inline-flex items-center justify-center w-[28px] h-4 shrink-0 gap-px";

function GradeIndicator({ value }: { value: number | null | undefined }) {
  if (value == null) {
    return (
      <span className={cn(INDICATOR_BOX)}>
        <span className="inline-flex items-center justify-center w-3 h-3 rounded-full border border-border bg-muted/50 text-[7px] text-muted-foreground leading-none">—</span>
      </span>
    );
  }
  if (value === 0) {
    return (
      <span className={cn(INDICATOR_BOX)}>
        <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-muted-foreground/40 border border-muted-foreground/30" title="0" />
      </span>
    );
  }
  const abs = Math.min(Math.abs(value), 3);
  const positive = value > 0;
  const color = positive ? "text-parsed-foreground" : "text-warning";
  return (
    <span className={cn(INDICATOR_BOX, color)} title={String(value)}>
      {Array.from({ length: abs }, (_, i) => (
        <span key={i} className="text-[12px] leading-none font-bold">
          {positive ? "▲" : "▼"}
        </span>
      ))}
    </span>
  );
}

/** Grade indicator for dropdown option */
function GradeOptionIndicator({ value }: { value: string }) {
  const num = value === "__none__" ? null : Number(value);
  return <GradeIndicator value={num} />;
}

export function BlockingPanel() {
  const {
    candidate,
    updateField,
    applySystemPatch,
    selectedSlotNum,
    committedPlays,
    inlineErrors,
    commitErrors,
    state,
    touchedFields,
    deterministicParseFields,
    aiProposedFields,
    proposalMeta,
  } = useTransaction();
  const { roster } = useRoster();
  const { activeSeason } = useSeason();

  const isProposal = state === "proposal";

  // Load season position-alias map (translation/display only)
  const [aliasMap, setAliasMap] = useState<PositionAliasMap>({});
  useEffect(() => {
    let cancelled = false;
    if (!activeSeason?.seasonId) {
      setAliasMap({});
      return;
    }
    getSeasonConfig(activeSeason.seasonId).then((cfg) => {
      if (cancelled) return;
      setAliasMap((cfg?.positionAliases ?? {}) as PositionAliasMap);
    });
    return () => { cancelled = true; };
  }, [activeSeason?.seasonId]);

  // Find committedRow — canonical source for ODK gating and personnel display
  const committedRow = selectedSlotNum != null
    ? committedPlays.find((p) => p.playNum === selectedSlotNum) ?? null
    : null;

  const cr = committedRow as unknown as Record<string, unknown> | null;
  const c = candidate as unknown as Record<string, unknown>;
  const errors = { ...inlineErrors, ...commitErrors };

  // Roster lookup helper
  const getPlayerName = (jersey: number | null | undefined): string | null => {
    if (jersey == null) return null;
    const entry = roster.find((r) => r.jerseyNumber === jersey);
    return entry?.playerName ?? null;
  };

  // Determine gating state
  const noCommittedRow = committedRow === null;
  const notOffense = committedRow != null && committedRow.odk !== "O";
  const gradesDisabled = noCommittedRow || notOffense || isProposal;

  // ── Pass 3 grade narration entry ────────────────────────────────────────
  const {
    text: dictatedText,
    interim,
    listening,
    supported: dictationSupported,
    setText: setDictatedText,
    toggleListening,
    clear: clearDictation,
  } = useTranscriptCapture();

  const narrationText = dictatedText;
  const setNarrationText = setDictatedText;
  const [lastReport, setLastReport] = useState<ReturnType<typeof parseGradeNarration>["report"] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiConflicts, setAiConflicts] = useState<AiGradeConflict[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lastAiAppliedCount, setLastAiAppliedCount] = useState<number | null>(null);

  // Unresolved grade fields = canonical grade fields with no value in candidate.
  const unresolvedGradeFields = React.useMemo(() => {
    return GRADE_FIELDS.filter((f) => {
      const v = (c as Record<string, unknown>)[f];
      return v == null || v === "";
    });
  }, [c]);
  const hasUnresolvedGradeFields = unresolvedGradeFields.length > 0;

  // Run Pass 3 AI assist scoped to grade fields still unresolved after the
  // deterministic parser ran in this Update Proposal click.
  // `parserResolvedNow` is the patch the parser just applied (authoritative
  // for this run — applySystemPatch's React state hasn't flushed yet).
  const runAiAssistAfterParser = useCallback(
    async (trimmed: string, parserResolvedNow: Record<string, number>) => {
      const unresolvedAfter = GRADE_FIELDS.filter((f) => {
        if (Object.prototype.hasOwnProperty.call(parserResolvedNow, f)) return false;
        const v = (c as Record<string, unknown>)[f];
        return v == null || v === "";
      });
      if (unresolvedAfter.length === 0) return;

      setAiBusy(true);
      setAiError(null);
      setAiConflicts([]);
      setLastAiAppliedCount(null);
      try {
        const parserPatch: Record<string, number> = { ...parserResolvedNow };
        for (const gf of GRADE_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(parserPatch, gf)) continue;
          if (!deterministicParseFields.has(gf)) continue;
          const v = (c as Record<string, unknown>)[gf];
          if (v == null || v === "") continue;
          const n = Number(v);
          if (Number.isFinite(n)) parserPatch[gf] = n;
        }
        const labels: Record<string, string> = {};
        for (const gf of GRADE_FIELDS) labels[gf] = GRADE_LABELS[gf];
        const res = await fetchAiGradeProposal({
          narrationText: trimmed,
          parserPatch,
          unresolvedFields: unresolvedAfter,
          positionAliases: aliasMap,
          positionLabels: labels,
        });
        if (res.error) {
          setAiError(res.error);
          toast.error(res.error);
          return;
        }
        setAiConflicts(res.conflicts);
        const keys = Object.keys(res.patch);
        if (keys.length > 0) {
          const aiEvidence = Object.fromEntries(
            keys.map((f) => [f, { snippet: trimmed }]),
          );
          applySystemPatch(res.patch, {
            fillOnly: true,
            source: "ai_proposed",
            evidence: aiEvidence,
          });
        }
        setLastAiAppliedCount(keys.length);
        if (keys.length > 0 || res.conflicts.length > 0) {
          const conflictNote = res.conflicts.length > 0
            ? ` ${res.conflicts.length} conflict(s) need coach review.`
            : "";
          toast.success(`AI assist proposed ${keys.length} grade(s).${conflictNote}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "AI assist failed.";
        setAiError(msg);
        toast.error(msg);
      } finally {
        setAiBusy(false);
      }
    },
    [c, deterministicParseFields, aliasMap, applySystemPatch],
  );

  const handleApplyNarration = useCallback(async () => {
    const trimmed = narrationText.trim();
    if (!trimmed) return;
    if (gradesDisabled) {
      toast.error("Grades are not currently editable.");
      return;
    }

    // ── Pass 3 bulk command (state-aware fill of empty grades) ──────────
    const bulk = parseGradeBulkCommand(trimmed, aliasMap);
    if (bulk) {
      if (bulk.status === "unresolved_exception") {
        toast.error(bulk.reason);
        setLastReport(null);
        return;
      }
      if (bulk.status === "out_of_range" || bulk.status === "no_value") {
        toast.error(bulk.reason);
        setLastReport(null);
        return;
      }
      // matched
      const { patch: bulkPatch, targets } = computeBulkFillPatch(
        bulk.value,
        bulk.exceptions,
        cr,
        c,
      );
      if (targets.length === 0) {
        toast.info("No empty grade fields to fill.");
        setLastReport(null);
        return;
      }
      const bulkEvidence = Object.fromEntries(
        targets.map((f) => [f, { snippet: trimmed }]),
      );
      applySystemPatch(bulkPatch, {
        fillOnly: false,
        source: "deterministic_parse",
        evidence: bulkEvidence,
      });
      toast.success(`Applied grade ${bulk.value} to ${targets.length} empty field(s).`);
      // Bulk fill consumes empty grades; nothing meaningful for AI to add.
      return;
    }

    // ── Normal per-clause grade narration ───────────────────────────────
    const { patch, report } = parseGradeNarration(trimmed, aliasMap);
    const normalizedPatch = normalizeGradePatchKeys(patch);
    setLastReport(report);
    const matchedCount = report.filter((r) => r.status === "matched").length;
    const parserResolvedNow: Record<string, number> = {};
    if (matchedCount > 0) {
      const evidence = Object.fromEntries(
        report
          .filter((entry) => entry.status === "matched" && entry.canonicalField)
          .map((entry) => [entry.canonicalField as string, { snippet: entry.rawClause }]),
      );
      applySystemPatch(normalizedPatch, {
        fillOnly: false,
        source: "deterministic_parse",
        evidence,
      });
      for (const [k, v] of Object.entries(normalizedPatch)) {
        const n = Number(v);
        if (Number.isFinite(n)) parserResolvedNow[k] = n;
      }
      const blockedCount = report.length - matchedCount;
      toast.success(
        blockedCount > 0
          ? `Applied ${matchedCount} grade(s) to proposal. ${blockedCount} clause(s) skipped.`
          : `Applied ${matchedCount} grade(s) to proposal.`,
      );
    } else {
      toast.info("No grade entries recognized.");
    }

    // ── Auto-chain Pass 3 AI assist for remaining unresolved grade fields ─
    await runAiAssistAfterParser(trimmed, parserResolvedNow);
  }, [
    narrationText, gradesDisabled, applySystemPatch, aliasMap, cr, c,
    runAiAssistAfterParser,
  ]);

  const handleClearNarration = useCallback(() => {
    clearDictation();
    setLastReport(null);
    setAiConflicts([]);
    setAiError(null);
    setLastAiAppliedCount(null);
  }, [clearDictation]);

  // ── Pass 3 AI Assist — coach-initiated only; advisory only ─────────────
  const handleAiAssist = useCallback(async () => {
    const trimmed = narrationText.trim();
    if (!trimmed || gradesDisabled || !hasUnresolvedGradeFields) return;
    setAiBusy(true);
    setAiError(null);
    setAiConflicts([]);
    setLastAiAppliedCount(null);
    try {
      // Snapshot of grade fields the deterministic parser already resolved.
      const parserPatch: Record<string, number> = {};
      for (const gf of GRADE_FIELDS) {
        if (!deterministicParseFields.has(gf)) continue;
        const v = (c as Record<string, unknown>)[gf];
        if (v == null || v === "") continue;
        const n = Number(v);
        if (Number.isFinite(n)) parserPatch[gf] = n;
      }
      const labels: Record<string, string> = {};
      for (const gf of GRADE_FIELDS) labels[gf] = GRADE_LABELS[gf];
      const res = await fetchAiGradeProposal({
        narrationText: trimmed,
        parserPatch,
        unresolvedFields: unresolvedGradeFields,
        positionAliases: aliasMap,
        positionLabels: labels,
      });
      if (res.error) {
        setAiError(res.error);
        toast.error(res.error);
        return;
      }
      setAiConflicts(res.conflicts);
      const keys = Object.keys(res.patch);
      if (keys.length === 0 && res.conflicts.length === 0) {
        toast.info("AI assist returned no new grade suggestions.");
        setLastAiAppliedCount(0);
        return;
      }
      if (keys.length > 0) {
        const aiEvidence = Object.fromEntries(
          keys.map((f) => [f, { snippet: trimmed }]),
        );
        applySystemPatch(res.patch, {
          fillOnly: true,
          source: "ai_proposed",
          evidence: aiEvidence,
        });
      }
      setLastAiAppliedCount(keys.length);
      const conflictNote = res.conflicts.length > 0
        ? ` ${res.conflicts.length} conflict(s) need coach review.`
        : "";
      toast.success(`AI assist proposed ${keys.length} grade(s).${conflictNote}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI assist failed.";
      setAiError(msg);
      toast.error(msg);
    } finally {
      setAiBusy(false);
    }
  }, [
    narrationText, gradesDisabled, hasUnresolvedGradeFields, deterministicParseFields,
    c, unresolvedGradeFields, aliasMap, applySystemPatch,
  ]);

  // ── Provenance badge helper (exact match with DraftPanel pattern) ──────
  const renderGradeProvenance = (fieldName: string): React.ReactNode => {
    if (deterministicParseFields.has(fieldName)) {
      const meta = proposalMeta.get(fieldName);
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-parsed-foreground bg-parsed-muted rounded px-1">
                <Terminal className="h-2.5 w-2.5" />Parse
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>From transcript parse. Editable.</p>
              {meta?.transcriptEvidence && (
                <p className="text-[10px] mt-1 opacity-80 font-mono">
                  <Info className="h-2.5 w-2.5 inline mr-0.5" />
                  "{meta.transcriptEvidence}"
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    if (aiProposedFields.has(fieldName)) {
      const meta = proposalMeta.get(fieldName);
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-predicted-foreground bg-predicted-muted rounded px-1">
                <Sparkles className="h-2.5 w-2.5" />AI
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Proposed by AI assist. Coach-editable; not yet committed.</p>
              {meta?.transcriptEvidence && (
                <p className="text-[10px] mt-1 opacity-80 font-mono">
                  <Info className="h-2.5 w-2.5 inline mr-0.5" />
                  "{meta.transcriptEvidence}"
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return null;
  };

  // ── Grade field label with alias helper ────────────────────────────────
  const gradeLabel = (gradeField: string): { primary: string; alias: string | null } => {
    const posField = GRADE_TO_POS[gradeField];
    const alias = posField ? getAliasFor(posField, aliasMap) : null;
    return { primary: GRADE_LABELS[gradeField], alias };
  };

  // ── Compute Pass 3 overwrite diffs (committed non-null → different proposed) ──
  const overwriteDiffs = React.useMemo(() => {
    if (!committedRow) return [] as { field: string; label: string; before: number; after: number }[];
    const out: { field: string; label: string; before: number; after: number }[] = [];
    for (const gf of GRADE_FIELDS) {
      const beforeRaw = (cr as Record<string, unknown> | null)?.[gf];
      const afterRaw = (c as Record<string, unknown>)[gf];
      if (beforeRaw == null || beforeRaw === "") continue;
      if (afterRaw == null || afterRaw === "") continue;
      const before = Number(beforeRaw);
      const after = Number(afterRaw);
      if (Number.isFinite(before) && Number.isFinite(after) && before !== after) {
        out.push({ field: gf, label: GRADE_LABELS[gf] ?? gf, before, after });
      }
    }
    return out;
  }, [committedRow, cr, c]);
  const overwriteFieldSet = React.useMemo(
    () => new Set(overwriteDiffs.map((d) => d.field)),
    [overwriteDiffs],
  );

  // ── Render a single grade control ──────────────────────────────────────
  const renderGradeControl = (gradeField: string) => {
    const posField = GRADE_TO_POS[gradeField];
    const jersey = cr?.[posField] as number | null | undefined;
    const name = getPlayerName(jersey != null ? Number(jersey) : null);
    const value = c[gradeField];
    const error = errors[gradeField];
    const { primary, alias } = gradeLabel(gradeField);
    const numValue = value != null && value !== "" ? Number(value) : null;

    const playerDisplay = jersey != null
      ? `#${jersey}${name ? ` ${name}` : ""}`
      : "—";

    const isParsed = deterministicParseFields.has(gradeField);
    const isTouched = touchedFields.has(gradeField);
    const committedRaw = cr?.[gradeField];
    const committedNum = committedRaw != null && committedRaw !== "" ? Number(committedRaw) : null;
    const isOverwrite = overwriteFieldSet.has(gradeField);

    return (
      <div key={gradeField} className="space-y-1">
        {/* Label row: position + alias + provenance (no duplicate indicator) */}
        <div className="flex items-center gap-1.5 min-h-[18px] flex-wrap">
          <span className="text-[11px] font-semibold text-foreground">
            {primary}
            {alias && <span className="text-muted-foreground font-normal ml-0.5">({alias})</span>}
          </span>
          {renderGradeProvenance(gradeField)}
          {isOverwrite && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-proposal-foreground bg-proposal-muted border border-proposal/40 rounded px-1">
                    <AlertTriangle className="h-2.5 w-2.5" />Overwrite
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Changes a committed grade. Confirmation required on Commit.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {/* Player context */}
        <div className="text-[10px] text-muted-foreground truncate" title={playerDisplay}>
          {playerDisplay}
        </div>
        {/* Select with inline grade indicator (right-aligned, single indicator only) */}
        <Select
          value={value != null && String(value) !== "" ? String(value) : "__none__"}
          onValueChange={(v) => updateField(gradeField, v === "__none__" ? "" : v)}
          disabled={gradesDisabled}
        >
          <SelectTrigger className={cn(
            "h-8 text-sm font-mono [&>span:first-child]:flex [&>span:first-child]:items-center [&>span:first-child]:justify-between [&>span:first-child]:w-full [&>span:first-child]:!line-clamp-none [&>span:first-child]:!overflow-visible",
            isParsed && !isTouched && !error && !isOverwrite && "bg-parsed-muted border-parsed-border",
            isTouched && !error && !isOverwrite && "bg-field-touched",
            isOverwrite && !error && "bg-proposal-muted border-proposal/40",
            error && "border-destructive",
          )}>
            {/* Custom display: numeric value left, single indicator right */}
            <span className="flex items-center justify-between w-full min-w-0">
              <span className="shrink-0 whitespace-nowrap">{numValue != null ? String(numValue) : "—"}</span>
              <GradeIndicator value={numValue} />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              <span className="flex items-center gap-2">— <GradeOptionIndicator value="__none__" /></span>
            </SelectItem>
            {GRADE_OPTIONS.map((g) => (
              <SelectItem key={g} value={g}>
                <span className="flex items-center gap-2">
                  {g} <GradeOptionIndicator value={g} />
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isOverwrite && committedNum != null && numValue != null && (
          <p className="text-[10px] text-proposal-foreground font-mono">
            Committed: {committedNum} → Proposed: {numValue}
          </p>
        )}
        {error && <p className="text-[10px] text-destructive">{error}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Section 1: Quiet pass-helper eyebrow (normalized; no green callout) */}
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pass 3 · Blocking &amp; Grading
        </span>
        <span className="text-[10px] text-muted-foreground">Offense plays only</span>
      </div>

      {/* Gate banners */}
      {noCommittedRow && (
        <div className="flex items-center gap-2 text-xs rounded px-3 py-2 bg-proposal/15 text-proposal-foreground border border-proposal/30">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Commit Pass 1 first to enable grading.
        </div>
      )}
      {notOffense && (
        <div className="flex items-center gap-2 text-xs rounded px-3 py-2 bg-muted text-muted-foreground border border-border">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Not applicable (ODK ≠ O). Blocking grades only apply to Offense plays.
        </div>
      )}

      {/* Section 2: Pass 3 grade narration entry — proposal-only */}
      {!noCommittedRow && !notOffense && (
        <div className="rounded-lg border border-border/60 p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pass 3 · Grade narration
            </span>
            <span className="text-[10px] text-muted-foreground">
              Proposal only · no commit
            </span>
          </div>
          <Textarea
            className={cn(
              "text-xs font-mono min-h-[50px] resize-y bg-background/50",
              listening && "border-destructive/30",
            )}
            placeholder={
              listening
                ? "Listening — speech will appear here…"
                : 'Enter grades. Examples:\n  • "LT 2, C -1, RG +3"\n  • "left tackle 2"\n  • "X 0, Y 1"'
            }
            value={narrationText + (interim ? (narrationText ? "\n" : "") + interim : "")}
            onChange={(e) => {
              if (!listening) setNarrationText(e.target.value);
            }}
            readOnly={listening}
            disabled={gradesDisabled && !listening}
          />
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-2">
              {dictationSupported && (
                <Button
                  size="sm"
                  variant={listening ? "destructive" : "outline"}
                  className="h-7 text-xs gap-1"
                  onClick={toggleListening}
                  disabled={gradesDisabled && !listening}
                  title={listening ? "Stop dictation" : "Dictate grade narration"}
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
            </div>
            <div className="flex items-center gap-1">
              {narrationText && !listening && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] gap-1 text-muted-foreground"
                  onClick={handleClearNarration}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                  Clear
                </Button>
              )}
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs gap-1"
                onClick={handleApplyNarration}
                disabled={gradesDisabled || !narrationText.trim() || listening || aiBusy}
                title="Parse grade narration, then auto-run AI assist for any remaining unresolved grades. No commit."
              >
                <Wand2 className="h-3 w-3" />
                {aiBusy ? "Updating…" : "Update Proposal"}
              </Button>
              {hasUnresolvedGradeFields && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={handleAiAssist}
                  disabled={
                    gradesDisabled ||
                    !narrationText.trim() ||
                    listening ||
                    aiBusy
                  }
                  title="Re-run AI assist for unresolved grade fields. Advisory; never overwrites parser-resolved grades."
                  data-testid="pass3-ai-assist"
                >
                  <Sparkles className="h-3 w-3" />
                  {aiBusy ? "AI…" : "AI retry"}
                </Button>
              )}
            </div>
          </div>
          {lastReport && lastReport.length > 0 && (
            <div className="space-y-1">
              {(() => {
                const skipped = lastReport.filter((r) => r.status !== "matched");
                if (skipped.length === 0) return null;
                return (
                  <div className="rounded border border-destructive/40 bg-destructive/10 p-2 space-y-0.5">
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {skipped.length} clause(s) skipped
                    </div>
                    <ul className="text-[10px] text-destructive/90 pl-4 list-disc">
                      {skipped.map((r, i) => (
                        <li key={i}>
                          <span className="font-mono">"{r.rawClause}"</span> — {r.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </div>
          )}
          {aiError && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-[10px] text-destructive">
              <span className="font-semibold">AI assist error: </span>
              {aiError}
            </div>
          )}
          {aiConflicts.length > 0 && (
            <div
              className="rounded border border-proposal/40 bg-proposal-muted p-2 space-y-1"
              data-testid="pass3-ai-conflicts"
            >
              <div className="flex items-center gap-1 text-[10px] font-semibold text-proposal-foreground">
                <AlertTriangle className="h-3 w-3" />
                AI disagreed with parser on {aiConflicts.length} field(s) — coach review required
              </div>
              <ul className="text-[10px] text-proposal-foreground pl-4 list-disc font-mono">
                {aiConflicts.map((cf) => (
                  <li key={cf.field}>
                    {GRADE_LABELS[cf.field] ?? cf.field}: parser {cf.parserValue} ≠ AI {cf.aiValue}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-proposal-foreground/80">
                Parser value kept. Edit the grade manually to accept AI's suggestion.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Section 3: Play Context — intentionally removed. The global
          PlayContextHeader above the pass content already surfaces playNum /
          qtr / odk / dn / dist / yardLn / hash / offForm / offPlay, so this
          duplicate in-panel context block was redundant. Committed row data
          is unchanged. */}

      {/* Section 4: Personnel (committed) — intentionally hidden in Pass 3.
          Each grade control already shows the assigned #jersey / name beneath
          its position label, so this upper block was redundant. Committed
          personnel data is unchanged. */}


      {/* Section 5: Grade Grid — ordered rows */}
      {committedRow && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Blocking Grades</div>
            {overwriteDiffs.length > 0 && (
              <span className="text-[10px] text-proposal-foreground font-mono">
                {overwriteDiffs.length} overwrite{overwriteDiffs.length === 1 ? "" : "s"} pending
              </span>
            )}
          </div>

          {overwriteDiffs.length > 0 && (
            <div className="rounded border border-proposal/40 bg-proposal-muted px-3 py-2 text-[11px] text-proposal-foreground">
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                <AlertTriangle className="h-3 w-3" />
                This proposal changes committed grades
              </div>
              <div className="font-mono text-[10px] leading-snug">
                {overwriteDiffs.map((d, idx) => (
                  <span key={d.field}>
                    {idx > 0 && <span className="text-proposal-foreground/70">, </span>}
                    {d.label} {d.before} → {d.after}
                  </span>
                ))}
              </div>
              <div className="text-[10px] mt-1 text-proposal-foreground/80">
                You'll be asked to confirm on Commit.
              </div>
            </div>
          )}

          {/* Row 1: OL + Y */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">O-Line + Y</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {GRADE_ROW_1.map(renderGradeControl)}
            </div>
          </div>

          {/* Row 2: Skill */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">Skill</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {GRADE_ROW_2.map(renderGradeControl)}
            </div>
          </div>

          {/* Row 3: QB / 1 */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">Signal Caller</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {GRADE_ROW_3.map(renderGradeControl)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
