/**
 * Football Engine — Session Archive Export (Phase 8.2)
 *
 * Pure functions only. No DB imports. No side effects.
 * Exports a single game's committed state + lookup snapshot as JSON.
 */

import type { PlayRecord, CoachNote, LookupTable, RosterEntry } from "./types";
import { APP_VERSION, SCHEMA_VERSION, exportSchemaSnapshot } from "./schema";

// ── Constants ──

export const SESSION_ARCHIVE_FORMAT_VERSION = "8.2.0";
export const SESSION_ARCHIVE_FILENAME = "session_archive.json";

// ── Types ──

export interface SessionArchiveMeta {
  appVersion: string;
  exportFormatVersion: string;
  schemaVersion: string;
  lookupStoreVersion: string;
  seasonRevision: number;
  exportedAt: string;
}

export interface SessionArchiveGame {
  gameId: string;
  opponent: string | null;
  date: string | null;
  score: string | null;
}

export interface SessionArchiveLookupsSnapshot {
  offForm: LookupTable | null;
  offPlay: LookupTable | null;
  motion: LookupTable | null;
  roster: RosterEntry[] | null;
}

export interface SessionArchive {
  meta: SessionArchiveMeta;
  game: SessionArchiveGame;
  counts: { plays: number; notes: number };
  plays: PlayRecord[];
  notes: CoachNote[];
  lookups: SessionArchiveLookupsSnapshot;
  schemaSnapshot: ReturnType<typeof exportSchemaSnapshot>;
}

// ── Validation (A-tier only) ──

export interface ArchiveError {
  playNumber: number | null;
  field: string;
  message: string;
}

export interface ArchiveValidationResult {
  valid: boolean;
  errors: ArchiveError[];
}

/**
 * Minimum validation for archive export.
 * Only checks playNum integrity (present, integer, >0, unique).
 */
export function validateArchiveMinimum(
  plays: ReadonlyArray<PlayRecord>
): ArchiveValidationResult {
  const errors: ArchiveError[] = [];
  const seen = new Set<number>();

  for (const p of plays) {
    const pn = p.playNum;
    if (pn == null || !Number.isInteger(pn) || pn <= 0) {
      errors.push({
        playNumber: pn ?? null,
        field: "playNum",
        message: "playNum must be a positive integer",
      });
      continue;
    }
    if (seen.has(pn)) {
      errors.push({
        playNumber: pn,
        field: "playNum",
        message: `Duplicate playNum: ${pn}`,
      });
      continue;
    }
    seen.add(pn);
  }

  return { valid: errors.length === 0, errors };
}

// ── Builder ──

export interface BuildSessionArchiveParams {
  gameMeta: { gameId: string; opponent?: string | null; date?: string | null };
  plays: ReadonlyArray<PlayRecord>;
  notes: ReadonlyArray<CoachNote>;
  lookupsSnapshot: SessionArchiveLookupsSnapshot;
  seasonRevision: number;
  lookupStoreVersion?: string;
  exportedAtISO?: string;
}

/**
 * Build a session archive object. Pure, no side effects, no mutation.
 */
export function buildSessionArchive(params: BuildSessionArchiveParams): SessionArchive {
  const sortedPlays = [...params.plays].sort((a, b) => a.playNum - b.playNum);
  const notesCopy = [...params.notes];

  return {
    meta: {
      appVersion: APP_VERSION,
      exportFormatVersion: SESSION_ARCHIVE_FORMAT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      lookupStoreVersion: params.lookupStoreVersion ?? "unknown",
      seasonRevision: params.seasonRevision,
      exportedAt: params.exportedAtISO ?? new Date().toISOString(),
    },
    game: {
      gameId: params.gameMeta.gameId,
      opponent: params.gameMeta.opponent ?? null,
      date: params.gameMeta.date ?? null,
      score: null,
    },
    counts: {
      plays: sortedPlays.length,
      notes: notesCopy.length,
    },
    plays: sortedPlays,
    notes: notesCopy,
    lookups: { ...params.lookupsSnapshot },
    schemaSnapshot: exportSchemaSnapshot(),
  };
}
