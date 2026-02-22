/**
 * PAT Try Type Dialog
 *
 * Shown when entering a slot immediately after a TD in youth PAT mode.
 * Requires user to choose "Going for 1" or "Going for 2".
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PATTryDialogProps {
  open: boolean;
  onSelect: (patTry: "1" | "2") => void;
  onCancel: () => void;
}

export function PATTryDialog({ open, onSelect, onCancel }: PATTryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>PAT Attempt</DialogTitle>
          <DialogDescription>
            Touchdown scored. Select the PAT try type.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 justify-center py-4">
          <Button
            size="lg"
            variant="outline"
            className="flex-1 h-16 text-base font-semibold"
            onClick={() => onSelect("1")}
          >
            Going for 1
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="flex-1 h-16 text-base font-semibold"
            onClick={() => onSelect("2")}
          >
            Going for 2
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
