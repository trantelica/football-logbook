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
  opponent: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO 8601
  schemaVersion: string;
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
