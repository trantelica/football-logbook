/**
 * Football Engine — Canonical Play Schema (Source of Truth)
 * 
 * This JSON-compatible schema defines every play field.
 * All validation, UI rendering, and export logic derive from it.
 */

export const SCHEMA_VERSION = "2.0.0";

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

/** qtr is stored as integer 1–5; value 5 represents Overtime */
export const QTR_VALUES = ["1", "2", "3", "4", "5"] as const;
/** Display labels for qtr dropdown (maps stored value → UI label) */
export const QTR_DISPLAY: Record<string, string> = { "1": "1", "2": "2", "3": "3", "4": "4", "5": "OT" };
export const DN_VALUES = ["1", "2", "3", "4"] as const;
export const HASH_VALUES = ["L", "M", "R"] as const;

/** Fixed Result enum — Section 8 allowed values (no user-add flow) */
export const RESULT_VALUES = [
  "1st DN", "Batted Down", "Block", "Blocked", "COP",
  "Complete", "Complete, Fumble", "Complete, TD",
  "Def TD", "Downed", "Dropped", "Fair Catch",
  "Fumble", "Fumble, Def TD", "Good",
  "Incomplete", "Interception", "Interception, Def TD", "Interception, Fumble",
  "No Good", "No Good, Def TD", "Offsetting Penalties", "Out of Bounds",
  "Penalty", "Penalty, Safety", "Return",
  "Rush", "Rush, Safety", "Rush, TD",
  "Sack", "Sack, Fumble", "Sack, Fumble, Def TD", "Sack, Safety",
  "Safety", "Scramble", "Scramble, TD", "TD",
  "Timeout", "Tipped", "Touchback",
] as const;

/** Play Type enum for offPlay dependent attribute */
export const PLAY_TYPE_VALUES = [
  "Run", "Pass", "Screen", "Play Action", "RPO",
  "Draw", "Option", "QB Sneak", "Trick",
] as const;

/** Dependent attribute definitions for lookup fields — collected at add-time */
export interface LookupAttrDef {
  name: string;
  label: string;
  allowedValues: readonly string[];
}

export const LOOKUP_DEPENDENT_ATTRS: Record<string, LookupAttrDef[]> = {
  offForm: [
    { name: "offStrength", label: "Strength", allowedValues: ["L", "BAL", "R"] },
    { name: "personnel", label: "Personnel", allowedValues: ["11", "12", "13", "21", "22", "23", "31", "32", "41", "50"] },
  ],
  offPlay: [
    { name: "playType", label: "Play Type", allowedValues: PLAY_TYPE_VALUES },
    { name: "playDir", label: "Play Dir", allowedValues: ["L", "M", "R"] },
  ],
  motion: [
    { name: "motionDir", label: "Motion Dir", allowedValues: ["L", "R"] },
  ],
};

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
    dataType: "integer",
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
    dataType: "integer",
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
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "offPlay",
    label: "Off. Play",
    dataType: "string",
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "motion",
    label: "Motion",
    dataType: "string",
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "result",
    label: "Result",
    dataType: "enum",
    allowedValues: RESULT_VALUES,
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
