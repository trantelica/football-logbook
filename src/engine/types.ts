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
  twoMin: boolean | null;
}

/** Candidate/draft data — all fields optional except gameId */
export type CandidateData = {
  [K in keyof Omit<PlayRecord, "gameId">]?: PlayRecord[K] | string;
} & { gameId: string };

/** Game metadata */
export interface GameMeta {
  gameId: string;
  seasonId: string;
  opponent: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO 8601
  schemaVersion: string;
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
