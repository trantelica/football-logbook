/**
 * Proposal Field Metadata — inspectable provenance & status layer.
 *
 * This model sits alongside the candidate/proposal data, never mutates
 * committed rows, and never changes the export schema.
 */

/** How a field value was populated */
export type ProvenanceSource =
  | "deterministic_parse"
  | "predicted"
  | "carry_forward"
  | "ai_proposed"
  | "coach_edited";

// NOTE: lookup_derived is deferred — not yet wired at the state-signal level.
// It will be added when dependent auto-population tracking is implemented.

/** Resolution status of a proposal field */
export type FieldStatus =
  | "resolved"
  | "unresolved"
  | "needs_clarification"
  | "governance_blocked";

/** Structured reason codes for validation issues — replaces text matching */
export type ValidationReasonCode =
  | "lookup_not_found"
  | "roster_not_found"
  | "type_error"
  | "enum_error"
  | "required"
  | "domain_error";

/** Metadata for a single proposal field */
export interface ProposalFieldMeta {
  /** The field name (matches PlayRecord key) */
  fieldName: string;
  /** Current value in the candidate */
  value: unknown;
  /** How the value was populated */
  provenance: ProvenanceSource;
  /** Resolution status */
  status: FieldStatus;
  /** Short transcript snippet that sourced this value, if any */
  transcriptEvidence: string | null;
  /** Optional human-readable reason or note */
  notes: string | null;
}

/** Map of fieldName → ProposalFieldMeta */
export type ProposalMetaMap = Map<string, ProposalFieldMeta>;

/**
 * Compute proposal metadata from existing transaction state signals.
 *
 * Priority (highest wins):
 *  1. coach_edited (touchedFields)
 *  2. deterministic_parse (deterministicParseFields) — from transcript parse
 *  3. ai_proposed (aiProposedFields) — reserved for true AI enrichment
 *  4. carry_forward (carriedForwardFields)
 *  5. predicted (predictedFields)
 *
 * Status rules use structured validationReasons, not free-text matching:
 *  - governance_blocked: validationReasons[field] === "lookup_not_found"
 *  - needs_clarification: validationReasons[field] exists (type_error, enum_error, etc.)
 *  - unresolved: field is empty/null but has provenance
 *  - resolved: has a value with no errors
 */
export function computeProposalMeta(opts: {
  candidate: Record<string, unknown>;
  touchedFields: Set<string>;
  predictedFields: Set<string>;
  deterministicParseFields: Set<string>;
  aiProposedFields: Set<string>;
  carriedForwardFields: Set<string>;
  parseEvidenceByField: Record<string, { snippet: string }>;
  aiEvidenceByField: Record<string, { snippet: string }>;
  validationReasons: Record<string, ValidationReasonCode>;
}): ProposalMetaMap {
  const {
    candidate,
    touchedFields,
    predictedFields,
    deterministicParseFields,
    aiProposedFields,
    carriedForwardFields,
    parseEvidenceByField,
    aiEvidenceByField,
    validationReasons,
  } = opts;

  const meta: ProposalMetaMap = new Map();

  // Only produce metadata for fields that have provenance or values
  const allRelevant = new Set([
    ...touchedFields,
    ...predictedFields,
    ...deterministicParseFields,
    ...aiProposedFields,
    ...carriedForwardFields,
  ]);

  for (const fieldName of allRelevant) {
    if (fieldName === "gameId" || fieldName === "playNum") continue;

    const value = candidate[fieldName] ?? null;

    // Determine provenance (priority order)
    let provenance: ProvenanceSource;
    if (touchedFields.has(fieldName)) {
      provenance = "coach_edited";
    } else if (deterministicParseFields.has(fieldName)) {
      provenance = "deterministic_parse";
    } else if (aiProposedFields.has(fieldName)) {
      provenance = "ai_proposed";
    } else if (carriedForwardFields.has(fieldName)) {
      provenance = "carry_forward";
    } else if (predictedFields.has(fieldName)) {
      provenance = "predicted";
    } else {
      provenance = "coach_edited"; // fallback
    }

    // Determine status from structured reason codes
    let status: FieldStatus;
    const reason = validationReasons[fieldName];
    if (reason) {
      if (reason === "lookup_not_found" || reason === "roster_not_found") {
        status = "governance_blocked";
      } else {
        status = "needs_clarification";
      }
    } else if (value === null || value === undefined || value === "") {
      status = "unresolved";
    } else {
      status = "resolved";
    }

    // Transcript evidence — check parse evidence first, then AI evidence
    const parseEvidence = parseEvidenceByField[fieldName];
    const aiEvidence = aiEvidenceByField[fieldName];
    const transcriptEvidence = parseEvidence?.snippet ?? aiEvidence?.snippet ?? null;

    meta.set(fieldName, {
      fieldName,
      value,
      provenance,
      status,
      transcriptEvidence,
      notes: null,
    });
  }

  return meta;
}
