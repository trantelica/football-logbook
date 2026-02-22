/**
 * PAT Attempt Dialog (Combined)
 *
 * Captures both try type ("Going for 1" / "Going for 2")
 * and outcome ("Good" / "No Good" / "Penalty") in a single dialog.
 * For penalty re-try, the try type is locked/preselected.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PATTryDialogProps {
  open: boolean;
  /** If set, try type is locked (penalty re-try) */
  lockedTry?: "1" | "2" | null;
  onConfirm: (patTry: "1" | "2", result: "Good" | "No Good" | "Penalty") => void;
  onCancel: () => void;
}

const TRY_OPTIONS = [
  { value: "1" as const, label: "Going for 1", sub: "Extra Pt." },
  { value: "2" as const, label: "Going for 2", sub: "2 Pt." },
];

const OUTCOME_OPTIONS: Array<{ value: "Good" | "No Good" | "Penalty"; label: string }> = [
  { value: "Good", label: "Good" },
  { value: "No Good", label: "No Good" },
  { value: "Penalty", label: "Penalty" },
];

export function PATTryDialog({ open, lockedTry, onConfirm, onCancel }: PATTryDialogProps) {
  const [selectedTry, setSelectedTry] = useState<"1" | "2" | null>(lockedTry ?? null);
  const [selectedOutcome, setSelectedOutcome] = useState<"Good" | "No Good" | "Penalty" | null>(null);

  // Reset state when dialog opens/closes or lockedTry changes
  useEffect(() => {
    if (open) {
      setSelectedTry(lockedTry ?? null);
      setSelectedOutcome(null);
    }
  }, [open, lockedTry]);

  const tryLocked = lockedTry != null;
  const canConfirm = selectedTry !== null && selectedOutcome !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>PAT Attempt</DialogTitle>
          <DialogDescription>
            Touchdown scored. Confirm the try and outcome.
          </DialogDescription>
        </DialogHeader>

        {/* Try type selection */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Try Type {tryLocked && <span className="text-sky-600 dark:text-sky-400 normal-case">(carried from penalty)</span>}
          </p>
          <div className="flex gap-3">
            {TRY_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="lg"
                variant="outline"
                disabled={tryLocked && opt.value !== lockedTry}
                className={cn(
                  "flex-1 h-14 text-sm font-semibold flex flex-col gap-0.5",
                  selectedTry === opt.value && "border-primary bg-primary/10 ring-2 ring-primary/30"
                )}
                onClick={() => setSelectedTry(opt.value)}
              >
                <span>{opt.label}</span>
                <span className="text-[10px] font-normal text-muted-foreground">{opt.sub}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Outcome selection */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Outcome</p>
          <div className="flex gap-3">
            {OUTCOME_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="lg"
                variant="outline"
                className={cn(
                  "flex-1 h-12 text-sm font-semibold",
                  selectedOutcome === opt.value && "border-primary bg-primary/10 ring-2 ring-primary/30"
                )}
                onClick={() => setSelectedOutcome(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!canConfirm}
            onClick={() => {
              if (selectedTry && selectedOutcome) {
                onConfirm(selectedTry, selectedOutcome);
              }
            }}
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
