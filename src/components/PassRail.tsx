/**
 * PassRail — compact play navigator.
 *
 * The slots table showed every play as a 13-column row, so an 80-play game put
 * 80 rows of mostly-empty grid under the work surface and the coach scrolled a
 * spreadsheet to change plays. Navigation and inspection were the same widget,
 * and neither was good at its job.
 *
 * The rail does navigation only: one dense row per play, showing the play
 * number, how far through the three passes it is, and just enough situation to
 * recognise it. It scrolls independently of the work surface, so selecting a
 * play never moves the panel the coach is typing into.
 *
 * The full grid still exists for inspection — see PlayLedger.
 *
 * This is the "PassRail" parked in docs/coach/known-limits.md §4.
 */

import { useEffect, useMemo, useRef } from "react";
import { isPass1Complete, isPass2Complete, anyGradePresent } from "@/engine/personnel";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTransaction } from "@/engine/transaction";
import { useGameContext } from "@/engine/gameContext";
import type { PlayRecord, SlotMeta } from "@/engine/types";
import { cn } from "@/lib/utils";

const ODK_FILTER_OPTIONS = ["ALL", "O", "D", "K"] as const;

/** How many of the three passes are done — drives the progress pips. */
function passProgress(play: PlayRecord, meta: SlotMeta | undefined): number {
  if (!isPass1Complete(play, meta)) return 0;
  // Non-offensive plays have no personnel or blocking work, so Pass 1 is
  // everything there is to do. Showing them as 1-of-3 forever would read as
  // permanently unfinished.
  if (play.odk !== "O") return 3;
  let done = 1;
  if (isPass2Complete(play, meta)) done += 1;
  if (anyGradePresent(play)) done += 1;
  return done;
}

function situationLabel(play: PlayRecord): string {
  const dn = play.dn;
  const dist = play.dist;
  if (dn === null || dn === undefined || dist === null || dist === undefined) return "";
  return `${dn} & ${dist}`;
}

function ProgressPips({ done, muted }: { done: number; muted: boolean }) {
  return (
    <span className="flex shrink-0 gap-[3px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
            i < done
              ? muted
                ? "bg-muted-foreground/50"
                : "bg-committed"
              : "bg-muted-foreground/20",
          )}
        />
      ))}
    </span>
  );
}

export function PassRail() {
  const { activeGame } = useGameContext();
  const {
    committedPlays,
    selectSlot,
    selectedSlotNum,
    slotMetaMap,
    odkFilter,
    setOdkFilter,
  } = useTransaction();

  const selectedRef = useRef<HTMLButtonElement | null>(null);

  const filteredPlays = useMemo(
    () =>
      odkFilter === "ALL"
        ? committedPlays
        : committedPlays.filter((p) => p.odk === odkFilter),
    [committedPlays, odkFilter],
  );

  // Commit & Next advances the selection without any pointer interaction, so
  // the rail has to follow the selection on its own or the active play scrolls
  // out of sight during a run of quick commits.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedSlotNum]);

  if (!activeGame) return null;

  const doneCount = committedPlays.filter(
    (p) => passProgress(p, slotMetaMap.get(p.playNum)) === 3,
  ).length;

  return (
    <nav
      aria-label="Play navigator"
      className="flex h-full w-[188px] shrink-0 flex-col border-r bg-card"
    >
      <div className="border-b px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Plays
          </h2>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {doneCount}/{committedPlays.length}
          </span>
        </div>

        <ToggleGroup
          type="single"
          value={odkFilter}
          onValueChange={(val) => {
            if (val) setOdkFilter(val);
          }}
          size="sm"
          className="mt-2 justify-start gap-0.5"
        >
          {ODK_FILTER_OPTIONS.map((opt) => (
            <ToggleGroupItem
              key={opt}
              value={opt}
              className="h-6 flex-1 px-0 text-[10px] font-semibold"
            >
              {opt}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {filteredPlays.length === 0 ? (
          <p className="px-3 py-4 text-[11px] leading-relaxed text-muted-foreground">
            No plays match this filter.
          </p>
        ) : (
          filteredPlays.map((play) => {
            const meta = slotMetaMap.get(play.playNum);
            const done = passProgress(play, meta);
            const isSelected = selectedSlotNum === play.playNum;
            const isNonOffense = play.odk !== "O";
            const situation = situationLabel(play);

            return (
              <button
                key={play.playNum}
                ref={isSelected ? selectedRef : undefined}
                type="button"
                onClick={() => selectSlot(play.playNum)}
                aria-current={isSelected ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 border-l-2 px-3 py-1.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                  isSelected
                    ? "border-l-primary bg-accent/15"
                    : "border-l-transparent hover:bg-muted/60",
                  isNonOffense && !isSelected && "opacity-55",
                )}
              >
                <span
                  className={cn(
                    "w-6 shrink-0 font-mono text-xs tabular-nums",
                    isSelected ? "font-bold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {play.playNum}
                </span>

                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums",
                    situation ? "text-muted-foreground" : "text-muted-foreground/40",
                  )}
                >
                  {isNonOffense ? (play.odk ?? "") : situation || "—"}
                </span>

                <ProgressPips done={done} muted={isNonOffense} />
              </button>
            );
          })
        )}
      </div>
    </nav>
  );
}
