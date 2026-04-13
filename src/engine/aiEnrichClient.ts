/**
 * AI Enrichment Client — calls the ai-enrich edge function.
 *
 * Sends observation text, deterministic patch, unresolved fields, and
 * field hints to the backend. The caller routes the result through
 * requestAiEnrichment for filtering and provenance assignment.
 *
 * AI is NOT called when observation text is empty — the model needs
 * narrative context to ground its suggestions.
 */

import { supabase } from "@/integrations/supabase/client";
import { playSchema } from "./schema";
import { getUnresolvedFields } from "./aiEnrichment";
import type { CandidateData } from "./types";

/**
 * Build field hints (allowed values) for unresolved fields so the AI
 * model knows the valid value space.
 */
function buildFieldHints(unresolvedFields: string[]): Record<string, unknown> {
  const hints: Record<string, unknown> = {};
  for (const name of unresolvedFields) {
    const def = playSchema.find((f) => f.name === name);
    if (def?.allowedValues && def.allowedValues.length > 0) {
      hints[name] = { label: def.label, allowedValues: def.allowedValues, type: def.dataType ?? "string" };
    } else {
      hints[name] = { label: def?.label ?? name, type: def?.dataType ?? "string" };
    }
  }
  return hints;
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

  if (unresolvedFields.length === 0) {
    return { proposal: {}, error: "All fields are already resolved" };
  }

  // Build a compact candidate snapshot (only non-null fields)
  const compactCandidate: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(candidate)) {
    if (v !== null && v !== undefined && v !== "") {
      compactCandidate[k] = v;
    }
  }

  const fieldHints = buildFieldHints(unresolvedFields);
  const deterministicPatch = opts?.deterministicPatch ?? {};

  const { data, error } = await supabase.functions.invoke("ai-enrich", {
    body: {
      observationText,
      deterministicPatch,
      candidate: compactCandidate,
      unresolvedFields,
      fieldHints,
    },
  });

  if (error) {
    console.error("ai-enrich invocation error:", error);
    return { proposal: {}, error: "AI enrichment service error" };
  }

  if (data?.error) {
    return { proposal: {}, error: data.error };
  }

  return { proposal: data?.proposal ?? {} };
}
