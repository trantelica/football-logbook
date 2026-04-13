/**
 * Structured validation reason codes — used by proposal metadata
 * to determine field status without brittle text matching.
 */

import { playSchema } from "./schema";
import { canonicalizeLookupValue } from "./db";
import type { CandidateData } from "./types";
import type { ValidationReasonCode } from "./proposalMeta";

const ACTOR_FIELDS = new Set(["rusher", "passer", "receiver", "returner"]);

/**
 * Compute structured reason codes for each field with a validation issue.
 * This runs alongside validateInline but produces machine-readable codes
 * instead of human-readable error strings.
 */
export function computeValidationReasons(
  candidate: CandidateData,
  activeFields: Set<string>,
  lookups?: Map<string, string[]>,
  rosterNumbers?: Set<number>,
): Record<string, ValidationReasonCode> {
  const reasons: Record<string, ValidationReasonCode> = {};

  for (const fieldName of activeFields) {
    if (fieldName === "playNum") continue;

    const fieldDef = playSchema.find((f) => f.name === fieldName);
    if (!fieldDef) continue;

    const value = (candidate as Record<string, unknown>)[fieldName];
    if (value === null || value === undefined || value === "") continue;

    // Type validation
    if (fieldDef.dataType === "integer") {
      const str = String(value).trim();
      if (!/^-?\d+$/.test(str)) {
        reasons[fieldName] = "type_error";
        continue;
      }
      if (fieldDef.allowedValues && !fieldDef.allowedValues.includes(String(Number(str)))) {
        reasons[fieldName] = "enum_error";
        continue;
      }
    }

    if (fieldDef.dataType === "enum") {
      if (fieldDef.allowedValues && !fieldDef.allowedValues.includes(String(value))) {
        reasons[fieldName] = "enum_error";
        continue;
      }
    }

    // Lookup governance check
    if (fieldDef.lookupMode === "season" && lookups) {
      const approvedValues = lookups.get(fieldDef.name);
      if (approvedValues && approvedValues.length > 0) {
        const canonical = canonicalizeLookupValue(String(value));
        const found = approvedValues.some((v) => canonicalizeLookupValue(v) === canonical);
        if (!found) {
          reasons[fieldName] = "lookup_not_found";
          continue;
        }
      }
    }

    // Actor roster check
    if (ACTOR_FIELDS.has(fieldName) && rosterNumbers) {
      const num = Number(value);
      if (Number.isInteger(num) && num >= 0 && !rosterNumbers.has(num)) {
        reasons[fieldName] = "roster_not_found";
        continue;
      }
    }
  }

  return reasons;
}
