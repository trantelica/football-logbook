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
import type { PlayRecord } from "@/engine/types";

export function OverwriteReview() {
  const { state, existingPlay, candidate, confirmOverwrite, cancelOverwrite } =
    useTransaction();

  if (state !== "overwrite-review" || !existingPlay) return null;

  const changedFields = playSchema.filter((f) => {
    const oldVal = (existingPlay as unknown as Record<string, unknown>)[f.name];
    const newVal = (candidate as Record<string, unknown>)[f.name];
    return String(oldVal ?? "") !== String(newVal ?? "");
  });

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-draft">
            Overwrite Play #{existingPlay.playNum}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            A committed play already exists for this play number. Review the
            changes below before confirming.
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
            const newVal = (candidate as Record<string, unknown>)[f.name];
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
          {changedFields.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              No field differences detected.
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelOverwrite}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmOverwrite}
            className="bg-draft text-draft-foreground hover:bg-draft/90"
          >
            Confirm Overwrite
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
