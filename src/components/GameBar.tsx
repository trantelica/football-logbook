import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useGameContext } from "@/engine/gameContext";
import { NewGameDialog } from "./NewGameDialog";
import { Plus } from "lucide-react";

export function GameBar() {
  const {
    activeGame,
    games,
    switchGame,
    pendingSwitch,
    confirmSwitch,
    cancelSwitch,
  } = useGameContext();
  const [newGameOpen, setNewGameOpen] = useState(false);

  return (
    <>
      <header className="flex items-center gap-3 border-b bg-card px-4 py-2">
        <h1 className="text-sm font-bold tracking-wide uppercase text-muted-foreground">
          Football Engine
        </h1>
        <div className="mx-2 h-5 w-px bg-border" />

        {games.length > 0 && (
          <Select
            value={activeGame?.gameId ?? ""}
            onValueChange={(v) => switchGame(v)}
          >
            <SelectTrigger className="w-[240px] h-8 text-sm">
              <SelectValue placeholder="Select game…" />
            </SelectTrigger>
            <SelectContent>
              {games.map((g) => (
                <SelectItem key={g.gameId} value={g.gameId}>
                  vs {g.opponent} — {g.date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          onClick={() => setNewGameOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          New Game
        </Button>

        {activeGame && (
          <div className="ml-auto text-xs text-muted-foreground font-mono">
            {activeGame.gameId.slice(0, 8)}
          </div>
        )}
      </header>

      <NewGameDialog open={newGameOpen} onOpenChange={setNewGameOpen} />

      {/* Switch confirmation dialog */}
      <AlertDialog open={!!pendingSwitch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch Game?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an active draft. Switching games will clear all unsaved
              draft data. Committed plays and audit history are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelSwitch}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitch}>
              Switch & Clear Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
