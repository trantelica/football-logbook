/**
 * Football Engine — Canonical Play Schema (Source of Truth)
 * 
 * This JSON-compatible schema defines every play field.
 * All validation, UI rendering, and export logic derive from it.
 */

export const SCHEMA_VERSION = "2.1.0";
export const APP_VERSION = "1.0.0";

export type FieldDataType = "integer" | "string" | "boolean" | "enum";
export type FieldSource = "COACH" | "LOGIC" | "LOOKUP";
export type DefaultPolicy = "null" | "process" | "predict" | "carryForward";

export interface FieldDefinition {
  name: string;
  label: string;
  /** PDR Output Label for CSV export headers */
  outputLabel?: string;
  dataType: FieldDataType;
  allowedValues?: readonly string[];
  source: FieldSource;
  defaultPolicy: DefaultPolicy;
  /** Workflow pass at which this field becomes active (0–5) */
  defaultPassEntry: number;
  /** Whether commit-gate enforces non-null (subject to pass scope & ODK=S rules) */
  requiredAtCommit: boolean;
  /** Controls lookup validation behavior.
   *  - "season": validated against season-maintained lookup table (offForm, offPlay, motion)
   *  - "fixed": validated by allowedValues enum only, not season lookup (penalty)
   *  - undefined: no lookup validation
   */
  lookupMode?: "season" | "fixed";
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
  "2 Pt.", "2 Pt. Defend", "Extra Pt.", "Extra Pt. Block",
  "Fake FG", "Fake Punt", "FG", "FG Block",
  "KO", "KO Rec", "Onside Kick", "Onside Kick Rec",
  "Pass", "Punt", "Punt Rec", "Run",
] as const;

/** Efficiency values — stored as "Y"/"N" string enum */
export const EFF_VALUES = ["Y", "N"] as const;

/** Fixed Penalty enum — 37 canonical values (lookupNonmaintainable) */
export const PENALTY_VALUES = [
  "D-Delay of Game", "D-Encroachment", "D-Face Mask", "D-Holding",
  "D-Illegal Contact", "D-Illegal Substitution", "D-Illegal Use of Hands",
  "D-Offside", "D-Pass Interference", "D-Personal Foul",
  "D-Roughing the Kicker", "D-Roughing the Passer",
  "D-Too Many Men on Field", "D-Unsportsmanlike Conduct",
  "O-Chop Block", "O-Delay of Game", "O-Face Mask", "O-False Start",
  "O-Holding", "O-Illegal Block Above Waist", "O-Illegal Block in the Back",
  "O-Illegal Formation", "O-Illegal Motion", "O-Illegal Shift",
  "O-Illegal Substitution", "O-Illegal Use of Hands",
  "O-Ineligible Downfield", "O-Intentional Grounding",
  "O-Offensive Pass Interference", "O-Personal Foul",
  "O-Targeting", "O-Too Many Men on Field",
  "O-Tripping", "O-Unsportsmanlike Conduct",
  "S-Fair Catch Interference", "S-Illegal Touching", "S-Kick Catch Interference",
] as const;

/** Canonical penalty yardage lookup map */
export const PENALTY_YARDS_MAP: Record<string, number> = {
  "D-Delay of Game": 5, "D-Encroachment": 5, "D-Face Mask": 15, "D-Holding": 5,
  "D-Illegal Contact": 5, "D-Illegal Substitution": 5, "D-Illegal Use of Hands": 10,
  "D-Offside": 5, "D-Pass Interference": 15, "D-Personal Foul": 15,
  "D-Roughing the Kicker": 15, "D-Roughing the Passer": 15,
  "D-Too Many Men on Field": 5, "D-Unsportsmanlike Conduct": 15,
  "O-Chop Block": 15, "O-Delay of Game": 5, "O-Face Mask": 15, "O-False Start": 5,
  "O-Holding": 10, "O-Illegal Block Above Waist": 10, "O-Illegal Block in the Back": 10,
  "O-Illegal Formation": 5, "O-Illegal Motion": 5, "O-Illegal Shift": 5,
  "O-Illegal Substitution": 5, "O-Illegal Use of Hands": 10,
  "O-Ineligible Downfield": 5, "O-Intentional Grounding": 10,
  "O-Offensive Pass Interference": 10, "O-Personal Foul": 15,
  "O-Targeting": 15, "O-Too Many Men on Field": 5,
  "O-Tripping": 10, "O-Unsportsmanlike Conduct": 15,
  "S-Fair Catch Interference": 15, "S-Illegal Touching": 5, "S-Kick Catch Interference": 15,
};

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

