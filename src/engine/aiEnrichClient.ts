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
import type { ParserSuspicionReport } from "./parserSuspicion";

/** Slice D1: AI parser-crosscheck — fields eligible for AI corrections. */
const CORRECTION_ALLOWED_FIELDS = new Set(["offForm", "offPlay", "motion"]);
const CORRECTION_ELIGIBLE_SECTION: SectionId = "playDetails";

/**
 * Slice D1: Filtered AI-proposed correction for a parser-filled governed field.
 *
 * Shape mirrors existing AI governed proposals so the downstream collision /
 * lookup-governance path handles it without any special casing.
 */
export interface AiCorrection {
  value: string;
  matchType: "exact" | "fuzzy" | "candidate_new";
  /** Parser value the AI is challenging (echoed for trace; informational). */
  replaces?: string;
  /** Suspicion code(s) that motivated the correction. Informational only. */
  reasonCodes?: string[];
}

export type AiCorrectionsByField = Partial<
  Record<"offForm" | "offPlay" | "motion", AiCorrection>
>;

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
    /**
     * Slice A: Active Pass 1 section. When provided, restricts AI-eligible
     * unresolved fields to this section's `ownedFields` and defensively
     * drops out-of-section keys from the AI response.
     * Omit (e.g. cross-section "Suggest Fills") to preserve legacy behavior.
     */
    activeSection?: SectionId;
    /**
     * Slice D1: Parser suspicion report (computed locally by caller from the
     * scoped parser patch + scanner result + lookupMap + section text).
     * When present and `activeSection === 'playDetails'`, drives the
     * AI parser-crosscheck contract: the edge function may return a
     * separate `corrections` object for suspicious parser-filled fields.
     */
    parserSuspicion?: ParserSuspicionReport;
    /**
     * Slice D1: The deterministic parser patch (post section scope, pre
     * scanner). Used here only to (a) gate which fields can receive a
     * correction and (b) reject corrections equal to the parser value.
     */
    parserPatch?: Record<string, unknown>;
  },
): Promise<{ proposal: Record<string, unknown>; corrections?: AiCorrectionsByField; error?: string }> {
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
  let aiEligibleUnresolved = unresolvedFields.filter((f) => AI_ELIGIBLE_FIELDS.has(f));

  // Play Results actor fields are AI-eligible ONLY when the active section
  // is playResults. Outside that section (or in legacy cross-section calls
  // with activeSection undefined), drop them defensively.
  const ACTOR_FIELDS = new Set(["rusher", "passer", "receiver"]);
  if (opts?.activeSection !== "playResults") {
    aiEligibleUnresolved = aiEligibleUnresolved.filter((f) => !ACTOR_FIELDS.has(f));
  }

  // Slice A: section-aware scoping for Pass 1. When activeSection is set,
  // further intersect with the section's ownedFields so AI cannot propose
  // values for fields outside the active section.
  const sectionOwnedSet = opts?.activeSection
    ? new Set<string>(getSection(opts.activeSection).ownedFields)
    : null;
  if (sectionOwnedSet) {
    aiEligibleUnresolved = aiEligibleUnresolved.filter((f) => sectionOwnedSet.has(f));
  }


  // Slice D1: derive suspectFields (the AI-correction allowlist scoped by
  // section + suspicion + parser presence). Pure local filter — no AI yet.
  const suspectFields: string[] = [];
  const parserPatch = opts?.parserPatch ?? {};
  if (
    opts?.activeSection === CORRECTION_ELIGIBLE_SECTION &&
    opts?.parserSuspicion &&
    sectionOwnedSet
  ) {
    for (const field of Object.keys(opts.parserSuspicion.perField)) {
      if (!CORRECTION_ALLOWED_FIELDS.has(field)) continue;
      if (!sectionOwnedSet.has(field)) continue;
      const pv = parserPatch[field];
      if (typeof pv !== "string" || !pv.trim()) continue;
      suspectFields.push(field);
    }
  }

  if (aiEligibleUnresolved.length === 0 && suspectFields.length === 0) {
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

  // Slice D1: build a slim, deterministic suspicion evidence packet for the
  // edge function (only fields that survived the suspectFields gate).
  let suspicionEvidence:
    | Record<string, { observedValue: string; codes: string[]; scannerCanonical?: string }>
    | undefined;
  if (suspectFields.length > 0 && opts?.parserSuspicion) {
    suspicionEvidence = {};
    for (const f of suspectFields) {
      const sig = opts.parserSuspicion.perField[f as "offForm" | "offPlay" | "motion"];
      if (!sig) continue;
      suspicionEvidence[f] = {
        observedValue: sig.observedValue,
        codes: [...sig.codes],
        ...(sig.scannerCanonical ? { scannerCanonical: sig.scannerCanonical } : {}),
      };
    }
  }

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
      // Slice A: section context for prompt scoping (additive; old function ignores).
      activeSection: opts?.activeSection,
      // Slice D1: AI parser-crosscheck (additive; absent when no suspicion).
      ...(suspectFields.length > 0 ? { suspectFields, suspicionEvidence } : {}),
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

  // Slice A: defensive section drop. Even if the edge function returns
  // a key outside the active section's owned fields, drop it before it
  // can enter proposal/collision/governance.
  if (sectionOwnedSet) {
    for (const k of Object.keys(normalized)) {
      if (!sectionOwnedSet.has(k)) delete normalized[k];
    }
  }

  // Defensive actor drop: actor fields may only flow when activeSection is
  // playResults. This protects legacy cross-section calls where
  // sectionOwnedSet is null.
  if (opts?.activeSection !== "playResults") {
    for (const k of Object.keys(normalized)) {
      if (ACTOR_FIELDS.has(k)) delete normalized[k];
    }
  }

  // ── Slice D1: filter and return AI corrections (separate from proposal) ──
  const correctionsRaw = (data?.corrections ?? {}) as Record<string, unknown>;
  let corrections: AiCorrectionsByField | undefined;
  if (suspectFields.length > 0 && correctionsRaw && typeof correctionsRaw === "object") {
    const suspectSet = new Set(suspectFields);
    const out: AiCorrectionsByField = {};
    for (const [k, v] of Object.entries(correctionsRaw)) {
      // Gate 1: canonical key + allowlist + still in suspectFields
      if (!CORRECTION_ALLOWED_FIELDS.has(k)) continue;
      if (!suspectSet.has(k)) continue;
      // Gate 2: section ownership
      if (sectionOwnedSet && !sectionOwnedSet.has(k)) continue;
      // Gate 3: governed value shape
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const obj = v as Record<string, unknown>;
      const value = obj.value;
      const matchType = obj.matchType;
      if (typeof value !== "string" || !value.trim()) continue;
      if (matchType !== "exact" && matchType !== "fuzzy" && matchType !== "candidate_new") continue;
      // Gate 4: must differ from parser value (case-insensitive, ws-normalized)
      const parserVal = parserPatch[k];
      if (typeof parserVal === "string") {
        const a = parserVal.trim().toLowerCase().replace(/\s+/g, " ");
        const b = value.trim().toLowerCase().replace(/\s+/g, " ");
        if (a === b) continue;
      }
      const correction: AiCorrection = {
        value: value.trim(),
        matchType: matchType as AiCorrection["matchType"],
        ...(typeof parserVal === "string" ? { replaces: parserVal } : {}),
        ...(Array.isArray(obj.reasonCodes)
          ? { reasonCodes: (obj.reasonCodes as unknown[]).filter((x) => typeof x === "string") as string[] }
          : typeof obj.reasonCode === "string"
            ? { reasonCodes: [obj.reasonCode as string] }
            : {}),
      };
      out[k as "offForm" | "offPlay" | "motion"] = correction;
    }
    if (Object.keys(out).length > 0) corrections = out;
  }

  return corrections ? { proposal: normalized, corrections } : { proposal: normalized };
}
