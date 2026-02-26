/**
 * ActorCombobox — Roster-backed jersey number input with dropdown.
 * iPad-safe: absolute dropdown, mousedown prevention, outside-click close.
 */

import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RosterEntry } from "@/engine/types";

interface ActorComboboxProps {
  fieldLabel: string;
  requiredAtCommit: boolean;
  value: string;
  onChange: (value: string) => void;
  roster: RosterEntry[];
  addPlayer: (jerseyNumber: number, playerName: string) => Promise<void>;
  disabled: boolean;
  inputClassName: string;
  error?: string;
  committedDot?: React.ReactNode;
}

export function ActorCombobox({
  fieldLabel,
  requiredAtCommit,
  value,
  onChange,
  roster,
  addPlayer,
  disabled,
  inputClassName,
  error,
  committedDot,
}: ActorComboboxProps) {
  const [open, setOpen] = useState(false);
  const [addingName, setAddingName] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const typedNum = value.trim();
  const filtered = typedNum === ""
    ? roster.slice(0, 20)
    : roster.filter((r) => String(r.jerseyNumber).includes(typedNum));

  const parsedNum = parseInt(typedNum, 10);
  const isNovelJersey =
    typedNum !== "" &&
    !isNaN(parsedNum) &&
    parsedNum >= 0 &&
    !roster.some((r) => r.jerseyNumber === parsedNum);

  useEffect(() => {
    if (!open) { setAddingName(false); setNewPlayerName(""); return; }
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  const handleAddToRoster = async () => {
    if (!newPlayerName.trim() || isNaN(parsedNum)) return;
    try {
      await addPlayer(parsedNum, newPlayerName.trim());
      onChange(String(parsedNum));
      setAddingName(false);
      setNewPlayerName("");
      setOpen(false);
    } catch {
      // roster context handles error
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        {committedDot}
        {fieldLabel}
        {requiredAtCommit && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Input
        className={inputClassName}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Jersey #"
        disabled={disabled}
        autoComplete="off"
      />
      {open && !disabled && (filtered.length > 0 || isNovelJersey) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-[180px] overflow-y-auto">
          {filtered.map((r) => (
            <button
              key={r.jerseyNumber}
              type="button"
              className="w-full text-left px-2 py-1.5 text-xs font-mono hover:bg-accent cursor-pointer"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(String(r.jerseyNumber));
                setOpen(false);
              }}
            >
              #{r.jerseyNumber} — {r.playerName}
            </button>
          ))}
          {isNovelJersey && !addingName && (
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent cursor-pointer flex items-center gap-1 text-primary font-medium"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setAddingName(true)}
            >
              <Plus className="h-3 w-3" />
              Add #{parsedNum} to roster
            </button>
          )}
          {isNovelJersey && addingName && (
            <div className="px-2 py-1.5 space-y-1 border-t">
              <p className="text-[10px] text-muted-foreground">Player name for #{parsedNum}:</p>
              <div className="flex gap-1">
                <Input
                  className="h-6 text-xs flex-1"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Name"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddToRoster(); }}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <button
                  type="button"
                  className={cn(
                    "text-[10px] px-2 rounded bg-primary text-primary-foreground hover:bg-primary/90",
                    !newPlayerName.trim() && "opacity-50 pointer-events-none"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleAddToRoster}
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
