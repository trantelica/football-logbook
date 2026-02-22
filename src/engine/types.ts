/**
 * Football Engine — TypeScript types derived from the schema contract
 */

import type { ODK } from "./schema";

/** A committed play record stored in IndexedDB */
export interface PlayRecord {
  gameId: string;
  playNum: number;
  qtr: string | null;
  odk: ODK | null;
  series: number | null;
  yardLn: number | null;
  dn: string | null;
  dist: number | null;
  hash: string | null;
  offForm: string | null;
  offPlay: string | null;
  motion: string | null;
  result: string | null;
  gainLoss: number | null;
  twoMin: string | null;
  // Phase 4 Pass 1 fields
  rusher: number | null;
  passer: number | null;
  receiver: number | null;
  penalty: string | null;
  penYards: number | null;
  eff: string | null;
  offStrength: string | null;
  personnel: string | null;
  playType: string | null;
  playDir: string | null;
  motionDir: string | null;
  /** PAT try type: "1" (extra point) or "2" (two-point conversion) */
  patTry: string | null;
}

/** Candidate/draft data — all fields optional except gameId */
export type CandidateData = {
  [K in keyof Omit<PlayRecord, "gameId">]?: PlayRecord[K] | string;
} & { gameId: string };

/** PAT mode for the game */
export type PatMode = "none" | "youth_1_2" | "hs_kick";

/** Game metadata */
export interface GameMeta {
  gameId: string;
  seasonId: string;
  opponent: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO 8601
  schemaVersion: string;
  /** Field size for yardline prediction (80 or 100). Default 80. Immutable after creation. */
  fieldSize?: 80 | 100;
  /** PAT mode. Immutable after creation. Default "none". */
  patMode?: PatMode;
}

/** Season metadata */
export interface SeasonMeta {
  seasonId: string;
  label: string; // e.g. "2025 Varsity"
  createdAt: string; // ISO 8601
  seasonRevision: number; // monotonic, incremented on any lookup/roster mutation
}

/** Season-scoped lookup table for a single field */
export interface LookupTable {
  seasonId: string;
  fieldName: string; // "offForm" | "offPlay" | "motion"
  values: string[]; // ordered approved values
  updatedAt: string; // ISO 8601
  /** Dependent attributes per entry: canonical(value) → { attrName: attrValue } */
  entryAttributes?: Record<string, Record<string, string>>;
}

/** Append-only audit record for lookup mutations */
export interface LookupAuditRecord {
  id?: number; // auto-increment IDB key
  seasonId: string;
  fieldName: string;
  action: "add" | "remove";
  value: string;
  seasonRevision: number; // revision after this change
  timestamp: string; // ISO 8601
}

/** Season-scoped roster entry */
export interface RosterEntry {
  seasonId: string;
  jerseyNumber: number;
  playerName: string;
}

/** Append-only audit record for roster mutations */
export interface RosterAuditRecord {
  id?: number; // auto-increment IDB key
  seasonId: string;
  jerseyNumber: number;
  playerName: string;
  action: "add" | "remove" | "update";
  seasonRevision: number;
  timestamp: string; // ISO 8601
}

/** Audit log entry — append-only */
export interface AuditRecord {
  id?: number; // auto-incremented IDB key
  auditSeq: number; // monotonically increasing per-game
  timestamp: string; // ISO 8601
  gameId: string;
  playNum: number;
  schemaVersion: string;
  action: "commit" | "overwrite";
  fieldsChanged: string[];
  beforeValues: Record<string, unknown> | null;
  afterValues: Record<string, unknown>;
  committedSnapshot: PlayRecord;
  snapshotHash: string;
}

/** Transaction states */
export type TransactionState =
  | "idle"
  | "candidate"
  | "proposal"
  | "overwrite-review";

/** Validation error map: fieldName → error message */
export type ValidationErrors = Record<string, string>;

/** ODK block for game initialization */
export interface ODKBlock {
  odk: string; // "O" | "D" | "K" | "S"
  startPlay: number;
  endPlay: number;
}

/** Quarter-to-first-play mapping: "1" → playNum, "2" → playNum, etc. */
export type QuarterMapping = Record<string, number>;

/** Game initialization configuration (Pass 0) */
export interface GameInitConfig {
  gameId: string;
  totalPlays: number;
  quarterStarts: QuarterMapping;
  odkBlocks: ODKBlock[];
  schemaVersion: string;
  dbVersion: number;
  timestamp: string;
}

/** Per-slot metadata tracking field commit state */
export interface SlotMeta {
  gameId: string;
  playNum: number;
  /** Field names that have been committed (seeded fields start committed) */
  committedFields: string[];
}

/** Game-level audit record */
export interface GameAuditRecord {
  id?: number;
  gameId: string;
  timestamp: string;
  action: "init" | "scaffold-recalc";
  schemaVersion: string;
  dbVersion: number;
  details: Record<string, unknown>;
}

/** Raw input provenance record */
export interface RawInputRecord {
  gameId: string;
  playNum: number;
  rawInputText: string;
  rawInputCreatedAt: string;
  rawInputSource: "manual";
  candidatePatch: Record<string, unknown>;
}
