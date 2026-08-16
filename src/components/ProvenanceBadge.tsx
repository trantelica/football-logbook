/**
 * ProvenanceBadge — where a proposed value came from (UX spec §6).
 *
 * Previously each badge was an inline span repeating the same eleven utility
 * classes with hand-written dark: variants, duplicated across DraftPanel,
 * BlockingPanel, and PersonnelPanel. Adding a provenance kind meant editing
 * three files, and the palettes had already drifted between them.
 *
 * One component, one token set. The spec's rule — "badges should help, not
 * clutter" — is easier to hold when the styling lives in a single place.
 */

import { cn } from "@/lib/utils";

export type Provenance =
  | "predicted"
  | "parsed"
  | "ai"
  | "lookup"
  | "carryForward"
  | "override";

const STYLES: Record<Provenance, { label: string; className: string; title: string }> = {
  predicted: {
    label: "Predicted",
    title: "Deterministic prediction from the previous committed play",
    className: "text-predicted-foreground bg-predicted-muted",
  },
  parsed: {
    label: "Parser",
    title: "Extracted from your narration by the deterministic parser",
    className: "text-parsed-foreground bg-parsed-muted",
  },
  ai: {
    label: "AI",
    title: "AI-suggested — advisory only, verify before committing",
    className: "text-ai-foreground bg-ai-muted",
  },
  lookup: {
    label: "Lookup",
    title: "Derived from a governed lookup value",
    className: "text-info bg-info-muted",
  },
  carryForward: {
    label: "Carried",
    title: "Carried forward from prior committed context",
    className: "text-candidate-foreground bg-candidate-muted",
  },
  override: {
    label: "Override",
    title: "You changed a proposed or default value",
    className: "text-proposal bg-proposal-muted",
  },
};

/**
 * Badge classes for a provenance kind.
 *
 * Exported separately from the component because several call sites wrap the
 * badge in a Tooltip trigger and supply their own icon and short label. They
 * need the palette, not the markup.
 */
export function provenanceBadgeClass(kind: Provenance): string {
  return cn(
    "inline-flex items-center gap-0.5 rounded px-1 text-[9px] font-semibold",
    STYLES[kind].className,
  );
}

export function ProvenanceBadge({
  kind,
  label,
  className,
}: {
  kind: Provenance;
  /** Override the default word (e.g. a short form where space is tight). */
  label?: string;
  className?: string;
}) {
  const style = STYLES[kind];
  return (
    <span
      title={style.title}
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 text-[9px] font-semibold",
        style.className,
        className,
      )}
    >
      {label ?? style.label}
    </span>
  );
}

/**
 * Field tint for a proposed value.
 *
 * Returns the wash + border applied to an input whose value came from somewhere
 * other than the coach. Precedence is the caller's job; this only maps a
 * resolved provenance to classes.
 */
export function provenanceFieldClass(kind: Provenance | null): string {
  switch (kind) {
    case "predicted":
      return "bg-predicted-muted border-predicted-border";
    case "parsed":
      return "bg-parsed-muted border-parsed-border";
    case "ai":
      return "bg-ai-muted border-ai-border";
    default:
      return "";
  }
}
