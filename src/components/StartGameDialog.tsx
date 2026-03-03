/**
 * Start Game Dialog — Phase 3 game initialization wizard.
 * Collects opponent, date, total plays, quarter starts, and ODK blocks.
 */

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGameContext } from "@/engine/gameContext";
import { useSeason } from "@/engine/seasonContext";
import { validateInitConfig, type InitValidationError } from "@/engine/slotEngine";
import { ODK_VALUES } from "@/engine/schema";
import type { ODKBlock } from "@/engine/types";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { getSeasonConfig } from "@/engine/db";
import { toast } from "sonner";

interface StartGameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StartGameDialog({ open, onOpenChange }: StartGameDialogProps) {
  const { initializeGame } = useGameContext();
  const { activeSeason } = useSeason();

  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [totalPlays, setTotalPlays] = useState("");
  const [fieldSize, setFieldSize] = useState<"80" | "100">("80");

  // Load fieldSize from season config on open
  React.useEffect(() => {
    if (!open || !activeSeason) return;
    getSeasonConfig(activeSeason.seasonId)
      .then((cfg) => {
        if (cfg) setFieldSize(String(cfg.fieldSize) as "80" | "100");
      })
      .catch(() => {});
  }, [open, activeSeason]);
  const [patMode, setPatMode] = useState<"none" | "youth_1_2" | "hs_kick">("none");
  const [q1Start, setQ1Start] = useState("1");
  const [q2Start, setQ2Start] = useState("");
  const [q3Start, setQ3Start] = useState("");
  const [q4Start, setQ4Start] = useState("");
  const [odkBlocks, setOdkBlocks] = useState<ODKBlock[]>([
    { odk: "O", startPlay: 1, endPlay: 1 },
  ]);
  const [errors, setErrors] = useState<InitValidationError[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setOpponent("");
    setDate(new Date().toISOString().slice(0, 10));
    setTotalPlays("");
    setFieldSize("80");
    setPatMode("none");
    setQ1Start("1");
    setQ2Start("");
    setQ3Start("");
    setQ4Start("");
    setOdkBlocks([{ odk: "O", startPlay: 1, endPlay: 1 }]);
    setErrors([]);
  };

