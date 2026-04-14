/**
 * AI Candidate Enrichment — narrow proposal for unresolved fields only.
 *
 * This module provides the pure logic for determining which fields are
 * eligible for AI enrichment and filtering AI proposals accordingly.
 *
 * Rules:
 * - AI may only propose values for fields that are still unresolved
 *   (empty/null/undefined after deterministic parse, prediction,
 *   carry-forward, and lookup-derived have run).
 * - AI must not overwrite any resolved field.
 * - AI must not bypass governance (lookup-backed fields with unknown
 *   values remain governance_blocked).
 * - Collisions are returned explicitly if AI attempts to fill a
 *   now-resolved field.
 * - Governed lookup fields preserve matchType metadata (exact/fuzzy/candidate_new).
 */

import type { CandidateData } from "./types";
import type { AIFieldEvidence, SystemPatchCollision, GovernedMatchType } from "./transaction";
import { AI_ELIGIBLE_FIELDS } from "./aiEligibility";

/** Fields that are system-managed and never AI-enrichable */
const EXCLUDED_FIELDS = new Set(["gameId", "playNum", "qtr", "odk", "series"]);

/** Shape of a governed field AI response (value + match classification) */
export interface GovernedFieldProposal {
  value: unknown;
  matchType: GovernedMatchType;
}

/** Check if a proposal value is a governed field object */
export function isGovernedProposal(v: unknown): v is GovernedFieldProposal {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  return "value" in obj && "matchType" in obj &&
    typeof obj.matchType === "string" &&
    ["exact", "fuzzy", "candidate_new"].includes(obj.matchType);
}

/**
 * Identify fields in the candidate that are still unresolved (empty/null).
 * Respects provenance: any field already in a provenance set is considered
 * resolved and excluded.
 */
export function getUnresolvedFields(opts: {
  candidate: CandidateData;
  touchedFields: Set<string>;
  deterministicParseFields: Set<string>;
  predictedFields: Set<string>;
  carriedForwardFields: Set<string>;
  lookupDerivedFields: Set<string>;
  aiProposedFields: Set<string>;
  /** Field names eligible for the current active pass */
  eligibleFieldNames: string[];
}): string[] {
  const {
    candidate,
    touchedFields,
    deterministicParseFields,
    predictedFields,
    carriedForwardFields,
    lookupDerivedFields,
    aiProposedFields,
    eligibleFieldNames,
  } = opts;

  const resolvedSets = [
    touchedFields,
    deterministicParseFields,
    predictedFields,
    carriedForwardFields,
    lookupDerivedFields,
    aiProposedFields,
  ];

  return eligibleFieldNames.filter((fieldName) => {
    if (EXCLUDED_FIELDS.has(fieldName)) return false;
    // If any provenance set claims this field, it's resolved
    if (resolvedSets.some((s) => s.has(fieldName))) return false;
    // Check if the candidate value is empty
    const val = (candidate as Record<string, unknown>)[fieldName];
    return val === null || val === undefined || val === "";
  });
}

/**
 * Filter an AI proposal to only unresolved fields.
 * Preserves governed field matchType metadata in evidence.
 * Returns the safe patch and any collisions where AI tried to overwrite resolved values.
 */
export function filterAiProposal(opts: {
  proposal: Record<string, unknown>;
  unresolvedFields: Set<string>;
  candidate: CandidateData;
}): {
  safePatch: Record<string, unknown>;
  collisions: SystemPatchCollision[];
  evidence: Record<string, AIFieldEvidence>;
} {
  const { proposal, unresolvedFields, candidate } = opts;
  const safePatch: Record<string, unknown> = {};
  const collisions: SystemPatchCollision[] = [];
  const evidence: Record<string, AIFieldEvidence> = {};

  for (const [fieldName, rawValue] of Object.entries(proposal)) {
    if (EXCLUDED_FIELDS.has(fieldName)) continue;

    // Unwrap governed field objects to extract value and matchType
    let proposedValue: unknown;
    let matchType: GovernedMatchType | undefined;

    if (isGovernedProposal(rawValue)) {
      proposedValue = rawValue.value;
      matchType = rawValue.matchType;
    } else {
      proposedValue = rawValue;
    }

    if (proposedValue === null || proposedValue === undefined || proposedValue === "") continue;

    // Reject any field not in the AI-eligible set (Bucket A/C fields)
    if (!AI_ELIGIBLE_FIELDS.has(fieldName)) continue;

    if (unresolvedFields.has(fieldName)) {
      safePatch[fieldName] = proposedValue;
      evidence[fieldName] = {
        snippet: "AI-proposed",
        ...(matchType ? { matchType } : {}),
      };
    } else {
      // AI tried to fill a resolved field — report collision
      const currentValue = (candidate as Record<string, unknown>)[fieldName];
      if (currentValue !== null && currentValue !== undefined && currentValue !== "") {
        collisions.push({ fieldName, currentValue, proposedValue });
      } else {
        // Field is empty but has provenance — still a collision
        collisions.push({ fieldName, currentValue: currentValue ?? null, proposedValue });
      }
    }
  }

  return { safePatch, collisions, evidence };
}
