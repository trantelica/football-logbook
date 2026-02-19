/**
 * Football Engine — Two-Tier Validation Engine
 * 
 * Inline: touched fields only, real-time
 * Commit-gate: full check, blocks commit
 */

import {
  playSchema,
  getRequiredFieldsForPass,
  SEGMENT_REQUIRED_FIELDS,
  type FieldDefinition,
} from "./schema";
import type { CandidateData, ValidationErrors, PlayRecord } from "./types";

// ── playNum Parsing ──

export interface PlayNumResult {
  valid: boolean;
  value: number;
  error?: string;
}

/** Strict playNum parsing: finite integer > 0, normalizes leading zeros */
export function parsePlayNum(raw: string | number | undefined | null): PlayNumResult {
  if (raw === undefined || raw === null || raw === "") {
    return { valid: false, value: 0, error: "Play # is required" };
  }

  const str = String(raw).trim();
  if (str === "") {
    return { valid: false, value: 0, error: "Play # is required" };
  }

  // Reject non-numeric characters (allows leading zeros)
  if (!/^\d+$/.test(str)) {
    return { valid: false, value: 0, error: "Play # must be a whole number" };
  }

  const num = Number(str);

  if (!Number.isFinite(num)) {
    return { valid: false, value: 0, error: "Play # must be a finite number" };
  }

  if (!Number.isInteger(num)) {
    return { valid: false, value: 0, error: "Play # must be a whole number (no decimals)" };
  }

  if (num <= 0) {
    return { valid: false, value: 0, error: "Play # must be greater than 0" };
  }

  // Normalized value (strips leading zeros)
  return { valid: true, value: num };
}

// ── Field-Level Validation ──

function validateField(
  fieldDef: FieldDefinition,
  value: unknown
): string | null {
  if (value === null || value === undefined || value === "") return null;

  switch (fieldDef.dataType) {
    case "integer": {
      const num = Number(value);
      if (!Number.isFinite(num) || !Number.isInteger(num)) {
        return `${fieldDef.label} must be a whole number`;
      }
      if (fieldDef.name === "playNum" && num <= 0) {
        return `${fieldDef.label} must be greater than 0`;
      }
      break;
    }
    case "enum": {
      const strVal = String(value);
      if (fieldDef.allowedValues && !fieldDef.allowedValues.includes(strVal)) {
        return `${fieldDef.label} must be one of: ${fieldDef.allowedValues.join(", ")}`;
      }
      break;
    }
    case "boolean": {
      if (typeof value !== "boolean" && value !== "true" && value !== "false") {
        return `${fieldDef.label} must be true or false`;
      }
      break;
    }
    case "string":
      // No type validation needed for free-text strings
      break;
  }

  return null;
}

// ── Inline Validation (touched fields only) ──

export function validateInline(
  candidate: CandidateData,
  touchedFields: Set<string>
): ValidationErrors {
  const errors: ValidationErrors = {};

  for (const fieldName of touchedFields) {
    if (fieldName === "playNum") {
      const result = parsePlayNum(candidate.playNum as string | number);
      if (!result.valid && result.error) {
        errors.playNum = result.error;
      }
      continue;
    }

    const fieldDef = playSchema.find((f) => f.name === fieldName);
    if (!fieldDef) continue;

    const value = (candidate as Record<string, unknown>)[fieldName];
    const error = validateField(fieldDef, value);
    if (error) errors[fieldName] = error;
  }

  return errors;
}

// ── Commit-Gate Validation ──

export interface CommitGateResult {
  valid: boolean;
  errors: ValidationErrors;
  normalizedPlay: PlayRecord | null;
}

export function validateCommitGate(
  candidate: CandidateData,
  activePass: number
): CommitGateResult {
  const errors: ValidationErrors = {};

  // 1. Strict playNum parsing
  const playNumResult = parsePlayNum(candidate.playNum as string | number);
  if (!playNumResult.valid) {
    errors.playNum = playNumResult.error!;
  }

  // 2. Determine if this is a Segment row
  const isSegment = candidate.odk === "S";

  // 3. Required field checks
  if (isSegment) {
    // ODK=S: only minimal fields required
    for (const fieldName of SEGMENT_REQUIRED_FIELDS) {
      if (fieldName === "playNum") continue; // already validated
      const value = (candidate as Record<string, unknown>)[fieldName];
      if (value === null || value === undefined || value === "") {
        const fieldDef = playSchema.find((f) => f.name === fieldName);
        errors[fieldName] = `${fieldDef?.label ?? fieldName} is required`;
      }
    }
  } else {
    // Standard: pass-aware required fields
    const requiredFields = getRequiredFieldsForPass(activePass);
    for (const fieldDef of requiredFields) {
      if (fieldDef.name === "playNum") continue; // already validated
      const value = (candidate as Record<string, unknown>)[fieldDef.name];
      if (value === null || value === undefined || value === "") {
        errors[fieldDef.name] = `${fieldDef.label} is required`;
      }
    }
  }

  // 4. Type/enum validation on ALL populated fields (even untouched)
  for (const fieldDef of playSchema) {
    if (fieldDef.name === "playNum") continue;
    if (errors[fieldDef.name]) continue; // already has error

    const value = (candidate as Record<string, unknown>)[fieldDef.name];
    if (value === null || value === undefined || value === "") continue;

    const error = validateField(fieldDef, value);
    if (error) errors[fieldDef.name] = error;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, normalizedPlay: null };
  }

  // Build normalized PlayRecord
  const normalizedPlay: PlayRecord = {
    gameId: candidate.gameId,
    playNum: playNumResult.value,
    qtr: (candidate.qtr as string) || null,
    odk: (candidate.odk as PlayRecord["odk"]) || null,
    series: candidate.series != null && candidate.series !== "" ? Number(candidate.series) : null,
    yardLn: candidate.yardLn != null && candidate.yardLn !== "" ? Number(candidate.yardLn) : null,
    dn: (candidate.dn as string) || null,
    dist: candidate.dist != null && candidate.dist !== "" ? Number(candidate.dist) : null,
    hash: (candidate.hash as string) || null,
    offForm: (candidate.offForm as string) || null,
    offPlay: (candidate.offPlay as string) || null,
    motion: (candidate.motion as string) || null,
    result: (candidate.result as string) || null,
    gainLoss: candidate.gainLoss != null && candidate.gainLoss !== "" ? Number(candidate.gainLoss) : null,
    twoMin: candidate.twoMin === true || candidate.twoMin === "true" ? true : candidate.twoMin === false || candidate.twoMin === "false" ? false : null,
  };

  return { valid: true, errors: {}, normalizedPlay };
}
