/**
 * RosterResolveDialog — Pass 2 off-roster jersey resolution.
 *
 * Preserves the intended assignment context (jersey, canonical slot, raw
 * narration clause) for jerseys flagged off-roster by the personnel parser.
 *
 * Coach can:
 *   - enter a player name for each pending jersey and add it to the roster
 *   - skip individual entries (leaves them unresolved → still blocked)
 *   - cancel entirely (no roster mutation, no personnel assignment)
 *
 * On confirm, returns the list of jerseys that were successfully added to
 * roster. The caller is responsible for re-running parse / re-applying the
 * personnel patch against the intended canonical slots.
 *
 * Strict deterministic safety:
 *   - no silent roster creation: every add requires a non-empty name
 *   - no silent commit: dialog only mutates roster, never personnel proposal
 *   - cancel preserves blocked state — no assignment leaks through
 */

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERSONNEL_LABELS } from "@/engine/personnel";
import { getAliasFor, type PositionAliasMap } from "@/engine/positionAliases";
import { toast } from "sonner";
import { UserPlus, AlertTriangle } from "lucide-react";

export interface OffRosterPending {
  jersey: number;
  canonicalField?: string;
  rawSentence: string;
}

interface RosterResolveDialogProps {
  open: boolean;
  pending: OffRosterPending[];
  aliasMap: PositionAliasMap;
  addPlayer: (jerseyNumber: number, playerName: string) => Promise<void>;
  /** Called with jerseys successfully added so caller can re-apply assignments. */
  onResolved: (addedJerseys: number[]) => void;
  onCancel: () => void;
}

export function RosterResolveDialog({
  open,
  pending,
  aliasMap,
  addPlayer,
  onResolved,
  onCancel,
}: RosterResolveDialogProps) {
  // Dedupe by jersey (parser may emit one entry per clause).
  const uniquePending = React.useMemo(() => {
    const seen = new Set<number>();
    const out: OffRosterPending[] = [];
    for (const p of pending) {
      if (seen.has(p.jersey)) continue;
      seen.add(p.jersey);
      out.push(p);
    }
    return out;
  }, [pending]);

  const [names, setNames] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  // Reset names when the pending set changes (new parse run).
  React.useEffect(() => {
    if (open) setNames({});
  }, [open, uniquePending]);

  const handleAddAll = async () => {
    setBusy(true);
    const added: number[] = [];
    try {
      for (const p of uniquePending) {
        const name = (names[p.jersey] ?? "").trim();
        if (!name) continue; // skip empty — preserves blocked state for this jersey
        try {
          await addPlayer(p.jersey, name);
          added.push(p.jersey);
        } catch (e) {
          toast.error(`Failed to add #${p.jersey}: ${(e as Error)?.message ?? "unknown error"}`);
        }
      }
    } finally {
      setBusy(false);
    }
    if (added.length === 0) {
      toast.info("No jerseys added — assignments remain blocked.");
    } else {
      toast.success(`Added ${added.length} jersey(s) to roster.`);
    }
    onResolved(added);
  };

  const formatSlot = (canonicalField?: string) => {
    if (!canonicalField) return "—";
    const label = PERSONNEL_LABELS[canonicalField] ?? canonicalField;
    const alias = getAliasFor(canonicalField, aliasMap);
    return alias ? `${label} (${alias})` : label;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Resolve off-roster jerseys
          </DialogTitle>
          <DialogDescription className="text-xs">
            These jerseys were spoken in narration but aren't on the roster.
            Add a name to put them on the roster — the intended personnel
            assignment will then be re-applied to the proposal. Leave blank to
            skip (assignment remains blocked).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[55vh] overflow-y-auto">
          {uniquePending.map((p) => (
            <div
              key={p.jersey}
              className="rounded border border-border/60 bg-muted/30 p-2 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-mono font-semibold">#{p.jersey}</span>
                <span className="text-[10px] text-muted-foreground">
                  → intended slot:{" "}
                  <span className="font-mono text-foreground">{formatSlot(p.canonicalField)}</span>
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground italic font-mono">
                "{p.rawSentence}"
              </p>
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] text-muted-foreground whitespace-nowrap">
                  Player name
                </Label>
                <Input
                  className="h-7 text-xs"
                  value={names[p.jersey] ?? ""}
                  onChange={(e) =>
                    setNames((prev) => ({ ...prev, [p.jersey]: e.target.value }))
                  }
                  placeholder={`Name for #${p.jersey} (leave blank to skip)`}
                  disabled={busy}
                  autoComplete="off"
                />
              </div>
            </div>
          ))}
          {uniquePending.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No off-roster jerseys to resolve.
            </p>
          )}
        </div>

        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground border-t pt-2">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            Adding to roster does NOT commit the play. Personnel assignments
            remain in proposal state until you commit.
          </span>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleAddAll} disabled={busy || uniquePending.length === 0}>
            {busy ? "Adding…" : "Add to roster & apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
