import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LookupConfirmDialogProps {
  open: boolean;
  fieldLabel: string;
  value: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LookupConfirmDialog({
  open,
  fieldLabel,
  value,
  onConfirm,
  onCancel,
}: LookupConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Add New Lookup Value</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Add <span className="font-mono font-semibold text-foreground">"{value}"</span> to{" "}
          <span className="font-semibold text-foreground">{fieldLabel}</span>?
        </p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Add Value
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
