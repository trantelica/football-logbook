/**
 * AI Enrichment Client — calls the ai-enrich edge function.
 *
 * Sends a grounded context packet including:
 * - observation text (coach dictation)
 * - deterministic patch (already parsed values)
 * - unresolved fields (only AI-eligible ones)
 * - field hints with governed lookup values, enum values, and phraseology
 * - location mapping (Hudl-centered yardline model) when location fields are unresolved
 *
 * AI is NOT called when observation text is empty.
 */

import { supabase } from "@/integrations/supabase/client";
import { playSchema } from "./schema";
import { getUnresolvedFields } from "./aiEnrichment";
import { AI_ELIGIBLE_FIELDS, LOCATION_CONSTRAINED_FIELDS } from "./aiEligibility";
import { getBaselinePhraseology } from "./phraseologyBaseline";
import {
  normalizePatchKeysToCanonical,
  type PositionAliasMap,
} from "./positionAliases";
import { getSection, type SectionId } from "./sectionOwnership";
import type { CandidateData } from "./types";
import type { FieldSize } from "./prediction";

/** Location mapping block for the AI context packet */
export interface LocationMappingContext {
  fieldSize: FieldSize;
  validYardLnRange: { min: number; max: number };
  convention: string;
  midfield: number;
  predictionActive: boolean;
  predictedYardLn: number | null;
}

/**
 * Build enriched field hints for unresolved fields.
 * Includes: label, data type, enum values, governed lookup values, and phraseology hints.
 */
function buildFieldHints(
  unresolvedFields: string[],
  lookupValues?: Map<string, string[]>,
): Record<string, unknown> {
  const hints: Record<string, unknown> = {};
  for (const name of unresolvedFields) {
    const def = playSchema.find((f) => f.name === name);
    const hint: Record<string, unknown> = {
      label: def?.label ?? name,
      type: def?.dataType ?? "string",
    };

    // Enum values from schema
    if (def?.allowedValues && def.allowedValues.length > 0) {
      hint.allowedValues = def.allowedValues;
    }

    // Governed lookup values from season-scoped tables
    if (def?.lookupMode === "season" && lookupValues) {
      const vals = lookupValues.get(name);
      if (vals && vals.length > 0) {
        hint.governedValues = vals;
        hint.governedConstraint = "Prefer exact match from governedValues (case-insensitive). If no match exists but the coach clearly names a value, propose the raw candidate. For governed fields, return { value: string, matchType: 'exact' | 'fuzzy' | 'candidate_new' } instead of a plain string.";
      }
    }

    // Phraseology hints from baseline
    const phraseology = getBaselinePhraseology(name);
    if (phraseology.length > 0) {
      hint.phraseologyHints = phraseology;
    }

    hints[name] = hint;
  }
  return hints;
}

/**
 * Build location mapping context when location fields are unresolved.
 */
function buildLocationMapping(
  unresolvedFields: string[],
  opts?: {
    fieldSize?: FieldSize;
    predictedFields?: Set<string>;
    predictedYardLn?: number | null;
  },
): LocationMappingContext | undefined {
  const hasLocationField = unresolvedFields.some((f) => LOCATION_CONSTRAINED_FIELDS.has(f));
  if (!hasLocationField) return undefined;

  const fieldSize = opts?.fieldSize ?? 80;
  const half = fieldSize / 2;
  const predictionActive = opts?.predictedFields?.has("yardLn") ?? false;

  return {
    fieldSize,
    validYardLnRange: { min: -(half - 1), max: half },
    convention: "negative = own territory, positive = opponent territory",
    midfield: half,
    predictionActive,
    predictedYardLn: predictionActive ? (opts?.predictedYardLn ?? null) : null,
  };
}

/**
 * Fetch AI proposal for unresolved fields, grounded in observation text.
 *
 * Returns { proposal, error } — caller routes proposal through requestAiEnrichment.
 * Returns early with an error if observationText is empty.
 */
