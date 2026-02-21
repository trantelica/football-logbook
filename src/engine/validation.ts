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
import { canonicalizeLookupValue } from "./db";

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
      const str = String(value).trim();
      if (!/^-?\d+$/.test(str)) {
        return `${fieldDef.label} must be a whole number`;
      }
      const num = Number(str);
      if (fieldDef.name === "playNum" && num <= 0) {
        return `${fieldDef.label} must be greater than 0`;
      }
      if (fieldDef.allowedValues && !fieldDef.allowedValues.includes(String(num))) {
        return `${fieldDef.label} must be one of: ${fieldDef.allowedValues.join(", ")}`;
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
      break;
  }

  return null;
}

// ── Lookup Validation ──

function validateLookupField(
  fieldDef: FieldDefinition,
  value: unknown,
  lookups: Map<string, string[]> | undefined,
  mode: "error" | "warning"
): string | null {
  // Only validate fields with lookupMode "season"
  if (fieldDef.lookupMode !== "season") return null;
  if (value === null || value === undefined || value === "") return null;
  if (!lookups) return null;

  const approvedValues = lookups.get(fieldDef.name);
  if (!approvedValues || approvedValues.length === 0) return null; // bootstrapping

  const canonical = canonicalizeLookupValue(String(value));
  const found = approvedValues.some((v) => canonicalizeLookupValue(v) === canonical);
  if (!found) {
    if (mode === "error") {
      return `${fieldDef.label} is not a recognized value`;
    }
    return `${fieldDef.label} is not in the lookup table`;
  }
  return null;
}

// ── Actor Roster Validation ──

const ACTOR_FIELDS = new Set(["rusher", "passer", "receiver"]);

function validateActorField(
  fieldDef: FieldDefinition,
  value: unknown,
  rosterNumbers?: Set<number>
): string | null {
  if (!ACTOR_FIELDS.has(fieldDef.name)) return null;
  if (value === null || value === undefined || value === "") return null;
  if (!rosterNumbers) return null;

  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null; // type validation handles this
  if (!rosterNumbers.has(num)) {
    return `Jersey #${num} not found in roster`;
  }
  return null;
}

// ── Inline Validation (touched fields only) ──

export function validateInline(
  candidate: CandidateData,
  touchedFields: Set<string>,
  lookups?: Map<string, string[]>
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
    if (error) {
      errors[fieldName] = error;
      continue;
    }

    // Soft lookup warning
    const lookupWarning = validateLookupField(fieldDef, value, lookups, "warning");
    if (lookupWarning) {
      errors[fieldName] = lookupWarning;
    }
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
  activePass: number,
  lookups?: Map<string, string[]>,
  rosterNumbers?: Set<number>
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
    for (const fieldName of SEGMENT_REQUIRED_FIELDS) {
      if (fieldName === "playNum") continue;
      const value = (candidate as Record<string, unknown>)[fieldName];
      if (value === null || value === undefined || value === "") {
        const fieldDef = playSchema.find((f) => f.name === fieldName);
        errors[fieldName] = `${fieldDef?.label ?? fieldName} is required`;
      }
    }
  } else {
    const requiredFields = getRequiredFieldsForPass(activePass);
    for (const fieldDef of requiredFields) {
      if (fieldDef.name === "playNum") continue;
      const value = (candidate as Record<string, unknown>)[fieldDef.name];
      if (value === null || value === undefined || value === "") {
        errors[fieldDef.name] = `${fieldDef.label} is required`;
      }
    }
  }

  // 4. Type/enum validation on ALL populated fields
  for (const fieldDef of playSchema) {
    if (fieldDef.name === "playNum") continue;
    if (errors[fieldDef.name]) continue;

    const value = (candidate as Record<string, unknown>)[fieldDef.name];
    if (value === null || value === undefined || value === "") continue;

    const error = validateField(fieldDef, value);
    if (error) {
      errors[fieldDef.name] = error;
      continue;
    }

    // Lookup membership check (blocking at commit) — only for lookupMode "season"
    const lookupError = validateLookupField(fieldDef, value, lookups, "error");
    if (lookupError) {
      errors[fieldDef.name] = lookupError;
      continue;
    }

    // Actor roster check
    const actorError = validateActorField(fieldDef, value, rosterNumbers);
    if (actorError) {
      errors[fieldDef.name] = actorError;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, normalizedPlay: null };
  }

  const normalizedPlay = normalizeToSchema(candidate, playNumResult.value);

  return { valid: true, errors: {}, normalizedPlay };
}

// ── Schema-Driven Normalization ──

export function normalizeToSchema(candidate: CandidateData, playNum: number): PlayRecord {
  const record: Record<string, unknown> = { gameId: candidate.gameId, playNum };
  for (const fieldDef of playSchema) {
    if (fieldDef.name === "playNum") continue;
    const raw = (candidate as Record<string, unknown>)[fieldDef.name];
    if (raw === null || raw === undefined || raw === "") {
      record[fieldDef.name] = null;
      continue;
    }
    switch (fieldDef.dataType) {
      case "integer": {
        const str = String(raw).trim();
        if (!/^-?\d+$/.test(str)) { record[fieldDef.name] = null; break; }
        record[fieldDef.name] = Number(str);
        break;
      }
      case "enum":
        record[fieldDef.name] = String(raw);
        break;
      case "boolean":
        record[fieldDef.name] = raw === true || raw === "true";
        break;
      case "string":
        record[fieldDef.name] = String(raw).trim() || null;
        break;
    }
  }
  return record as unknown as PlayRecord;
}
