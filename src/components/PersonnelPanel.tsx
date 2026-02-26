/**
 * PersonnelPanel — Pass 2 UI for personnel assignment
 * Shows read-only play context, 11 personnel position inputs,
 * and actor integrity section with fix options.
 */

import React, { useState, useMemo } from "react";
import { useTransaction } from "@/engine/transaction";
import { useRoster } from "@/engine/rosterContext";
import { PERSONNEL_POSITIONS, PERSONNEL_LABELS, ACTOR_FIELDS } from "@/engine/personnel";
import { ActorCombobox } from "./ActorCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, AlertTriangle } from "lucide-react";

/** Read-only play context fields shown at top of Pass 2 panel */
const CONTEXT_FIELDS: { key: string; label: string }[] = [
  { key: "odk", label: "ODK" },
  { key: "yardLn", label: "Yard Ln" },
  { key: "dn", label: "Down" },
  { key: "dist", label: "Dist" },
  { key: "offForm", label: "Off Form" },
  { key: "offPlay", label: "Off Play" },
  { key: "motion", label: "Motion" },
  { key: "result", label: "Result" },
];

const ACTOR_LABELS: Record<string, string> = {
  rusher: "Rusher",
  passer: "Passer",
  receiver: "Receiver",
  returner: "Returner",
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

  // Current 11 personnel jerseys
  const personnelJerseys = useMemo(() => {
    const jerseys: number[] = [];
    for (const pos of PERSONNEL_POSITIONS) {
      const val = c[pos];
      if (val != null && val !== "") {
        const num = Number(val);
        if (Number.isInteger(num) && num >= 0) jerseys.push(num);
      }
    }
    return jerseys;
  }, [c]);

  // Actor membership errors
  const actorErrors = useMemo(() => {
    return ACTOR_FIELDS
      .filter((a) => errors[a])
      .map((a) => ({ field: a, value: c[a], message: errors[a] }));
  }, [errors, c]);

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
          {CONTEXT_FIELDS.map(({ key, label }) => {
            const val = c[key];
            const display = val != null && val !== "" ? String(val) : "—";
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

          {/* Actor Integrity Section */}
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Actor Integrity
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ACTOR_FIELDS.map((actor) => (
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

          {/* Actor membership error banner with fix options */}
          {actorErrors.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-xs font-medium text-destructive">
                  One or more actors aren't in the 11 personnel for this play. Use the fix options below.
                </p>
              </div>
              {actorErrors.map(({ field, value }) => (
                <ActorFixCard
                  key={field}
                  actorField={field}
                  actorLabel={ACTOR_LABELS[field]}
                  actorJersey={Number(value)}
                  personnelJerseys={personnelJerseys}
                  updateField={updateField}
                  candidate={c}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Actor Fix Card — provides two deterministic resolution options */
function ActorFixCard({
  actorField,
  actorLabel,
  actorJersey,
  personnelJerseys,
  updateField,
  candidate,
}: {
  actorField: string;
  actorLabel: string;
  actorJersey: number;
  personnelJerseys: number[];
  updateField: (field: string, value: unknown) => void;
  candidate: Record<string, unknown>;
}) {
  const [swapTarget, setSwapTarget] = useState<string>("");
  const [changeTarget, setChangeTarget] = useState<string>("");

  const handleSwapInto = () => {
    if (!swapTarget) return;
    updateField(swapTarget, actorJersey);
  };

  const handleChangeActor = () => {
    if (!changeTarget) return;
    updateField(actorField, changeTarget);
  };

  return (
    <div className="rounded border border-border/50 bg-background p-2 space-y-2">
      <p className="text-xs font-semibold">
        {actorLabel} #{actorJersey}
      </p>

      {/* Option A: Swap actor into the 11 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          Add #{actorJersey} into personnel by replacing:
        </span>
        <Select value={swapTarget} onValueChange={setSwapTarget}>
          <SelectTrigger className="h-7 text-xs w-28">
            <SelectValue placeholder="Position" />
          </SelectTrigger>
          <SelectContent>
            {PERSONNEL_POSITIONS.map((pos) => {
              const currentVal = candidate[pos];
              const display = currentVal != null && currentVal !== "" ? `${PERSONNEL_LABELS[pos]} (#${currentVal})` : PERSONNEL_LABELS[pos];
              return (
                <SelectItem key={pos} value={pos}>
                  {display}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSwapInto} disabled={!swapTarget}>
          Swap
        </Button>
      </div>

      {/* Option B: Change actor to one of the 11 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          Set {actorLabel} to:
        </span>
        <Select value={changeTarget} onValueChange={setChangeTarget}>
          <SelectTrigger className="h-7 text-xs w-28">
            <SelectValue placeholder="Jersey" />
          </SelectTrigger>
          <SelectContent>
            {[...new Set(personnelJerseys)].sort((a, b) => a - b).map((j) => (
              <SelectItem key={j} value={String(j)}>
                #{j}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleChangeActor} disabled={!changeTarget}>
          Set
        </Button>
      </div>
    </div>
  );
}