/** Phase 4 field scope — the canonical schema contract */
export const playSchema: readonly FieldDefinition[] = [
  {
    name: "playNum",
    label: "Play #",
    outputLabel: "PLAY #",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: true,
  },
  {
    name: "qtr",
    label: "Quarter",
    outputLabel: "QTR",
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
    outputLabel: "ODK",
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
    outputLabel: "SERIES",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "yardLn",
    label: "Yard Line",
    outputLabel: "YARD LN",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "predict",
    defaultPassEntry: 0,
    requiredAtCommit: false,
  },
  {
    name: "dn",
    label: "Down",
    outputLabel: "DN",
    dataType: "integer",
    allowedValues: DN_VALUES,
    source: "COACH",
    defaultPolicy: "predict",
    defaultPassEntry: 0,
    requiredAtCommit: false,
  },
  {
    name: "dist",
    label: "Distance",
    outputLabel: "DIST",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "predict",
    defaultPassEntry: 0,
    requiredAtCommit: false,
  },
  {
    name: "hash",
    label: "Hash",
    outputLabel: "HASH",
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
    outputLabel: "OFF FORM",
    dataType: "string",
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
    lookupMode: "season",
  },
  {
    name: "offPlay",
    label: "Off. Play",
    outputLabel: "OFF PLAY",
    dataType: "string",
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
    lookupMode: "season",
  },
  {
    name: "motion",
    label: "Motion",
    outputLabel: "MOTION",
    dataType: "string",
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
    lookupMode: "season",
  },
  {
    name: "result",
    label: "Result",
    outputLabel: "RESULT",
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
    outputLabel: "GN/LS",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: false,
  },
  {
    name: "twoMin",
    label: "2-Min",
    outputLabel: "2 MIN",
    dataType: "enum",
    allowedValues: EFF_VALUES,
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: false,
  },
  // ── Phase 4 Pass 1 Fields ──
  {
    name: "rusher",
    label: "Rusher",
    outputLabel: "RUSHER",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "passer",
    label: "Passer",
    outputLabel: "PASSER",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "receiver",
    label: "Receiver",
    outputLabel: "RECEIVER",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "penalty",
    label: "Penalty",
    outputLabel: "PENALTY",
    dataType: "enum",
    allowedValues: PENALTY_VALUES,
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
    lookupMode: "fixed",
  },
  {
    name: "penYards",
    label: "Pen Yards",
    outputLabel: "PEN YARDS",
    dataType: "integer",
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "eff",
    label: "Effective",
    outputLabel: "EFF",
    dataType: "enum",
    allowedValues: EFF_VALUES,
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "offStrength",
    label: "Strength",
    outputLabel: "OFF STR",
    dataType: "enum",
    allowedValues: ["L", "BAL", "R"],
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "personnel",
    label: "Personnel",
    outputLabel: "PERSONNEL",
    dataType: "enum",
    allowedValues: ["11", "12", "13", "21", "22", "23", "31", "32", "41", "50"],
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "playType",
    label: "Play Type",
    outputLabel: "PLAY TYPE",
    dataType: "enum",
    allowedValues: PLAY_TYPE_VALUES,
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "playDir",
    label: "Play Dir",
    outputLabel: "PLAY DIR",
    dataType: "enum",
    allowedValues: ["L", "M", "R"],
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "motionDir",
    label: "Motion Dir",
    outputLabel: "MOTION DIR",
    dataType: "enum",
    allowedValues: ["L", "R"],
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  {
    name: "patTry",
    label: "PAT Try",
    outputLabel: "PAT TRY",
    dataType: "enum",
    allowedValues: ["1", "2"],
    source: "LOGIC",
    defaultPolicy: "null",
    defaultPassEntry: 0,
    requiredAtCommit: false,
  },
  // ── Phase 6 Pass 2: Personnel Position Fields ──
  {
    name: "posLT",
    label: "LT",
    outputLabel: "LT",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "carryForward",
    defaultPassEntry: 2,
    requiredAtCommit: false,
  },
  {
    name: "posLG",
    label: "LG",
    outputLabel: "LG",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "carryForward",
    defaultPassEntry: 2,
    requiredAtCommit: false,
  },
  {
    name: "posC",
    label: "C",
    outputLabel: "C",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "carryForward",
    defaultPassEntry: 2,
    requiredAtCommit: false,
  },
  {
    name: "posRG",
    label: "RG",
    outputLabel: "RG",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "carryForward",
    defaultPassEntry: 2,
    requiredAtCommit: false,
  },
  {
    name: "posRT",
    label: "RT",
    outputLabel: "RT",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "carryForward",
    defaultPassEntry: 2,
    requiredAtCommit: false,
  },
  {
    name: "posX",
    label: "X",
    outputLabel: "X",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "carryForward",
    defaultPassEntry: 2,
    requiredAtCommit: false,
  },
  {
    name: "posY",
    label: "Y",
    outputLabel: "Y",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "carryForward",
    defaultPassEntry: 2,
    requiredAtCommit: false,
  },
  {
    name: "pos1",
    label: "1",
    outputLabel: "1",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "carryForward",
    defaultPassEntry: 2,
    requiredAtCommit: false,
  },
  {
    name: "pos2",
    label: "2",
    outputLabel: "2",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "carryForward",
    defaultPassEntry: 2,
    requiredAtCommit: false,
  },
  {
    name: "pos3",
    label: "3",
    outputLabel: "3",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "carryForward",
    defaultPassEntry: 2,
    requiredAtCommit: false,
  },
  {
    name: "pos4",
    label: "4",
    outputLabel: "4",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "carryForward",
    defaultPassEntry: 2,
    requiredAtCommit: false,
  },
  {
    name: "returner",
    label: "Returner",
    outputLabel: "RETURNER",
    dataType: "integer",
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
  },
  // ── Phase 7 Pass 3: Blocking Grade Fields ──
  {
    name: "gradeLT",
    label: "LT Grade",
    outputLabel: "LT GRADE",
    dataType: "integer",
    allowedValues: ["-3", "-2", "-1", "0", "1", "2", "3"],
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 3,
    requiredAtCommit: false,
  },
  {
    name: "gradeLG",
    label: "LG Grade",
    outputLabel: "LG GRADE",
    dataType: "integer",
    allowedValues: ["-3", "-2", "-1", "0", "1", "2", "3"],
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 3,
    requiredAtCommit: false,
  },
  {
    name: "gradeC",
    label: "C Grade",
    outputLabel: "C GRADE",
    dataType: "integer",
    allowedValues: ["-3", "-2", "-1", "0", "1", "2", "3"],
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 3,
    requiredAtCommit: false,
  },
  {
    name: "gradeRG",
    label: "RG Grade",
    outputLabel: "RG GRADE",
    dataType: "integer",
    allowedValues: ["-3", "-2", "-1", "0", "1", "2", "3"],
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 3,
    requiredAtCommit: false,
  },
  {
    name: "gradeRT",
    label: "RT Grade",
    outputLabel: "RT GRADE",
    dataType: "integer",
    allowedValues: ["-3", "-2", "-1", "0", "1", "2", "3"],
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 3,
    requiredAtCommit: false,
  },
  {
    name: "gradeX",
    label: "X Grade",
    outputLabel: "X GRADE",
    dataType: "integer",
    allowedValues: ["-3", "-2", "-1", "0", "1", "2", "3"],
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 3,
    requiredAtCommit: false,
  },
  {
    name: "gradeY",
    label: "Y Grade",
    outputLabel: "Y GRADE",
    dataType: "integer",
    allowedValues: ["-3", "-2", "-1", "0", "1", "2", "3"],
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 3,
    requiredAtCommit: false,
  },
  {
    name: "grade1",
    label: "1 Grade",
    outputLabel: "1 GRADE",
    dataType: "integer",
    allowedValues: ["-3", "-2", "-1", "0", "1", "2", "3"],
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 3,
    requiredAtCommit: false,
  },
  {
    name: "grade2",
    label: "2 Grade",
    outputLabel: "2 GRADE",
    dataType: "integer",
    allowedValues: ["-3", "-2", "-1", "0", "1", "2", "3"],
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 3,
    requiredAtCommit: false,
  },
  {
    name: "grade3",
    label: "3 Grade",
    outputLabel: "3 GRADE",
    dataType: "integer",
    allowedValues: ["-3", "-2", "-1", "0", "1", "2", "3"],
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 3,
    requiredAtCommit: false,
  },
  {
    name: "grade4",
    label: "4 Grade",
    outputLabel: "4 GRADE",
    dataType: "integer",
    allowedValues: ["-3", "-2", "-1", "0", "1", "2", "3"],
    source: "COACH",
    defaultPolicy: "null",
    defaultPassEntry: 3,
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
