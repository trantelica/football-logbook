/**
 * BlockingPanel — Pass 3 UI for blocking grades.
 * Read-only play context + read-only personnel (from committedRow) + grade grid.
 * ODK gating: grades only editable when committedRow exists and odk === "O".
 */

import React from "react";
import { useTransaction } from "@/engine/transaction";
import { useRoster } from "@/engine/rosterContext";
import { GRADE_FIELDS, GRADE_LABELS, PERSONNEL_POSITIONS, PERSONNEL_LABELS } from "@/engine/personnel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Lock, AlertTriangle } from "lucide-react";

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

export function BlockingPanel() {
  const {
    candidate,
    updateField,
    selectedSlotNum,
    committedPlays,
    inlineErrors,
    commitErrors,
  } = useTransaction();
  const { roster } = useRoster();

  const state = useTransaction().state;
  const isProposal = state === "proposal";

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

      {/* Section 2: Play Context (read-only from committedRow) */}
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

      {/* Section 3: Personnel (read-only from committedRow) */}
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

      {/* Section 4: Grade Grid */}
      {committedRow && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Blocking Grades</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {GRADE_FIELDS.map((gradeField) => {
              const posField = GRADE_TO_POS[gradeField];
              const jersey = cr?.[posField] as number | null | undefined;
              const name = getPlayerName(jersey != null ? Number(jersey) : null);
              const value = c[gradeField];
              const error = errors[gradeField];

              const playerDisplay = jersey != null
                ? `#${jersey}${name ? ` ${name}` : ""}`
                : "—";

              return (
                <div key={gradeField} className="space-y-0.5">
                  <div className="text-[10px] text-muted-foreground font-medium">
                    {GRADE_LABELS[gradeField]} — {playerDisplay}
                  </div>
                  <Select
                    value={value != null && String(value) !== "" ? String(value) : "__none__"}
                    onValueChange={(v) => updateField(gradeField, v === "__none__" ? "" : v)}
                    disabled={gradesDisabled}
                  >
                    <SelectTrigger className="h-8 text-sm font-mono">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {GRADE_OPTIONS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {error && <p className="text-[10px] text-destructive">{error}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
