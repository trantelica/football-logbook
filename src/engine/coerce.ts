/**
 * Football Engine — Schema-Driven Type Coercion (Pure)
 *
 * Ensures integer-typed fields are stored as numbers (or null).
 * Applied as defense-in-depth before DB writes.
 * No mutations, no DB imports, no side effects.
 */

import { playSchema } from "./schema";
import type { PlayRecord } from "./types";

/** Integer field names derived from schema (cached at module load) */
const INTEGER_FIELDS: ReadonlySet<string> = new Set(
  playSchema.filter((f) => f.dataType === "integer").map((f) => f.name)
);


/**
 * Returns a shallow-cloned PlayRecord with integer fields coerced to numbers.
 *
 * Rules per integer field:
 * - null / undefined → null
 * - number → keep as-is
 * - string matching /^-?\d+$/ → Number(value)
 * - anything else → null (let downstream validation catch it)
 *
 * Non-integer fields are passed through unchanged.
 * Input object is never mutated.
 */
export function coercePlayToSchemaTypes(play: PlayRecord): PlayRecord {
  const result = { ...play } as Record<string, unknown>;

  for (const fieldName of INTEGER_FIELDS) {
    if (fieldName === "playNum") {
      // playNum handled separately — still coerce for consistency
      const val = result[fieldName];
      if (val === null || val === undefined) {
        result[fieldName] = null;
      } else if (typeof val === "number") {
        // keep
      } else if (typeof val === "string" && /^-?\d+$/.test(val.trim())) {
        result[fieldName] = Number(val.trim());
      } else {
        result[fieldName] = null;
      }
      continue;
    }

    const val = result[fieldName];
    if (val === null || val === undefined) {
      result[fieldName] = null;
    } else if (typeof val === "number") {
      // already correct type
    } else if (typeof val === "string" && /^-?\d+$/.test(val.trim())) {
      result[fieldName] = Number(val.trim());
    } else {
      result[fieldName] = null;
    }
  }

  return result as unknown as PlayRecord;
}