  const handleCreate = async () => {
    if (!activeSeason || !opponent.trim() || !date || !totalPlays) return;

    const n = parseInt(totalPlays, 10);
    const quarterStarts: Record<string, number> = {
      "1": parseInt(q1Start, 10) || 1,
      "2": parseInt(q2Start, 10) || 0,
      "3": parseInt(q3Start, 10) || 0,
      "4": parseInt(q4Start, 10) || 0,
    };

    const validationErrors = validateInitConfig(n, quarterStarts, odkBlocks);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      await initializeGame(opponent.trim(), date, n, quarterStarts, odkBlocks, Number(fieldSize) as 80 | 100, patMode);
      toast.success(`Game initialized: ${n} slots created`);
      resetForm();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to initialize game");
    } finally {
      setSubmitting(false);
    }
  };

  const addOdkBlock = () => {
    setOdkBlocks((prev) => {
      const lastBlock = prev[prev.length - 1];
      const nextStart = lastBlock ? lastBlock.endPlay + 1 : 1;
      return [...prev, { odk: "O", startPlay: nextStart, endPlay: 0 }];
    });
  };

  const removeOdkBlock = (index: number) => {
    setOdkBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateOdkBlock = (index: number, field: keyof ODKBlock, value: string | number) => {
    setOdkBlocks((prev) =>
      prev.map((block, i) =>
        i === index ? { ...block, [field]: field === "odk" ? value : parseInt(String(value), 10) || 0 } : block
      )
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Start Game (Pass 0)</DialogTitle>
        </DialogHeader>

        {!activeSeason ? (
          <p className="text-sm text-muted-foreground py-4">
            Please create or select a season first.
          </p>
        ) : (
          <div className="space-y-5">
            {/* Season info */}
            <div className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">
              Season: <span className="font-semibold">{activeSeason.label}</span>
            </div>

            {/* Game basics */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Game Info
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="sg-opponent" className="text-xs">Opponent *</Label>
                  <Input
                    id="sg-opponent"
                    value={opponent}
                    onChange={(e) => setOpponent(e.target.value)}
                    placeholder="e.g. Central High"
                    className="h-8 text-sm"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sg-date" className="text-xs">Date *</Label>
                  <Input
                    id="sg-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sg-total" className="text-xs">Total Plays (N) *</Label>
                <Input
                  id="sg-total"
                  type="number"
                  min="1"
                  value={totalPlays}
                  onChange={(e) => setTotalPlays(e.target.value)}
                  placeholder="e.g. 80"
                  className="h-8 text-sm w-32"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Field Size</Label>
                <ToggleGroup
                  type="single"
                  value={fieldSize}
                  onValueChange={() => {}}
                  size="sm"
                  className="justify-start"
                  disabled
                >
                  <ToggleGroupItem value="80" className="text-xs px-3 h-7 font-medium">
                    80 yards
                  </ToggleGroupItem>
                  <ToggleGroupItem value="100" className="text-xs px-3 h-7 font-medium">
                    100 yards
                  </ToggleGroupItem>
                </ToggleGroup>
                <p className="text-[10px] text-muted-foreground">
                  Field size is set at the season level.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">PAT Mode</Label>
                <ToggleGroup
                  type="single"
                  value={patMode}
                  onValueChange={(val) => { if (val) setPatMode(val as "none" | "youth_1_2" | "hs_kick"); }}
                  size="sm"
                  className="justify-start"
                >
                  <ToggleGroupItem value="none" className="text-xs px-3 h-7 font-medium">
                    None
                  </ToggleGroupItem>
                  <ToggleGroupItem value="youth_1_2" className="text-xs px-3 h-7 font-medium">
                    Youth (1/2 Pt.)
                  </ToggleGroupItem>
                  <ToggleGroupItem value="hs_kick" className="text-xs px-3 h-7 font-medium">
                    HS Kick
                  </ToggleGroupItem>
                </ToggleGroup>
                <p className="text-[10px] text-muted-foreground">
                  Controls PAT handling after touchdowns. Immutable after creation.
                </p>
              </div>
            </fieldset>

            {/* Quarter mapping */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Quarter Start Play Numbers
              </legend>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Q1", value: q1Start, setter: setQ1Start },
                  { label: "Q2", value: q2Start, setter: setQ2Start },
                  { label: "Q3", value: q3Start, setter: setQ3Start },
                  { label: "Q4", value: q4Start, setter: setQ4Start },
                ].map(({ label, value, setter }) => (
                  <div key={label} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      className="h-8 text-sm font-mono"
                      placeholder="—"
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Must be ascending. All within 1..N.
              </p>
            </fieldset>

            {/* ODK blocks */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                O/D/K Blocks (Inclusive Ranges)
              </legend>
              <div className="space-y-2">
                {odkBlocks.map((block, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select
                      value={block.odk}
                      onValueChange={(v) => updateOdkBlock(i, "odk", v)}
                    >
                      <SelectTrigger className="w-16 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ODK_VALUES.map((v) => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      value={block.startPlay || ""}
                      onChange={(e) => updateOdkBlock(i, "startPlay", e.target.value)}
                      placeholder="Start"
                      className="h-8 text-sm font-mono w-20"
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input
                      type="number"
                      min="1"
                      value={block.endPlay || ""}
                      onChange={(e) => updateOdkBlock(i, "endPlay", e.target.value)}
                      placeholder="End play #"
                      className="h-8 text-sm font-mono w-20"
                    />
                    {odkBlocks.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => removeOdkBlock(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={addOdkBlock}
              >
                <Plus className="h-3 w-3" />
                Add Block
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Blocks must not overlap. All within 1..N. Allowed: O, D, K, S.
              </p>
            </fieldset>

            {/* Validation errors */}
            {errors.length > 0 && (
              <div className="rounded border border-destructive/30 bg-destructive/5 p-2 space-y-1">
                <div className="flex items-center gap-1 text-xs font-semibold text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Validation Errors
                </div>
                {errors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive">{err.message}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
            Cancel
          </Button>
          {activeSeason && (
            <Button
              onClick={handleCreate}
              disabled={!opponent.trim() || !date || !totalPlays || submitting}
            >
              {submitting ? "Creating…" : "Start Game"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
