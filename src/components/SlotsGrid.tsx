/**
 * Slots Grid — Displays all pre-created slots for an initialized game.
 * Shows slot state (seeded, partial, committed) and allows slot selection.
 * Phase 4: ODK filter toggle for display-only filtering.
 */

import React from "react";
import { isPass1Complete, isPass2Complete } from "@/engine/personnel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTransaction } from "@/engine/transaction";
import { useGameContext } from "@/engine/gameContext";
import { playSchema, QTR_DISPLAY } from "@/engine/schema";
import type { PlayRecord, SlotMeta } from "@/engine/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const VISIBLE_COLUMNS = ["playNum", "qtr", "odk", "series", "dn", "dist", "yardLn", "offForm", "offPlay", "result", "gainLoss", "penalty", "eff"];

const ODK_FILTER_OPTIONS = ["ALL", "O", "D", "K"] as const;

const ODK_FILTER_LABELS: Record<string, string> = {
  ALL: "All",
  O: "Offensive",
  D: "Defensive",
  K: "Kicking",
};

function getSlotStatus(play: PlayRecord, meta: SlotMeta | undefined): "not-started" | "pass1-done" | "personnel-updated" {
  const p1 = isPass1Complete(play, meta);
  if (!p1) return "not-started";
  // For non-O plays, personnel is N/A — stay at "pass1-done"
  if (play.odk !== "O") return "pass1-done";
  const p2 = isPass2Complete(play, meta);
  if (p2) return "personnel-updated";
  return "pass1-done";
}

export function SlotsGrid() {
  const { activeGame } = useGameContext();
  const { committedPlays, selectSlot, selectedSlotNum, slotMetaMap, odkFilter, setOdkFilter } = useTransaction();

  if (!activeGame) return null;

  if (committedPlays.length === 0) {
    return (
      <div className="rounded-lg border-2 border-muted p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Play Slots
        </h2>
        <p className="text-xs text-muted-foreground">
          No slots created. Use "Start Game" to initialize slots.
        </p>
      </div>
    );
  }

  const filteredPlays = odkFilter === "ALL"
    ? committedPlays
    : committedPlays.filter((p) => p.odk === odkFilter);

  const headerLabel = odkFilter === "ALL"
    ? `Play Slots (${committedPlays.length})`
    : `${ODK_FILTER_LABELS[odkFilter] ?? odkFilter} Plays (${filteredPlays.length} of ${committedPlays.length})`;

  return (
    <div className="rounded-lg border-2 border-committed/30 bg-committed-muted p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-committed">
          {headerLabel}
        </h2>
        <div className="flex gap-2 text-[10px]">
          <Badge variant="outline" className="gap-1 font-normal">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            Not Started
          </Badge>
          <Badge variant="outline" className="gap-1 font-normal">
            <span className="h-1.5 w-1.5 rounded-full bg-candidate" />
            Play Details Done
          </Badge>
          <Badge variant="outline" className="gap-1 font-normal">
            <span className="h-1.5 w-1.5 rounded-full bg-committed" />
            Personnel Updated
          </Badge>
        </div>
      </div>

      {/* ODK Filter Toggle */}
      <div className="mb-3">
        <ToggleGroup
          type="single"
          value={odkFilter}
          onValueChange={(val) => { if (val) setOdkFilter(val); }}
          size="sm"
          className="justify-start"
        >
          {ODK_FILTER_OPTIONS.map((opt) => (
            <ToggleGroupItem
              key={opt}
              value={opt}
              className="text-xs px-3 h-7 font-medium"
            >
              {opt}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="overflow-auto max-h-[400px]">
        <Table>
          <TableHeader>
            <TableRow className="border-committed/20">
              <TableHead className="text-xs font-semibold text-committed h-8 px-2 w-16">
                Status
              </TableHead>
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
            {filteredPlays.map((play) => {
              const meta = slotMetaMap.get(play.playNum);
              const status = getSlotStatus(play, meta);
              const isSelected = selectedSlotNum === play.playNum;

              return (
                <TableRow
                  key={play.playNum}
                  className={cn(
                    "cursor-pointer border-committed/10 transition-colors",
                    isSelected
                      ? "bg-candidate/20 ring-1 ring-candidate"
                      : "hover:bg-committed/10",
                    play.odk === "S" && "opacity-60"
                  )}
                  onClick={() => selectSlot(play.playNum)}
                >
                  <TableCell className="px-2 py-1.5">
                    <span
                      className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        status === "personnel-updated" && "bg-committed",
                        status === "pass1-done" && "bg-candidate",
                        status === "not-started" && "bg-muted-foreground"
                      )}
                    />
                  </TableCell>
                  {VISIBLE_COLUMNS.map((col) => (
                    <TableCell
                      key={col}
                      className={cn(
                        "text-xs font-mono px-2 py-1.5",
                        meta?.committedFields.includes(col) && col !== "playNum"
                          ? "text-committed font-semibold"
                          : "text-muted-foreground"
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
      </div>
    </div>
  );
}

function formatCellValue(play: PlayRecord, col: string): string {
  const val = (play as unknown as Record<string, unknown>)[col];
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "✓" : "—";
  if (col === "qtr") return QTR_DISPLAY[String(val)] ?? String(val);
  return String(val);
}
