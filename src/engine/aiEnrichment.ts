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
 */

import type { CandidateData } from "./types";
import type { AIFieldEvidence, SystemPatchCollision } from "./transaction";

/** Fields that are system-managed and never AI-enrichable */
const EXCLUDED_FIELDS = new Set(["gameId", "playNum", "qtr", "odk", "series"]);

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

  for (const [fieldName, proposedValue] of Object.entries(proposal)) {
    if (EXCLUDED_FIELDS.has(fieldName)) continue;
    if (proposedValue === null || proposedValue === undefined || proposedValue === "") continue;

    if (unresolvedFields.has(fieldName)) {
      safePatch[fieldName] = proposedValue;
      evidence[fieldName] = { snippet: "AI-proposed" };
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
