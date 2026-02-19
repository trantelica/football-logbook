/**
 * Football Engine — Canonical Play Schema (Source of Truth)
 * 
 * This JSON-compatible schema defines every play field.
 * All validation, UI rendering, and export logic derive from it.
 */

export const SCHEMA_VERSION = "1.0.0";

export type FieldDataType = "integer" | "string" | "boolean" | "enum";
export type FieldSource = "COACH" | "LOGIC" | "LOOKUP";
export type DefaultPolicy = "null" | "process" | "predict" | "carryForward";

export interface FieldDefinition {
  name: string;
  label: string;
  dataType: FieldDataType;
  allowedValues?: readonly string[];
  source: FieldSource;
  defaultPolicy: DefaultPolicy;
  /** Workflow pass at which this field becomes active (0–5) */
  defaultPassEntry: number;
  /** Whether commit-gate enforces non-null (subject to pass scope & ODK=S rules) */
  requiredAtCommit: boolean;
}

export const ODK_VALUES = ["O", "D", "K", "S"] as const;
export type ODK = (typeof ODK_VALUES)[number];

export const QTR_VALUES = ["1", "2", "3", "4", "OT"] as const;
export const DN_VALUES = ["1", "2", "3", "4"] as const;
export const HASH_VALUES = ["L", "M", "R"] as const;

/** Phase 1 field scope — the canonical schema contract */
export const playSchema: readonly FieldDefinition[] = [
  {
    name: "playNum",
    label: "Play #",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: true,
  },
  {
    name: "qtr",
    label: "Quarter",
    dataType: "enum",
    allowedValues: QTR_VALUES,
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: true,
  },
  {
    name: "odk",
    label: "ODK",
    dataType: "enum",
    allowedValues: ODK_VALUES,
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: true,
  },
  {
    name: "series",
    label: "Series",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "yardLn",
    label: "Yard Line",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: false,
  },
  {
    name: "dn",
    label: "Down",
    dataType: "enum",
    allowedValues: DN_VALUES,
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: false,
  },
  {
    name: "dist",
    label: "Distance",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: false,
  },
  {
    name: "hash",
    label: "Hash",
    dataType: "enum",
    allowedValues: HASH_VALUES,
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "offForm",
    label: "Off. Formation",
    dataType: "string",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "offPlay",
    label: "Off. Play",
    dataType: "string",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "motion",
    label: "Motion",
    dataType: "string",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "result",
    label: "Result",
    dataType: "string",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: false,
  },
  {
    name: "gainLoss",
    label: "Gain/Loss",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: false,
  },
  {
    name: "twoMin",
    label: "2-Min",
    dataType: "boolean",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: false,
  },
] as const;

// ── Schema Utilities ──

/** Lookup a field definition by name */
export function getFieldDef(fieldName: string): FieldDefinition | undefined {
  return playSchema.find((f) => f.name === fieldName);
}

/** Get fields that are in-scope for a given workflow pass */
export function getFieldsForPass(pass: number): FieldDefinition[] {
  return playSchema.filter((f) => f.defaultPassEntry <= pass);
}

/** Get fields required at commit for a given pass (respects pass-awareness) */
export function getRequiredFieldsForPass(pass: number): FieldDefinition[] {
  return playSchema.filter(
    (f) => f.requiredAtCommit && f.defaultPassEntry <= pass
  );
}

/** Minimal fields required for ODK=S rows */
export const SEGMENT_REQUIRED_FIELDS = ["playNum", "qtr", "odk"] as const;

/** Export the full schema as a JSON-serializable object (for versioning/diffing) */
export function exportSchemaSnapshot() {
  return {
    version: SCHEMA_VERSION,
    fields: playSchema.map((f) => ({ ...f })),
  };
}
