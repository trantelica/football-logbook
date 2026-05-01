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
import { GRADE_FIELDS, GRADE_LABELS, PERSONNEL_POSITIONS, PERSONNEL_LABELS } from "@/engine/personnel";
import { parseGradeNarration, normalizeGradePatchKeys } from "@/engine/gradeNarrationParser";
import { useTranscriptCapture } from "@/hooks/useTranscriptCapture";
import { getAliasFor, type PositionAliasMap } from "@/engine/positionAliases";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock, AlertTriangle, Wand2, Trash2, Mic, MicOff, Terminal } from "lucide-react";
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

function GradeIndicator({ value }: { value: number | null | undefined }) {
  if (value == null) {
    return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-border bg-muted/50 text-[9px] text-muted-foreground">—</span>;
  }
  if (value === 0) {
    return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-400/80 dark:bg-yellow-500/60 border border-yellow-500/40" title="0" />;
  }
  const abs = Math.min(Math.abs(value), 3);
  const positive = value > 0;
  const color = positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
  // Render 1-3 triangles
  return (
    <span className={cn("inline-flex items-center gap-px", color)} title={String(value)}>
      {Array.from({ length: abs }, (_, i) => (
        <span key={i} className="text-[10px] leading-none font-bold">
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
    selectedSlotNum,
    committedPlays,
    inlineErrors,
    commitErrors,
    state,
    touchedFields,
    deterministicParseFields,
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

  const handleApplyNarration = useCallback(() => {
    const trimmed = narrationText.trim();
    if (!trimmed) return;
    if (gradesDisabled) {
      toast.error("Grades are not currently editable.");
      return;
    }
    const { patch, report } = parseGradeNarration(trimmed);
    const normalizedPatch = normalizeGradePatchKeys(patch);
    setLastReport(report);
    const matchedCount = report.filter((r) => r.status === "matched").length;
    if (matchedCount === 0) {
      toast.info("No grade entries recognized.");
      return;
    }
    for (const [field, value] of Object.entries(normalizedPatch)) {
      updateField(field, String(value));
    }
    const blockedCount = report.length - matchedCount;
    toast.success(
      blockedCount > 0
        ? `Applied ${matchedCount} grade(s) to proposal. ${blockedCount} clause(s) skipped.`
        : `Applied ${matchedCount} grade(s) to proposal.`,
    );
  }, [narrationText, gradesDisabled, updateField]);

  const handleClearNarration = useCallback(() => {
    clearDictation();
    setLastReport(null);
  }, [clearDictation]);

  // ── Provenance badge helper (consistent with DraftPanel pattern) ──────
  const renderGradeProvenance = (fieldName: string): React.ReactNode => {
    if (deterministicParseFields.has(fieldName)) {
      const meta = proposalMeta.get(fieldName);
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 rounded px-1">
                <Terminal className="h-2.5 w-2.5" />Parse
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>From grade narration parse. Editable.</p>
              {meta?.transcriptEvidence && (
                <p className="text-[10px] mt-1 opacity-80 font-mono">"{meta.transcriptEvidence}"</p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    if (touchedFields.has(fieldName)) {
      const val = c[fieldName];
      if (val != null && val !== "") {
        return (
          <span className="inline-flex items-center text-[9px] font-semibold text-foreground/60 bg-muted rounded px-1">
            Edited
          </span>
        );
      }
    }
    return null;
  };

  // ── Grade field label with alias helper ────────────────────────────────
  const gradeLabel = (gradeField: string): { primary: string; alias: string | null } => {
    const posField = GRADE_TO_POS[gradeField];
    const alias = posField ? getAliasFor(posField, aliasMap) : null;
    return { primary: GRADE_LABELS[gradeField], alias };
  };

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

    return (
      <div key={gradeField} className="space-y-1">
        {/* Label row: position + alias + provenance (no duplicate indicator) */}
        <div className="flex items-center gap-1.5 min-h-[18px]">
          <span className="text-[11px] font-semibold text-foreground">
            {primary}
            {alias && <span className="text-muted-foreground font-normal ml-0.5">({alias})</span>}
          </span>
          {renderGradeProvenance(gradeField)}
        </div>
        {/* Player context */}
        <div className="text-[10px] text-muted-foreground truncate" title={playerDisplay}>
          {playerDisplay}
        </div>
        {/* Select with inline grade indicator (right-aligned) */}
        <Select
          value={value != null && String(value) !== "" ? String(value) : "__none__"}
          onValueChange={(v) => updateField(gradeField, v === "__none__" ? "" : v)}
          disabled={gradesDisabled}
        >
          <SelectTrigger className={cn(
            "h-8 text-sm font-mono",
            isParsed && !isTouched && !error && "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700",
            isTouched && !error && "bg-field-touched",
            error && "border-destructive",
          )}>
            <span className="flex items-center justify-between w-full">
              <SelectValue placeholder="—" />
              <span className="ml-2 shrink-0"><GradeIndicator value={numValue} /></span>
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
        {error && <p className="text-[10px] text-destructive">{error}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Section 1: Banner */}
      <div className="rounded px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
        <div className="text-xs font-semibold uppercase tracking-wider">Pass 3 — Blocking & Grading</div>
        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">Applies to Offense plays only</div>
      </div>

      {/* Gate banners */}
      {noCommittedRow && (
        <div className="flex items-center gap-2 text-xs rounded px-3 py-2 bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
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
        <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-muted/30">
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
                disabled={gradesDisabled || !narrationText.trim() || listening}
                title="Parse grade narration and update proposal. No commit."
              >
                <Wand2 className="h-3 w-3" />
                Update Proposal
              </Button>
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
        </div>
      )}

      {/* Section 3: Play Context (read-only from committedRow) */}
      {committedRow && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Play Context</div>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-xs">
              <span className="text-muted-foreground">Play #</span>
              <Badge variant="secondary" className="ml-1 font-mono text-[11px]">
                <Lock className="h-2.5 w-2.5 mr-0.5" />{selectedSlotNum}
              </Badge>
            </div>
            {CONTEXT_FIELDS.map(({ key, label }) => {
              const val = cr?.[key];
              return (
                <div key={key} className="text-xs">
                  <span className="text-muted-foreground">{label}: </span>
                  <span className="font-mono font-medium">{val != null ? String(val) : "—"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 4: Personnel (read-only from committedRow) */}
      {committedRow && committedRow.odk === "O" && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Personnel (Committed)</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
            {PERSONNEL_POSITIONS.map((pos) => {
              const jersey = cr?.[pos] as number | null | undefined;
              const name = getPlayerName(jersey != null ? Number(jersey) : null);
              return (
                <div key={pos} className="text-xs font-mono bg-muted/50 rounded px-2 py-1">
                  <span className="text-muted-foreground">{PERSONNEL_LABELS[pos]}: </span>
                  {jersey != null ? (
                    <span>
                      #{jersey}
                      {name ? ` ${name}` : " (name unknown)"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 5: Grade Grid — ordered rows */}
      {committedRow && (
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Blocking Grades</div>

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