export async function fetchAiProposal(
  candidate: Record<string, unknown>,
  activePass: number,
  opts?: {
    touchedFields?: Set<string>;
    deterministicParseFields?: Set<string>;
    predictedFields?: Set<string>;
    carriedForwardFields?: Set<string>;
    lookupDerivedFields?: Set<string>;
    aiProposedFields?: Set<string>;
    /** The coach's raw observation / transcript text */
    observationText?: string;
    /** Fields already resolved by deterministic parse */
    deterministicPatch?: Record<string, unknown>;
    /** Season-scoped lookup values keyed by field name */
    lookupValues?: Map<string, string[]>;
    /** Field size for location mapping */
    fieldSize?: FieldSize;
    /** Predicted yardLn value (if prediction engine resolved it) */
    predictedYardLn?: number | null;
    /**
     * Optional Pass 2 position aliases (canonical pos* field → alias).
     * Used to (a) inform the edge function of valid coach-friendly tokens
     * and (b) translate any non-canonical position keys in the AI proposal
     * back to canonical pos* field names before returning.
     */
    positionAliases?: PositionAliasMap | Record<string, string>;
  },
): Promise<{ proposal: Record<string, unknown>; error?: string }> {
  // Gate: no observation text = no AI call
  const observationText = opts?.observationText?.trim() ?? "";
  if (!observationText) {
    return { proposal: {}, error: "Parse transcript first — AI needs observation context" };
  }

  // Determine eligible fields for current pass
  const eligibleFieldNames = playSchema
    .filter((f) => f.defaultPassEntry <= activePass)
    .map((f) => f.name);

  const unresolvedFields = getUnresolvedFields({
    candidate: candidate as CandidateData,
    touchedFields: opts?.touchedFields ?? new Set(),
    deterministicParseFields: opts?.deterministicParseFields ?? new Set(),
    predictedFields: opts?.predictedFields ?? new Set(),
    carriedForwardFields: opts?.carriedForwardFields ?? new Set(),
    lookupDerivedFields: opts?.lookupDerivedFields ?? new Set(),
    aiProposedFields: opts?.aiProposedFields ?? new Set(),
    eligibleFieldNames,
  });

  // Intersect with AI-eligible field set — only Bucket B fields
  const aiEligibleUnresolved = unresolvedFields.filter((f) => AI_ELIGIBLE_FIELDS.has(f));

  if (aiEligibleUnresolved.length === 0) {
    return { proposal: {}, error: "All AI-eligible fields are already resolved" };
  }

  // Build a compact candidate snapshot (only non-null fields)
  const compactCandidate: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(candidate)) {
    if (v !== null && v !== undefined && v !== "") {
      compactCandidate[k] = v;
    }
  }

  const fieldHints = buildFieldHints(aiEligibleUnresolved, opts?.lookupValues);
  const deterministicPatch = opts?.deterministicPatch ?? {};

  // Build location mapping if location fields are unresolved
  const locationMapping = buildLocationMapping(aiEligibleUnresolved, {
    fieldSize: opts?.fieldSize,
    predictedFields: opts?.predictedFields,
    predictedYardLn: opts?.predictedYardLn,
  });

  const positionAliases = (opts?.positionAliases ?? {}) as PositionAliasMap;

  const { data, error } = await supabase.functions.invoke("ai-enrich", {
    body: {
      observationText,
      deterministicPatch,
      candidate: compactCandidate,
      unresolvedFields: aiEligibleUnresolved,
      fieldHints,
      locationMapping,
      // Inform AI of coach-friendly position tokens; AI must still emit
      // canonical pos* field keys, but may reference aliases in reasoning.
      positionAliases,
    },
  });

  if (error) {
    console.error("ai-enrich invocation error:", error);
    return { proposal: {}, error: "AI enrichment service error" };
  }

  if (data?.error) {
    return { proposal: {}, error: data.error };
  }

  // Defensive: translate any alias-keyed position fields back to canonical
  // pos* keys so downstream proposal/commit only ever sees canonical names.
  const rawProposal = (data?.proposal ?? {}) as Record<string, unknown>;
  const { patch: normalized } = normalizePatchKeysToCanonical(rawProposal, positionAliases);
  return { proposal: normalized };
}
