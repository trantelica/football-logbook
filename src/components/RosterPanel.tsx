import React, { useState } from "react";
import { useRoster } from "@/engine/rosterContext";
import { useSeason } from "@/engine/seasonContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, X, Plus } from "lucide-react";
import { toast } from "sonner";

export function RosterPanel() {
  const { activeSeason } = useSeason();
  const { roster, addPlayer, removePlayer } = useRoster();
  const [open, setOpen] = useState(false);
  const [newJersey, setNewJersey] = useState("");
  const [newName, setNewName] = useState("");

  if (!activeSeason) return null;

  const handleAdd = async () => {
    const num = parseInt(newJersey, 10);
    if (isNaN(num) || num < 0 || !newName.trim()) return;
    try {
      await addPlayer(num, newName.trim());
      setNewJersey("");
      setNewName("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add player");
    }
  };

  const handleRemove = async (jerseyNumber: number) => {
    try {
      await removePlayer(jerseyNumber);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove player");
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground h-8">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Roster
          <span className="ml-auto font-mono text-[10px] opacity-60">
            {roster.length} player{roster.length !== 1 ? "s" : ""}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        <div className="rounded border border-border/50 overflow-hidden">
          {roster.length === 0 && (
            <p className="text-[11px] text-muted-foreground/50 italic p-2">No players added yet.</p>
          )}
          {roster.map((entry) => (
            <div
              key={entry.jerseyNumber}
              className="flex items-center gap-2 px-2 py-1 border-b border-border/30 last:border-b-0 text-xs"
            >
              <span className="font-mono font-semibold w-8 text-right">#{entry.jerseyNumber}</span>
              <span className="flex-1 truncate">{entry.playerName}</span>
              <button
                onClick={() => handleRemove(entry.jerseyNumber)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-1">
          <Input
            className="h-7 text-xs w-16"
            placeholder="#"
            value={newJersey}
            onChange={(e) => setNewJersey(e.target.value)}
            inputMode="numeric"
          />
          <Input
            className="h-7 text-xs flex-1"
            placeholder="Player name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0"
            onClick={handleAdd}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
