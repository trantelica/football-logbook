import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTransaction } from "@/engine/transaction";
import { useGameContext } from "@/engine/gameContext";
import { playSchema, QTR_DISPLAY } from "@/engine/schema";
import type { PlayRecord } from "@/engine/types";
import { cn } from "@/lib/utils";

const VISIBLE_COLUMNS = ["playNum", "qtr", "odk", "dn", "dist", "yardLn", "offForm", "offPlay", "result", "gainLoss"];

export function CommittedPlaysPanel() {
  const { activeGame } = useGameContext();
  const { committedPlays, loadPlayForOverwrite } = useTransaction();

  if (!activeGame) return null;

  if (committedPlays.length === 0) {
    return (
      <div className="rounded-lg border-2 border-committed/30 bg-committed-muted p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-committed mb-2">
          Committed Plays
        </h2>
        <p className="text-xs text-muted-foreground">
          No plays committed yet. Use the draft panel above to log and commit plays.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-committed/30 bg-committed-muted p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-committed mb-3">
        Committed Plays ({committedPlays.length})
      </h2>
      <div className="overflow-auto max-h-[320px]">
        <Table>
          <TableHeader>
            <TableRow className="border-committed/20">
              {VISIBLE_COLUMNS.map((col) => {
                const def = playSchema.find((f) => f.name === col);
                return (
                  <TableHead
                    key={col}
                    className="text-xs font-semibold text-committed h-8 px-2"
                  >
                    {def?.label ?? col}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {committedPlays.map((play) => (
              <TableRow
                key={`${play.gameId}-${play.playNum}`}
                className={cn(
                  "cursor-pointer hover:bg-committed/10 border-committed/10",
                  play.odk === "S" && "opacity-60"
                )}
                onClick={() => loadPlayForOverwrite(play)}
              >
                {VISIBLE_COLUMNS.map((col) => (
                  <TableCell
                    key={col}
                    className="text-xs font-mono px-2 py-1.5"
                  >
                    {formatCellValue(play, col)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatCellValue(play: PlayRecord, col: string): string {
  const val = (play as unknown as Record<string, unknown>)[col];
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "✓" : "—";
  // Display qtr=5 as "OT"
  if (col === "qtr") return QTR_DISPLAY[String(val)] ?? String(val);
  return String(val);
}
