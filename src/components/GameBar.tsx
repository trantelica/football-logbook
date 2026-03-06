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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGameContext } from "@/engine/gameContext";
import { useSeason } from "@/engine/seasonContext";
import { StartGameDialog } from "./StartGameDialog";
import { ConfigModeDialog } from "./ConfigModeDialog";
import { CalendarDays, Flag, Settings } from "lucide-react";

export function GameBar() {
  const {
    activeGame,
    seasonGames,
    switchGame,
    pendingSwitch,
    confirmSwitch,
    cancelSwitch,
  } = useGameContext();

  const {
    activeSeason,
    seasons,
    switchSeason,
    createNewSeason,
    pendingSwitchSeason,
    confirmSeasonSwitch,
    cancelSeasonSwitch,
  } = useSeason();

  const { setConfigMode } = useSeason();
  const [startGameOpen, setStartGameOpen] = useState(false);
  const [newSeasonOpen, setNewSeasonOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [newSeasonLabel, setNewSeasonLabel] = useState("");

  const handleConfigOpenChange = (v: boolean) => {
    if (!v) setConfigMode(false);
    setConfigOpen(v);
  };

  const handleCreateSeason = async () => {
    if (!newSeasonLabel.trim()) return;
    await createNewSeason(newSeasonLabel.trim());
    setNewSeasonLabel("");
    setNewSeasonOpen(false);
  };

  return (
    <>
      <header className="flex items-center gap-3 border-b bg-card px-4 py-2">
        <h1 className="text-sm font-bold tracking-wide uppercase text-muted-foreground">
          Football Engine
        </h1>
        <div className="mx-2 h-5 w-px bg-border" />

        {/* Season selector */}
        {seasons.length > 0 && (
          <Select
            value={activeSeason?.seasonId ?? ""}
            onValueChange={(v) => switchSeason(v)}
          >
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue placeholder="Select season…" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.seasonId} value={s.seasonId}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          onClick={() => setNewSeasonOpen(true)}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          New Season
        </Button>

        {activeSeason && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={() => setConfigOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
              Config
            </Button>

            <div className="mx-1 h-5 w-px bg-border" />

            {/* Game selector — always visible when season active */}
            <Select
              value={activeGame?.gameId ?? ""}
              onValueChange={(v) => switchGame(v)}
              disabled={seasonGames.length === 0}
            >
              <SelectTrigger className="w-[220px] h-8 text-sm">
                <SelectValue placeholder={seasonGames.length === 0 ? "No games yet" : "Select game…"} />
              </SelectTrigger>
              <SelectContent>
                {seasonGames.map((g) => (
                  <SelectItem key={g.gameId} value={g.gameId}>
                    vs {g.opponent} — {g.date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant="default"
              className="h-8 gap-1 bg-committed text-committed-foreground hover:bg-committed/90"
              onClick={() => setStartGameOpen(true)}
            >
              <Flag className="h-3.5 w-3.5" />
              Start Game
            </Button>
          </>
        )}

        {activeGame && (
          <div className="ml-auto text-xs text-muted-foreground font-mono">
            {activeGame.gameId.slice(0, 8)}
          </div>
        )}
      </header>

      
      <StartGameDialog open={startGameOpen} onOpenChange={setStartGameOpen} />
      <ConfigModeDialog open={configOpen} onOpenChange={handleConfigOpenChange} />

      {/* New Season Dialog */}
      <Dialog open={newSeasonOpen} onOpenChange={setNewSeasonOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">New Season</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="season-label">Season Label</Label>
            <Input
              id="season-label"
              value={newSeasonLabel}
              onChange={(e) => setNewSeasonLabel(e.target.value)}
              placeholder="e.g. 2025 Varsity"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateSeason();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSeasonOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSeason} disabled={!newSeasonLabel.trim()}>
              Create Season
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Game switch confirmation */}
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

      {/* Season switch confirmation */}
      <AlertDialog open={!!pendingSwitchSeason}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch Season?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an active draft. Switching seasons will clear all unsaved
              draft data. Committed plays and audit history are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelSeasonSwitch}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSeasonSwitch}>
              Switch & Clear Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
