import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { playSchema } from "@/engine/schema";

/**
 * Dialog-local Collision shape. The optional `source` and `note` fields are
 * UI-only display metadata decorated by the caller (e.g. Pass1SectionPanel
 * tagging AI parser-crosscheck corrections). They are intentionally NOT part
 * of the core transaction `SystemPatchCollision` shape — keeping them local
 * to the dialog avoids polluting the transaction model with display concerns.
 */
export interface Collision {
  fieldName: string;
  currentValue: unknown;
  proposedValue: unknown;
  /** Display-only origin tag. Currently only "ai_correction" is recognized. */
  source?: "ai_correction";
  /** Optional short, coach-friendly helper text shown under the value pair. */
  note?: string;
}

interface RawInputCollisionDialogProps {
  open: boolean;
  collisions: Collision[];
  nonCollisionCount: number;
  onConfirm: (selectedFields: Set<string>) => void;
  onCancel: () => void;
}

export function RawInputCollisionDialog({
  open,
  collisions,
  nonCollisionCount,
  onConfirm,
  onCancel,
}: RawInputCollisionDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(collisions.map((c) => c.fieldName))
  );

  const toggle = (fieldName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fieldName)) next.delete(fieldName);
      else next.add(fieldName);
      return next;
    });
  };

  const getLabel = (fieldName: string) =>
    playSchema.find((f) => f.name === fieldName)?.label ?? fieldName;

  const formatValue = (v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : String(v);

  // Slice E: derive AI-correction display modes from row-level metadata.
  const aiRowCount = collisions.filter((c) => c.source === "ai_correction").length;
  const hasAiRows = aiRowCount > 0;
  const allAiRows = hasAiRows && aiRowCount === collisions.length;

  const title = hasAiRows ? "Review suggested updates" : "Raw Input Collision Review";
  const subnote = hasAiRows
    ? "Accepting updates the draft only. You'll still review and commit."
    : null;

  const cancelLabel = allAiRows
    ? "Skip suggestions"
    : nonCollisionCount > 0
      ? "Keep applied fields and exit"
      : "Stop resolving remaining items";

  const applyLabel = allAiRows
    ? `Apply ${selected.size > 0 ? `${selected.size} suggestion(s)` : "selection"}`
    : `Apply ${selected.size > 0 ? `${selected.size} override(s)` : "selection"}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {nonCollisionCount > 0 && (
              <span>{nonCollisionCount} field(s) will be applied without conflict. </span>
            )}
            {hasAiRows
              ? `Review the following ${collisions.length} suggested update(s):`
              : `The following ${collisions.length} field(s) already have values. Select which to overwrite:`}
          </DialogDescription>
          {subnote && (
            <p className="text-xs text-muted-foreground mt-1">{subnote}</p>
          )}
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {collisions.map((c) => {
            const isAi = c.source === "ai_correction";
            return (
              <label
                key={c.fieldName}
                className="flex items-start gap-2 rounded border border-border/50 p-2 cursor-pointer hover:bg-muted/30"
              >
                <Checkbox
                  checked={selected.has(c.fieldName)}
                  onCheckedChange={() => toggle(c.fieldName)}
                  className="mt-0.5"
                />
                <div className="flex-1 text-xs space-y-0.5">
                  <span className="font-medium flex items-center gap-1.5">
                    {isAi && (
                      <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                        AI suggestion
                      </span>
                    )}
                    {getLabel(c.fieldName)}
                  </span>
                  <div className="flex gap-3 text-muted-foreground font-mono">
                    <span>Current: <span className="text-foreground">{formatValue(c.currentValue)}</span></span>
                    <span>→ <span className="text-primary">{formatValue(c.proposedValue)}</span></span>
                  </div>
                  {isAi && c.note && (
                    <p className="text-[11px] text-muted-foreground italic">{c.note}</p>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        {nonCollisionCount > 0 && (
          <div className="rounded border border-border/30 bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
            ✓ {nonCollisionCount} field(s) already applied without conflict.
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button size="sm" onClick={() => onConfirm(selected)}>
            {applyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
