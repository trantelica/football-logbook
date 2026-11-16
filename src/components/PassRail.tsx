/**
 * PassRail — compact play navigator.
 *
 * The slots table showed every play as a 13-column row, so an 80-play game put
 * 80 rows of mostly-empty grid under the work surface and the coach scrolled a
 * spreadsheet to change plays. Navigation and inspection were the same widget,
 * and neither was good at its job.
 *
 * The rail does navigation only: one dense row per play, showing the play
 * number, which of the three passes are done, and just enough situation to
 * recognise it. Each pip is its own pass: a play with personnel and grades but
 * no play details shows the second and third pip, not nothing. It scrolls independently of the work surface, so selecting a
 * play never moves the panel the coach is typing into.
 *
 * The full grid still exists for inspection — see PlayLedger.
 *
 * This is the "PassRail" parked in docs/coach/known-limits.md §4.
 */

import { useEffect, useMemo, useRef } from "react";
import { passFlags, passTally } from "@/engine/passProgress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTransaction } from "@/engine/transaction";
import { useGameContext } from "@/engine/gameContext";
import type { PlayRecord } from "@/engine/types";
import { cn } from "@/lib/utils";

const ODK_FILTER_OPTIONS = ["ALL", "O", "D", "K"] as const;

function situationLabel(play: PlayRecord): string {
  const dn = play.dn;
  const dist = play.dist;
  if (dn === null || dn === undefined || dist === null || dist === undefined) return "";
  return `${dn} & ${dist}`;
}

/** One pip per pass, lit independently: play details, personnel, blocking. */
function ProgressPips({ flags, muted }: { flags: readonly boolean[]; muted: boolean }) {
  return (
    <span className="flex shrink-0 gap-[3px]" aria-hidden>
      {flags.map((lit, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
            lit
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
    activePass,
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

  // Counted for the pass the coach is in, so working only Pass 2 and 3 on a
  // game whose play details live in Hudl does not read as 0 of N forever.
  const tally = passTally(committedPlays, slotMetaMap, activePass);

  return (
    <nav
      aria-label="Play navigator"
      // Narrows before the work surface does. At 900px a fixed 188px rail is
      // over a fifth of the window, and the rail only needs to show a play
      // number, a short situation, and three progress pips.
      className="flex h-full w-[132px] shrink-0 flex-col border-r bg-card lg:w-[188px]"
    >
      <div className="border-b px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Plays
          </h2>
          <span
            className="font-mono text-[10px] tabular-nums text-muted-foreground"
            title={tally.description}
          >
            {tally.done}/{tally.total}
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
            const flags = passFlags(play, meta);
            const isSelected = selectedSlotNum === play.playNum;
            // Defense is a logged pass (Pass 4), so D rows read like offense
            // rows; only K/S rows stay quiet.
            const isNonOffense = play.odk !== "O" && play.odk !== "D";
            const isDefense = play.odk === "D";
            const baseSituation = situationLabel(play);
            const situation = isDefense
              ? `D${baseSituation ? ` · ${baseSituation}` : ""}`
              : baseSituation;

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

                <ProgressPips flags={flags} muted={isNonOffense} />
              </button>
            );
          })
        )}
      </div>
    </nav>
  );
}
