/**
 * GradeOverwriteDialog — Field-scoped overwrite confirmation for grade changes.
 * Shows diffs where a committed non-null grade is being changed.
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
import { GRADE_LABELS } from "@/engine/personnel";

export interface GradeOverwriteDiff {
  field: string;
  before: number | null;
  after: number | null;
}

interface GradeOverwriteDialogProps {
  open: boolean;
  diffs: GradeOverwriteDiff[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function GradeOverwriteDialog({ open, diffs, onConfirm, onCancel }: GradeOverwriteDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Grade Overwrite</AlertDialogTitle>
          <AlertDialogDescription>
            The following grades have existing committed values that will be changed:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-3 py-1.5 font-semibold">Position</th>
                <th className="text-center px-3 py-1.5 font-semibold">Current</th>
                <th className="text-center px-3 py-1.5 font-semibold">New</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d) => (
                <tr key={d.field} className="border-t border-border">
                  <td className="px-3 py-1.5 font-medium">{GRADE_LABELS[d.field] ?? d.field}</td>
                  <td className="px-3 py-1.5 text-center font-mono">{d.before ?? "—"}</td>
                  <td className="px-3 py-1.5 text-center font-mono">{d.after ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm Overwrite</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
