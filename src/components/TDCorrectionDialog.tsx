/**
 * Phase 5C — TD Labeling Correction Dialog
 *
 * Shown when a play reaches the goal line but result lacks TD suffix.
 * Forces user to update result before committing.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TDCorrectionDialogProps {
  open: boolean;
  correctedResult: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TDCorrectionDialog({
  open,
  correctedResult,
  onConfirm,
  onCancel,
}: TDCorrectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Touchdown Detected</DialogTitle>
          <DialogDescription>
            This play reaches the goal line. Update result to <strong>{correctedResult}</strong> and commit?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            Update &amp; Commit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
