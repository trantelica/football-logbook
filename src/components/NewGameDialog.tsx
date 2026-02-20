import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGameContext } from "@/engine/gameContext";
import { useSeason } from "@/engine/seasonContext";

interface NewGameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewGameDialog({ open, onOpenChange }: NewGameDialogProps) {
  const { createNewGame } = useGameContext();
  const { activeSeason } = useSeason();
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const handleCreate = async () => {
    if (!opponent.trim() || !date || !activeSeason) return;
    await createNewGame(opponent.trim(), date);
    setOpponent("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">New Game</DialogTitle>
        </DialogHeader>
        {!activeSeason ? (
          <p className="text-sm text-muted-foreground py-4">
            Please create or select a season first before adding a game.
          </p>
        ) : (
          <>
            <div className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">
              Season: <span className="font-semibold">{activeSeason.label}</span>
            </div>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="opponent">Opponent</Label>
                <Input
                  id="opponent"
                  value={opponent}
                  onChange={(e) => setOpponent(e.target.value)}
                  placeholder="e.g. Central High"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="game-date">Date</Label>
                <Input
                  id="game-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {activeSeason && (
            <Button onClick={handleCreate} disabled={!opponent.trim() || !date}>
              Create Game
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
