import React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useTransaction } from "@/engine/transaction";
import { playSchema } from "@/engine/schema";

export function OverwriteReview() {
  const { state, existingPlay, pendingNormalized, confirmOverwrite, cancelOverwrite } =
    useTransaction();

  if (state !== "overwrite-review" || !existingPlay || !pendingNormalized) return null;

  const changedFields = playSchema.filter((f) => {
    const oldVal = (existingPlay as unknown as Record<string, unknown>)[f.name];
    const newVal = (pendingNormalized as unknown as Record<string, unknown>)[f.name];
    return String(oldVal ?? "") !== String(newVal ?? "");
  });

  const isNoop = changedFields.length === 0;

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-proposal">
            Overwrite Play #{existingPlay.playNum}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isNoop
              ? "No differences detected between the existing and proposed values. Overwrite is blocked."
              : "A committed play already exists for this play number. Review the changes below before confirming."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[300px] overflow-auto space-y-1 text-sm">
          <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-muted-foreground border-b pb-1">
            <span>Field</span>
            <span>Current</span>
            <span>New</span>
          </div>
          {changedFields.map((f) => {
            const oldVal = (existingPlay as unknown as Record<string, unknown>)[f.name];
            const newVal = (pendingNormalized as unknown as Record<string, unknown>)[f.name];
            return (
              <div
                key={f.name}
                className="grid grid-cols-3 gap-2 text-xs font-mono py-0.5"
              >
                <span className="text-muted-foreground">{f.label}</span>
                <span className="text-destructive/70">
                  {oldVal != null ? String(oldVal) : "—"}
                </span>
                <span className="text-committed">
                  {newVal != null ? String(newVal) : "—"}
                </span>
              </div>
            );
          })}
          {isNoop && (
            <p className="text-xs text-muted-foreground py-2">
              No field differences detected.
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelOverwrite}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmOverwrite}
            disabled={isNoop}
            className="bg-proposal text-proposal-foreground hover:bg-proposal/90 disabled:opacity-50"
          >
            Confirm Overwrite
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
