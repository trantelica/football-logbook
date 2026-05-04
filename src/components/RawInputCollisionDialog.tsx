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
 * Dialog-local Collision shape. The optional `source`, `note`, `groupKey`,
 * and `signalLabel` fields are UI-only display metadata decorated by the
 * caller (e.g. Pass1SectionPanel tagging AI parser-crosscheck corrections,
 * or Lookup Assist option rows). They are intentionally NOT part of the core
 * transaction `SystemPatchCollision` shape — keeping them local to the
 * dialog avoids polluting the transaction model with display concerns.
 */
export interface Collision {
  fieldName: string;
  currentValue: unknown;
  proposedValue: unknown;
  /** Display-only origin tag. */
  source?: "ai_correction" | "lookup_assist";
  /** Optional short, coach-friendly helper text shown under the value pair. */
  note?: string;
  /** Lookup Assist grouping. Rows with the same groupKey are mutually exclusive. */
  groupKey?: string;
  /** Coach-friendly chip text, e.g. "Number match", "Sounds like". */
  signalLabel?: string;
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
  // Lookup Assist rows start UNSELECTED (coach must opt in).
  // Legacy / AI correction rows preserve the prior pre-selected behavior.
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        collisions
          .filter((c) => c.source !== "lookup_assist")
          .map((c) => c.fieldName)
      )
  );

  const toggle = (row: Collision) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const isOn = next.has(row.fieldName);
      if (isOn) {
        next.delete(row.fieldName);
        return next;
      }
      // Single-select per group: clear siblings in the same groupKey first.
      if (row.groupKey) {
        for (const c of collisions) {
          if (c.groupKey === row.groupKey && c.fieldName !== row.fieldName) {
            next.delete(c.fieldName);
          }
        }
      }
      next.add(row.fieldName);
      return next;
    });
  };

  const getLabel = (fieldName: string) =>
    playSchema.find((f) => f.name === fieldName)?.label ?? fieldName;

  const formatValue = (v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : String(v);

  // Display-mode derivation.
  const aiRowCount = collisions.filter((c) => c.source === "ai_correction").length;
  const assistRowCount = collisions.filter((c) => c.source === "lookup_assist").length;
  const hasAiRows = aiRowCount > 0;
  const allAiRows = hasAiRows && aiRowCount === collisions.length;
  const hasAssistRows = assistRowCount > 0;
  const allAssistRows = hasAssistRows && assistRowCount === collisions.length;

  const title = hasAiRows
    ? "Review suggested updates"
    : allAssistRows
      ? "Pick known values"
      : "Raw Input Collision Review";

  const subnote = hasAiRows
    ? "Accepting updates the draft only. You'll still review and commit."
    : allAssistRows
      ? "Tap one per group, or skip."
      : null;

  const cancelLabel = allAiRows
    ? "Skip suggestions"
    : allAssistRows
      ? "Skip"
      : nonCollisionCount > 0
        ? "Keep applied fields and exit"
        : "Stop resolving remaining items";

  const applyLabel = allAiRows
    ? `Apply ${selected.size > 0 ? `${selected.size} suggestion(s)` : "selection"}`
    : allAssistRows
      ? `Apply selected (${selected.size})`
      : `Apply ${selected.size > 0 ? `${selected.size} override(s)` : "selection"}`;

  // Build render order: assist rows grouped by groupKey, then non-assist rows.
  const assistRows = collisions.filter((c) => c.source === "lookup_assist" && c.groupKey);
  const otherRows = collisions.filter((c) => !(c.source === "lookup_assist" && c.groupKey));
  const groupOrder: string[] = [];
  const groups = new Map<string, Collision[]>();
  for (const r of assistRows) {
    const g = r.groupKey!;
    if (!groups.has(g)) {
      groups.set(g, []);
      groupOrder.push(g);
    }
    groups.get(g)!.push(r);
  }

  const renderRow = (c: Collision) => {
    const isAi = c.source === "ai_correction";
    const isAssist = c.source === "lookup_assist";
    return (
      <label
        key={c.fieldName}
        className="flex items-start gap-2 rounded border border-border/50 p-2 cursor-pointer hover:bg-muted/30"
      >
        <Checkbox
          checked={selected.has(c.fieldName)}
          onCheckedChange={() => toggle(c)}
          className="mt-0.5"
        />
        <div className="flex-1 text-xs space-y-0.5">
          <span className="font-medium flex items-center gap-1.5">
            {isAi && (
              <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                AI suggestion
              </span>
            )}
            {!isAssist && getLabel(c.fieldName)}
            {isAssist && (
              <span className="text-foreground">{formatValue(c.proposedValue)}</span>
            )}
            {isAssist && c.signalLabel && (
              <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                {c.signalLabel}
              </span>
            )}
          </span>
          {!isAssist && (
            <div className="flex gap-3 text-muted-foreground font-mono">
              <span>Current: <span className="text-foreground">{formatValue(c.currentValue)}</span></span>
              <span>→ <span className="text-primary">{formatValue(c.proposedValue)}</span></span>
            </div>
          )}
          {isAi && c.note && (
            <p className="text-[11px] text-muted-foreground italic">{c.note}</p>
          )}
        </div>
      </label>
    );
  };

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
              : allAssistRows
                ? `Found ${collisions.length} known option(s) for ${groupOrder.length} field(s):`
                : `The following ${collisions.length} field(s) already have values. Select which to overwrite:`}
          </DialogDescription>
          {subnote && (
            <p className="text-xs text-muted-foreground mt-1">{subnote}</p>
          )}
        </DialogHeader>

        <div className="space-y-3 max-h-72 overflow-y-auto">
          {groupOrder.map((g) => {
            const rows = groups.get(g)!;
            const cur = rows[0]?.currentValue;
            return (
              <div key={g} className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                  {getLabel(g)}
                  {cur != null && cur !== "" && (
                    <span className="ml-2 normal-case font-normal text-muted-foreground/70">
                      Current: {formatValue(cur)}
                    </span>
                  )}
                </p>
                <div className="space-y-1">{rows.map(renderRow)}</div>
              </div>
            );
          })}
          {otherRows.length > 0 && (
            <div className="space-y-1">
              {otherRows.map(renderRow)}
            </div>
          )}
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
