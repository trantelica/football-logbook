import React from "react";
import { useTransaction } from "@/engine/transaction";
import { useGameContext } from "@/engine/gameContext";
import { Button } from "@/components/ui/button";
import { downloadDebugJSON, downloadPlaysCSV } from "@/engine/export";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";

const STATE_LABELS: Record<string, string> = {
  idle: "No Game",
  candidate: "Draft",
  proposal: "Proposal Review",
  "overwrite-review": "Overwrite Review",
};

export function StatusBar() {
  const { activeGame } = useGameContext();
  const { state, candidate, committedPlays, inlineErrors, commitErrors } =
    useTransaction();

  const errors = { ...inlineErrors, ...commitErrors };
  const errorCount = Object.keys(errors).length;

  // RYG indicator
  const indicator = !activeGame
    ? "bg-muted-foreground"
    : errorCount > 0
      ? "bg-destructive"
      : state === "candidate" || state === "proposal"
        ? "bg-draft"
        : "bg-committed";

  return (
    <footer className="flex items-center gap-3 border-t bg-card px-4 py-1.5 text-xs text-muted-foreground">
      {/* RYG dot */}
      <div className={cn("h-2.5 w-2.5 rounded-full", indicator)} />

      {/* State */}
      <span className="font-medium">{STATE_LABELS[state] ?? state}</span>

      {activeGame && (
        <>
          <span className="text-muted-foreground/60">|</span>
          <span>vs {activeGame.opponent}</span>
          <span className="text-muted-foreground/60">|</span>
          <span>{committedPlays.length} committed</span>

          {candidate.playNum && (
            <>
              <span className="text-muted-foreground/60">|</span>
              <span>Play #{String(candidate.playNum)}</span>
            </>
          )}

          <div className="ml-auto flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 text-xs"
              onClick={() => downloadDebugJSON(activeGame.gameId)}
            >
              <Download className="h-3 w-3" />
              JSON
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 text-xs"
              onClick={() => downloadPlaysCSV(activeGame.gameId)}
              disabled={committedPlays.length === 0}
            >
              <Download className="h-3 w-3" />
              CSV
            </Button>
          </div>
        </>
      )}
    </footer>
  );
}
