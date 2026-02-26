/**
 * PersonnelPanel — Pass 2 UI for personnel assignment
 * Shows read-only play context and 11 personnel position inputs.
 */

import React from "react";
import { useTransaction } from "@/engine/transaction";
import { useRoster } from "@/engine/rosterContext";
import { PERSONNEL_POSITIONS, PERSONNEL_LABELS } from "@/engine/personnel";
import { ActorCombobox } from "./ActorCombobox";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";

/** Read-only play context fields shown at top of Pass 2 panel */
const CONTEXT_FIELDS: { key: string; label: string; format?: (v: unknown) => string }[] = [
  { key: "odk", label: "ODK" },
  { key: "yardLn", label: "Yard Ln" },
  { key: "dn", label: "Down" },
  { key: "dist", label: "Dist" },
  { key: "offForm", label: "Off. Form" },
  { key: "offPlay", label: "Off. Play" },
  { key: "motion", label: "Motion" },
  { key: "result", label: "Result" },
];

const ACTOR_FIELDS_PASS2 = ["rusher", "passer", "receiver", "returner"];
const ACTOR_LABELS: Record<string, string> = {
  rusher: "Rusher", passer: "Passer", receiver: "Receiver", returner: "Returner",
};

export function PersonnelPanel() {
  const {
    candidate,
    updateField,
    selectedSlotNum,
    commitErrors,
    inlineErrors,
  } = useTransaction();
  const { roster, addPlayer } = useRoster();

  const c = candidate as unknown as Record<string, unknown>;
  const errors = { ...inlineErrors, ...commitErrors };
  const isOffense = c.odk === "O";

  return (
    <div className="space-y-4">
      {/* Play Context Header — Read-only */}
      <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Play Context (Read-Only)
          </span>
          {selectedSlotNum && (
            <Badge variant="secondary" className="text-[10px] font-mono h-5 px-1.5">
              Play #{selectedSlotNum}
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-4 gap-x-4 gap-y-1">
          {CONTEXT_FIELDS.map(({ key, label, format }) => {
            const val = c[key];
            const display = val != null && val !== "" 
              ? (format ? format(val) : String(val))
              : "—";
            return (
              <div key={key} className="flex flex-col">
                <span className="text-[9px] text-muted-foreground uppercase">{label}</span>
                <span className="text-xs font-mono font-medium">{display}</span>
              </div>
            );
          })}
        </div>
      </div>

      {!isOffense ? (
        <div className="text-xs text-muted-foreground italic px-2">
          Personnel assignments are only available for Offensive (ODK=O) plays.
        </div>
      ) : (
        <>
          {/* Personnel Positions */}
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Personnel Positions (11 Players)
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {PERSONNEL_POSITIONS.map((pos) => (
                <ActorCombobox
                  key={pos}
                  fieldLabel={PERSONNEL_LABELS[pos]}
                  requiredAtCommit={false}
                  value={c[pos] != null ? String(c[pos]) : ""}
                  onChange={(v) => updateField(pos, v)}
                  roster={roster}
                  addPlayer={addPlayer}
                  disabled={false}
                  inputClassName="h-8 text-sm font-mono"
                  error={errors[pos]}
                />
              ))}
            </div>
          </div>

          {/* Actor Fields */}
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Actor Assignments
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ACTOR_FIELDS_PASS2.map((actor) => (
                <ActorCombobox
                  key={actor}
                  fieldLabel={ACTOR_LABELS[actor]}
                  requiredAtCommit={false}
                  value={c[actor] != null ? String(c[actor]) : ""}
                  onChange={(v) => updateField(actor, v)}
                  roster={roster}
                  addPlayer={addPlayer}
                  disabled={false}
                  inputClassName="h-8 text-sm font-mono"
                  error={errors[actor]}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
