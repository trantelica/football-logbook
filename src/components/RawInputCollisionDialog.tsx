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

export interface Collision {
  fieldName: string;
  currentValue: unknown;
  proposedValue: unknown;
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Raw Input Collision Review</DialogTitle>
          <DialogDescription>
            {nonCollisionCount > 0 && (
              <span>{nonCollisionCount} field(s) will be applied without conflict. </span>
            )}
            The following {collisions.length} field(s) already have values. Select which to overwrite:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {collisions.map((c) => (
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
                <span className="font-medium">{getLabel(c.fieldName)}</span>
                <div className="flex gap-3 text-muted-foreground font-mono">
                  <span>Current: <span className="text-foreground">{formatValue(c.currentValue)}</span></span>
                  <span>→ <span className="text-primary">{formatValue(c.proposedValue)}</span></span>
                </div>
              </div>
            </label>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onConfirm(selected)}>
            Apply {selected.size + nonCollisionCount} field(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
