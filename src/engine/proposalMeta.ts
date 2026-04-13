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
  | "lookup_derived"
  | "ai_proposed"
  | "coach_edited";

/** Resolution status of a proposal field */
export type FieldStatus =
  | "resolved"
  | "unresolved"
  | "needs_clarification"
  | "governance_blocked";

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
 *  2. ai_proposed (aiProposedFields)  — currently used for transcript parse
 *  3. carry_forward (carriedForwardFields)
 *  4. predicted (predictedFields)
 *  5. lookup_derived — dependent auto-populated fields
 *
 * Status rules:
 *  - governance_blocked: field has inline error containing "lookup" or "not found"
 *  - needs_clarification: field has inline error or parse report was "ambiguous"
 *  - unresolved: field is empty/null but expected (required at commit)
 *  - resolved: has a value with no errors
 */
export function computeProposalMeta(opts: {
  candidate: Record<string, unknown>;
  touchedFields: Set<string>;
  predictedFields: Set<string>;
  aiProposedFields: Set<string>;
  carriedForwardFields: Set<string>;
  aiEvidenceByField: Record<string, { snippet: string }>;
  inlineErrors: Record<string, string>;
  /** Field names that were auto-populated from a parent lookup selection */
  lookupDerivedFields?: Set<string>;
}): ProposalMetaMap {
  const {
    candidate,
    touchedFields,
    predictedFields,
    aiProposedFields,
    carriedForwardFields,
    aiEvidenceByField,
    inlineErrors,
    lookupDerivedFields,
  } = opts;

  const meta: ProposalMetaMap = new Map();

  // Only produce metadata for fields that have provenance or values
  const allRelevant = new Set([
    ...touchedFields,
    ...predictedFields,
    ...aiProposedFields,
    ...carriedForwardFields,
    ...(lookupDerivedFields ?? []),
  ]);

  for (const fieldName of allRelevant) {
    if (fieldName === "gameId" || fieldName === "playNum") continue;

    const value = candidate[fieldName] ?? null;

    // Determine provenance (priority order)
    let provenance: ProvenanceSource;
    if (touchedFields.has(fieldName)) {
      provenance = "coach_edited";
    } else if (aiProposedFields.has(fieldName)) {
      // AI-proposed currently comes from transcript parse → use deterministic_parse
      // when evidence exists, otherwise ai_proposed
      provenance = aiEvidenceByField[fieldName] ? "deterministic_parse" : "ai_proposed";
    } else if (carriedForwardFields.has(fieldName)) {
      provenance = "carry_forward";
    } else if (predictedFields.has(fieldName)) {
      provenance = "predicted";
    } else if (lookupDerivedFields?.has(fieldName)) {
      provenance = "lookup_derived";
    } else {
      provenance = "coach_edited"; // fallback
    }

    // Determine status
    let status: FieldStatus;
    const error = inlineErrors[fieldName];
    if (error) {
      const errorLower = error.toLowerCase();
      if (errorLower.includes("lookup") || errorLower.includes("not found") || errorLower.includes("not in")) {
        status = "governance_blocked";
      } else {
        status = "needs_clarification";
      }
    } else if (value === null || value === undefined || value === "") {
      status = "unresolved";
    } else {
      status = "resolved";
    }

    // Transcript evidence
    const evidence = aiEvidenceByField[fieldName];
    const transcriptEvidence = evidence?.snippet ?? null;

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
