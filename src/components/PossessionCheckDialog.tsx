/**
 * Possession Check Confirmation Dialog
 *
 * Blocking modal shown at Review Proposal when possession likely changed
 * and the next slot is still set to Offense (ODK = "O").
 * Only shown when ODK filter is NOT active.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PossessionCheckDialogProps {
  open: boolean;
  prevPlayInfo?: { playNum: number; result: string } | null;
  onConfirmOffense: () => void;
  onCancel: () => void;
}

export function PossessionCheckDialog({
  open,
  prevPlayInfo,
  onConfirmOffense,
  onCancel,
}: PossessionCheckDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Possession check</AlertDialogTitle>
          <AlertDialogDescription>
            The previous play's result suggests the other team may have the ball
            next, but this slot is set to Offense. Confirm Offense to continue,
            or change the next slot to Defense or Kick.
            {prevPlayInfo && (
              <>
                <br />
                <span className="mt-1 block text-xs">
                  Previous play: Play {prevPlayInfo.playNum} — {prevPlayInfo.result}.
                </span>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmOffense}>
            Confirm Offense
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
