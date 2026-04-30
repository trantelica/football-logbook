/**
 * ConfigModeDialog — Season configuration modal (Phase 9.1 / 9.1.2)
 */

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSeason } from "@/engine/seasonContext";
import { getSeasonConfig, saveSeasonConfig, countSeasonCommittedPlays } from "@/engine/db";
import { buildDefaultConfig, diffConfig, type SeasonConfig } from "@/engine/configStore";
import { playSchema } from "@/engine/schema";
import { PERSONNEL_POSITIONS, PERSONNEL_LABELS } from "@/engine/personnel";
import { validateAliasMap, type PositionAliasMap } from "@/engine/positionAliases";
import { toast } from "sonner";

interface ConfigModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigModeDialog({ open, onOpenChange }: ConfigModeDialogProps) {
  const { activeSeason, setConfigMode } = useSeason();
  const seasonId = activeSeason?.seasonId ?? "";

  const [loadedConfig, setLoadedConfig] = useState<SeasonConfig | null>(null);
  const [fieldSize, setFieldSize] = useState<"80" | "100">("80");
  const [patMode, setPatMode] = useState<"none" | "youth_1_2" | "hs_kick">("none");
  const [activeFields, setActiveFields] = useState<Record<string, boolean>>({});
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);

  const fieldKeys = playSchema.map((f) => f.name);

  // Ensure configMode resets whenever dialog closes by any path (ESC, overlay, etc.)
  useEffect(() => {
    if (!open) setConfigMode(false);
  }, [open, setConfigMode]);

  useEffect(() => {
    if (!open || !seasonId) return;
    setConfigMode(true);

    let cancelled = false;
    (async () => {
      const [existing, playCount] = await Promise.all([
        getSeasonConfig(seasonId),
        countSeasonCommittedPlays(seasonId),
      ]);
      if (cancelled) return;

      const config = existing ?? buildDefaultConfig(seasonId, fieldKeys);
      setLoadedConfig(config);
      setFieldSize(String(config.fieldSize) as "80" | "100");
      setPatMode(config.patMode ?? "none");
      setActiveFields({ ...config.activeFields });
      setLocked(playCount > 0);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seasonId]);

  const handleClose = () => {
    setConfigMode(false);
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!loadedConfig) return;
    setSaving(true);
    try {
      const after: SeasonConfig = {
        ...loadedConfig,
        fieldSize: Number(fieldSize) as 80 | 100,
        patMode,
        activeFields: { ...activeFields },
      };
      await saveSeasonConfig(after, loadedConfig);
      toast.success("Season configuration saved.");
      setConfigMode(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const toggleField = (name: string) => {
    setActiveFields((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Season Configuration</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Field Size */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Field Size
            </Label>
            <ToggleGroup
              type="single"
              value={fieldSize}
              onValueChange={(val) => { if (val) setFieldSize(val as "80" | "100"); }}
              size="sm"
              className="justify-start"
              disabled={locked}
            >
              <ToggleGroupItem value="80" className="text-xs px-3 h-7 font-medium">
                80 yards
              </ToggleGroupItem>
              <ToggleGroupItem value="100" className="text-xs px-3 h-7 font-medium">
                100 yards
              </ToggleGroupItem>
            </ToggleGroup>
            {locked && (
              <p className="text-[10px] text-muted-foreground">
                Field size is locked after plays have been committed to protect determinism.
              </p>
            )}
          </div>

          {/* PAT Mode */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              PAT Mode
            </Label>
            <ToggleGroup
              type="single"
              value={patMode}
              onValueChange={(val) => { if (val) setPatMode(val as "none" | "youth_1_2" | "hs_kick"); }}
              size="sm"
              className="justify-start"
              disabled={locked}
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
            {locked && (
              <p className="text-[10px] text-muted-foreground">
                PAT configuration is locked after plays have been committed to protect determinism.
              </p>
            )}
          </div>

          {/* Active Fields */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Active Fields
            </Label>
            <div className="grid grid-cols-2 gap-1.5 max-h-[40vh] overflow-y-auto">
              {fieldKeys.map((name) => {
                const def = playSchema.find((f) => f.name === name);
                return (
                  <label
                    key={name}
                    className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                  >
                    <Checkbox
                      checked={activeFields[name] ?? true}
                      onCheckedChange={() => toggleField(name)}
                    />
                    <span>{def?.label ?? name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
