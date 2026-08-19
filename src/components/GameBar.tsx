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
import { WorkspaceSettings } from "./WorkspaceSettings";
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
      {/*
        Single row that must never wrap or overflow.

        This was a plain flex row of fixed-width children, so below ~1100px it
        wrapped to two rows (costing 32px of the vertical space the work surface
        needs) and below ~900px it overflowed and the page scrolled sideways.

        Everything here now either shrinks, drops its label, or is marked
        shrink-0 as deliberately protected.
      */}
      <header className="flex min-w-0 items-center gap-2 border-b bg-card px-3 py-2 sm:px-4">
        {/* Brand — the subtitle is decorative and goes first when space is tight. */}
        <div className="flex shrink-0 flex-col">
          <h1 className="text-sm font-bold uppercase leading-none tracking-wide text-muted-foreground">
            Hudl Up! -loader
          </h1>
          <span className="mt-0.5 hidden text-[10px] uppercase leading-none tracking-wide text-muted-foreground/60 lg:block">
            AI Video Technician
          </span>
        </div>

        <div className="mx-1 hidden h-5 w-px shrink-0 bg-border sm:block" />

        {/* Season group */}
        <div className="flex min-w-0 items-center gap-1.5">
          {seasons.length > 0 && (
            <Select
              value={activeSeason?.seasonId ?? ""}
              onValueChange={(v) => switchSeason(v)}
            >
              <SelectTrigger className="h-8 w-[128px] min-w-0 text-sm lg:w-[180px]">
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

          {/* Below lg the labels drop and these become icon buttons. title=
              keeps them identifiable, and the accessible name survives. */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1 px-2 lg:px-3"
            onClick={() => setNewSeasonOpen(true)}
            title="New Season"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">New Season</span>
          </Button>

          {activeSeason && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 shrink-0 gap-1 px-2 text-muted-foreground lg:px-3"
              onClick={() => setConfigOpen(true)}
              title="Season configuration"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Config</span>
            </Button>
          )}
        </div>

        {activeSeason && (
          <>
            <div className="mx-1 hidden h-5 w-px shrink-0 bg-border sm:block" />

            {/* Game group — the select is the one element allowed to take up
                slack, since opponent names vary in length. */}
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Select
                value={activeGame?.gameId ?? ""}
                onValueChange={(v) => switchGame(v)}
                disabled={seasonGames.length === 0}
              >
                <SelectTrigger className="h-8 w-full min-w-0 max-w-[220px] text-sm">
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
                className="h-8 shrink-0 gap-1 bg-primary px-2 text-primary-foreground hover:bg-primary/90 lg:px-3"
                onClick={() => setStartGameOpen(true)}
                title="Start Game"
              >
                <Flag className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Start Game</span>
              </Button>
            </div>
          </>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Debug identifier — first thing to go when space is tight. */}
          {activeGame && (
            <span className="hidden font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60 xl:inline">
              {activeGame.gameId.slice(0, 8)}
            </span>
          )}
          <WorkspaceSettings />
        </div>
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
