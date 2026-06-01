/**
 * PlayContextHeader — read-only persistent play context strip.
 *
 * UX Slice 2a: surfaces playNum / qtr / odk / dn / dist / yardLn / hash from
 * the current candidate so coaches can always see what play they are working
 * on. Pure display — no mutations, no proposal/commit logic, no field writes.
 */

import { useTransaction } from "@/engine/transaction";
import { cn } from "@/lib/utils";

const QTR_LABELS: Record<number, string> = {
  1: "Q1",
  2: "Q2",
  3: "Q3",
  4: "Q4",
  5: "OT",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function ContextChip({ label, value }: { label: string; value: string }) {
  const isEmpty = value === "—";
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-xs font-mono font-medium tabular-nums",
          isEmpty ? "text-muted-foreground/60" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function PlayContextHeader() {
  const { candidate, activePass } = useTransaction();
  const c = candidate as Record<string, unknown>;

  const qtrRaw = c.qtr;
  const qtrLabel =
    typeof qtrRaw === "number" && QTR_LABELS[qtrRaw]
      ? QTR_LABELS[qtrRaw]
      : fmt(qtrRaw);

  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-muted/40 px-3 py-2"
      aria-label="Current play context"
    >
      <ContextChip label="Play" value={fmt(c.playNum)} />
      <span className="h-3 w-px bg-border" aria-hidden />
      <ContextChip label="Qtr" value={qtrLabel} />
      <ContextChip label="ODK" value={fmt(c.odk)} />
      <span className="h-3 w-px bg-border" aria-hidden />
      <ContextChip label="Dn" value={fmt(c.dn)} />
      <ContextChip label="Dist" value={fmt(c.dist)} />
      <ContextChip label="YardLn" value={fmt(c.yardLn)} />
      <ContextChip label="Hash" value={fmt(c.hash)} />
      <span className="h-3 w-px bg-border" aria-hidden />
      <ContextChip label="Off Form" value={fmt(c.offForm)} />
      <ContextChip label="Off Play" value={fmt(c.offPlay)} />
      <span className="ml-auto text-[10px] uppercase tracking-wide text-warning">
        Pass {activePass}
      </span>
    </div>
  );
}
