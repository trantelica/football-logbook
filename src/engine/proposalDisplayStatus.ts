/**
 * Proposal Display Status — coach-facing field status for the draft/proposal surface.
 *
 * This is a thin view-model layer that computes:
 *  1. Whether a field is "relevant" for the current proposal display
 *  2. A coach-friendly display status for rendering
 *
 * Does not mutate any state. Does not change commit architecture.
 */

import type { ProposalMetaMap } from "./proposalMeta";
import type { FieldDefinition } from "./schema";

/** Coach-facing display status — never shown as raw labels */
export type ProposalDisplayStatus =
  | "resolved"       // field has a usable value, no issues
  | "ai_proposed"    // value sourced from AI, awaiting coach review
  | "unresolved"     // relevant field with no usable value
  | "blocked";       // governance-blocked (unknown lookup value)

export interface FieldDisplayInfo {
  fieldName: string;
  label: string;
  displayStatus: ProposalDisplayStatus;
  /** Short coach-facing label for badge/indicator */
  statusLabel: string;
}

/**
 * Determine whether a field is relevant for the current proposal context.
 *
 * Conservative heuristic — avoids flooding UI with every null field.
 */
export function isFieldRelevant(
  fieldName: string,
  fieldDef: FieldDefinition,
  opts: {
    activePass: number;
    touchedFields: Set<string>;
    deterministicParseFields: Set<string>;
    aiProposedFields: Set<string>;
    predictedFields: Set<string>;
    carriedForwardFields: Set<string>;
    lookupDerivedFields: Set<string>;
    proposalMeta: ProposalMetaMap;
    candidateValue: unknown;
  },
): boolean {
  // Always skip system fields
  if (fieldName === "gameId" || fieldName === "playNum") return false;

  // Field must be in scope for current pass
  if (fieldDef.defaultPassEntry > opts.activePass) return false;

  // Has a value → always relevant
  if (opts.candidateValue !== null && opts.candidateValue !== undefined && opts.candidateValue !== "") {
    return true;
  }

  // Has provenance from current interaction
  if (opts.touchedFields.has(fieldName)) return true;
  if (opts.deterministicParseFields.has(fieldName)) return true;
  if (opts.aiProposedFields.has(fieldName)) return true;
  if (opts.predictedFields.has(fieldName)) return true;
  if (opts.carriedForwardFields.has(fieldName)) return true;
  if (opts.lookupDerivedFields.has(fieldName)) return true;

  // Governance-blocked
  const meta = opts.proposalMeta.get(fieldName);
  if (meta?.status === "governance_blocked") return true;

  // Required at commit → relevant even when empty
  if (fieldDef.requiredAtCommit) return true;

  return false;
}

/**
 * Compute the coach-facing display status for a single field.
 */
export function computeDisplayStatus(
  fieldName: string,
  opts: {
    candidateValue: unknown;
    proposalMeta: ProposalMetaMap;
    aiProposedFields: Set<string>;
  },
): ProposalDisplayStatus {
  const meta = opts.proposalMeta.get(fieldName);

  // Governance-blocked takes priority
  if (meta?.status === "governance_blocked") return "blocked";

  // AI-proposed with a value
  if (opts.aiProposedFields.has(fieldName)) {
    const val = opts.candidateValue;
    if (val !== null && val !== undefined && val !== "") return "ai_proposed";
    return "unresolved";
  }

  // Has a usable value
  const val = opts.candidateValue;
  if (val !== null && val !== undefined && val !== "") return "resolved";

  return "unresolved";
}

/** Coach-facing status labels — short, non-technical */
const STATUS_LABELS: Record<ProposalDisplayStatus, string> = {
  resolved: "",
  ai_proposed: "AI",
  unresolved: "Needs review",
  blocked: "Blocked",
};

export function getStatusLabel(status: ProposalDisplayStatus): string {
  return STATUS_LABELS[status];
}
