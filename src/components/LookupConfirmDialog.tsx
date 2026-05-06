import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { LOOKUP_DEPENDENT_ATTRS } from "@/engine/schema";

export const COMMON_PLAY_TYPES: readonly string[] = ["Run", "Pass"];

/**
 * UI-only ordering helper for the Add New offPlay modal.
 * Splits playType allowedValues into a "Common" group (Run, Pass)
 * and an "Other" group preserving original order. Does not mutate
 * or remove any values; canonical commit value is unchanged.
 */
export function partitionPlayTypeOptions(allowedValues: readonly string[]): {
  common: string[];
  other: string[];
} {
  const common = COMMON_PLAY_TYPES.filter((v) => allowedValues.includes(v));
  const other = allowedValues.filter((v) => !common.includes(v));
  return { common, other };
}

interface LookupConfirmDialogProps {
  open: boolean;
  fieldName: string;
  fieldLabel: string;
  value: string;
  onConfirm: (attributes?: Record<string, string>) => void;
  onCancel: () => void;
}

export function LookupConfirmDialog({
  open,
  fieldName,
  fieldLabel,
  value,
  onConfirm,
  onCancel,
}: LookupConfirmDialogProps) {
  const attrDefs = LOOKUP_DEPENDENT_ATTRS[fieldName] ?? [];
  const [attrs, setAttrs] = useState<Record<string, string>>({});

  const allFilled = attrDefs.every((d) => attrs[d.name]?.trim());

  const handleConfirm = () => {
    onConfirm(attrDefs.length > 0 ? attrs : undefined);
    setAttrs({});
  };

  const handleCancel = () => {
    setAttrs({});
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Add New Lookup Value
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Add{" "}
          <span className="font-mono font-semibold text-foreground">
            &ldquo;{value}&rdquo;
          </span>{" "}
          to{" "}
          <span className="font-semibold text-foreground">{fieldLabel}</span>?
        </p>
        {attrDefs.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Set dependent attributes:
            </p>
            {attrDefs.map((def) => (
              <div key={def.name} className="space-y-1">
                <Label className="text-xs font-medium">{def.label}</Label>
                <Select
                  value={attrs[def.name] ?? ""}
                  onValueChange={(v) =>
                    setAttrs((prev) => ({ ...prev, [def.name]: v }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldName === "offPlay" && def.name === "playType" ? (() => {
                      const allowed = def.allowedValues;
                      const common = COMMON_PLAY_TYPES.filter((v) => allowed.includes(v));
                      const others = allowed.filter((v) => !common.includes(v));
                      return (
                        <>
                          {common.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Common</SelectLabel>
                              {common.map((v) => (
                                <SelectItem key={v} value={v}>{v}</SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          {others.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Other</SelectLabel>
                              {others.map((v) => (
                                <SelectItem key={v} value={v}>{v}</SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                        </>
                      );
                    })() : (
                      def.allowedValues.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={attrDefs.length > 0 && !allFilled}
          >
            Add Value
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
