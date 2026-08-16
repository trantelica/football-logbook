/**
 * PlayLedger — full-grid inspection, on demand.
 *
 * Replaces two stacked always-on tables that between them put ~2N rows of grid
 * below the work surface:
 *
 *   - SlotsGrid ("Play Slots")     — every slot, click to select
 *   - CommittedPlaysPanel          — every slot again, click to overwrite,
 *                                    under the heading "Committed Plays (N)"
 *
 * The second heading was wrong: it counted slots, not commits, so a brand-new
 * game reported "Committed Plays (40)" with nothing committed — directly against
 * the committed-only promise the export makes.
 *
 * This consolidates both into one sheet the coach opens when they want to look
 * something up, with the commit state stated honestly. Navigation now lives in
 * PassRail, so the grid no longer has to serve two jobs at once.
 */

import { useMemo, useState } from "react";
import { Table as TableIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isPass1Complete } from "@/engine/personnel";
import { useTransaction } from "@/engine/transaction";
import { useGameContext } from "@/engine/gameContext";
import { playSchema, QTR_DISPLAY } from "@/engine/schema";
import type { PlayRecord, SlotMeta } from "@/engine/types";
import { cn } from "@/lib/utils";

const VISIBLE_COLUMNS = [
  "playNum",
  "qtr",
  "odk",
  "series",
  "dn",
  "dist",
  "yardLn",
  "offForm",
  "offPlay",
  "result",
  "gainLoss",
  "penalty",
  "eff",
];

type LedgerScope = "all" | "committed";

/**
 * Whether the coach has actually logged this play.
 *
 * Not `committedFields.length > 0` — scaffolding pre-commits qtr/odk/series, so
 * that is true for every slot in a brand-new game. isPass1Complete requires a
 * result and gain/loss, which only a real commit produces.
 */
function isLogged(play: PlayRecord, meta: SlotMeta | undefined): boolean {
  return isPass1Complete(play, meta);
}

function formatCellValue(play: PlayRecord, col: string): string {
  const val = (play as unknown as Record<string, unknown>)[col];
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "✓" : "—";
  if (col === "qtr") return QTR_DISPLAY[String(val)] ?? String(val);
  return String(val);
}

export function PlayLedger() {
  const { activeGame } = useGameContext();
  const { committedPlays, slotMetaMap, loadPlayForOverwrite, selectSlot, selectedSlotNum } =
    useTransaction();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<LedgerScope>("all");

  const committedCount = useMemo(
    () => committedPlays.filter((p) => isLogged(p, slotMetaMap.get(p.playNum))).length,
    [committedPlays, slotMetaMap],
  );

  const rows = useMemo(
    () =>
      scope === "committed"
        ? committedPlays.filter((p) => isLogged(p, slotMetaMap.get(p.playNum)))
        : committedPlays,
    [committedPlays, slotMetaMap, scope],
  );

  if (!activeGame) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <TableIcon className="h-3.5 w-3.5" />
          Ledger
        </button>
      </SheetTrigger>

      <SheetContent side="bottom" className="h-[75vh] p-0">
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b px-5 py-3">
          <div>
            <SheetTitle className="text-sm">Play Ledger</SheetTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {committedCount} of {committedPlays.length} committed
              {committedCount === 0 && " — nothing will export yet"}
            </p>
          </div>

          <ToggleGroup
            type="single"
            value={scope}
            onValueChange={(v) => v && setScope(v as LedgerScope)}
            size="sm"
          >
            <ToggleGroupItem value="all" className="h-7 px-3 text-xs">
              All slots
            </ToggleGroupItem>
            <ToggleGroupItem value="committed" className="h-7 px-3 text-xs">
              Committed
            </ToggleGroupItem>
          </ToggleGroup>
        </SheetHeader>

        <div className="h-[calc(75vh-4.25rem)] overflow-auto px-5 py-3">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No plays committed yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 w-20 px-2 text-xs font-semibold">State</TableHead>
                  {VISIBLE_COLUMNS.map((col) => {
                    const def = playSchema.find((f) => f.name === col);
                    return (
                      <TableHead key={col} className="h-8 px-2 text-xs font-semibold">
                        {def?.label ?? col}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((play) => {
                  const meta = slotMetaMap.get(play.playNum);
                  const committed = isLogged(play, meta);
                  return (
                    <TableRow
                      key={`${play.gameId}-${play.playNum}`}
                      onClick={() => {
                        // Committed rows open the overwrite path (which shows
                        // before/after); uncommitted rows are just selected.
                        if (committed) loadPlayForOverwrite(play);
                        else selectSlot(play.playNum);
                        setOpen(false);
                      }}
                      className={cn(
                        "cursor-pointer",
                        selectedSlotNum === play.playNum && "bg-accent/10",
                        play.odk === "S" && "opacity-60",
                      )}
                    >
                      <TableCell className="px-2 py-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide",
                            committed ? "text-committed" : "text-muted-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              committed ? "bg-committed" : "bg-muted-foreground/40",
                            )}
                          />
                          {committed ? "Committed" : "Open"}
                        </span>
                      </TableCell>
                      {VISIBLE_COLUMNS.map((col) => (
                        <TableCell
                          key={col}
                          className={cn(
                            "px-2 py-1.5 font-mono text-xs",
                            meta?.committedFields.includes(col) && col !== "playNum"
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatCellValue(play, col)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
