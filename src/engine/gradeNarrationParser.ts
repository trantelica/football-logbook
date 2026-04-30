/**
 * Pass 3 — Blocking Grade Narration Parser
 *
 * Deterministic, line/clause-based parser for simple grade narration like:
 *   "LT 2"
 *   "C -1"
 *   "RG +3, LG 1"
 *   "left tackle 2"
 *   "X 0"
 *
 * Returns a patch keyed by canonical grade fields (gradeLT, gradeLG, ...).
 * Values are constrained to the allowed range -3..+3.
 *
 * NO commit. NO mutation of committed row data. The patch is intended to
 * flow into proposal/candidate state via the existing applySystemPatch /
 * updateField pipeline. Validation downstream still runs.
 */

import { GRADE_FIELDS, GRADE_LABELS } from "./personnel";

export interface GradeParseEntry {
  /** The raw token/clause matched */
  rawClause: string;
  /** Canonical grade field, if a position was identified */
  canonicalField?: string;
  /** Numeric grade value (-3..+3), if parsed */
  value?: number;
  /** Status of this clause */
  status: "matched" | "unrecognized" | "out_of_range";
  /** Human-readable reason (for status !== matched) */
  reason?: string;
}

export interface GradeParseResult {
  /** Patch of canonical grade fields → numeric value */
  patch: Record<string, number>;
  /** Per-clause report */
  report: GradeParseEntry[];
}

/** Position aliases mapped to canonical grade fields */
const POSITION_TO_GRADE_FIELD: Record<string, string> = {
  // Direct position labels
  lt: "gradeLT", "left tackle": "gradeLT",
  lg: "gradeLG", "left guard": "gradeLG",
  c: "gradeC", center: "gradeC",
  rg: "gradeRG", "right guard": "gradeRG",
  rt: "gradeRT", "right tackle": "gradeRT",
  x: "gradeX",
  y: "gradeY",
  "1": "grade1",
  "2": "grade2",
  "3": "grade3",
  "4": "grade4",
};

/**
 * Parse a Pass 3 grade narration string into a canonical-field patch.
 * Splits on commas, semicolons, newlines, or " and ". Each clause must
 * contain a position token + a signed integer in range -3..+3.
 */
export function parseGradeNarration(input: string): GradeParseResult {
  const patch: Record<string, number> = {};
  const report: GradeParseEntry[] = [];

  if (!input || !input.trim()) {
    return { patch, report };
  }

  const clauses = input
    .split(/[,;\n]| and /i)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    // Match: <position> <signed-int>  OR  <position> = <signed-int>
    // Position can be multi-word (e.g. "left tackle"). Number can be +N, -N, or N.
    const m = clause.match(
      /^(left tackle|left guard|right tackle|right guard|center|lt|lg|rg|rt|c|x|y|[1-4])\s*[:=]?\s*([+-]?\d+)$/i,
    );
    if (!m) {
      report.push({
        rawClause: clause,
        status: "unrecognized",
        reason: "Could not identify position + numeric grade.",
      });
      continue;
    }
    const posKey = m[1].toLowerCase();
    const canonicalField = POSITION_TO_GRADE_FIELD[posKey];
    if (!canonicalField) {
      report.push({
        rawClause: clause,
        status: "unrecognized",
        reason: `Unknown position token: "${posKey}"`,
      });
      continue;
    }
    const value = parseInt(m[2], 10);
    if (!Number.isInteger(value) || value < -3 || value > 3) {
      report.push({
        rawClause: clause,
        canonicalField,
        value,
        status: "out_of_range",
        reason: `Grade ${value} is out of range (-3..+3).`,
      });
      continue;
    }
    patch[canonicalField] = value;
    report.push({
      rawClause: clause,
      canonicalField,
      value,
      status: "matched",
    });
  }

  return { patch, report };
}

/** Re-export grade field constants for convenience. */
export { GRADE_FIELDS, GRADE_LABELS };
