/**
 * Football Engine — Session Archive Import v1 (restore-only)
 *
 * Pure functions only. No DB imports. No side effects.
 * Validates and normalizes a previously-exported session archive
 * (see sessionArchiveExport.ts) for restore as a NEW local game.
 *
 * Non-goals: merge, partial import, conflict resolution against an
 * existing session, schema expansion.
 */

import type { PlayRecord, CoachNote } from "./types";
import type { SessionArchive, SessionArchiveLookupsSnapshot } from "./sessionArchiveExport";

// ── Errors ──

export interface ArchiveImportValidationError {
  path: string;
  message: string;
}

export interface ArchiveImportValidationResult {
  valid: boolean;
  errors: ArchiveImportValidationError[];
}

// ── Normalized shape (deep-cloned, safe to mutate) ──

export interface NormalizedSessionArchive {
  sourceGameId: string;
  opponent: string | null;
  date: string | null;
  plays: PlayRecord[];
  notes: CoachNote[];
  lookups: SessionArchiveLookupsSnapshot;
  seasonRevision: number;
  exportedAt: string;
}

// ── Validation ──

/**
 * Validate that payload matches the session archive shape produced by
 * buildSessionArchive(). Strict on required fields; does NOT validate
 * play schema beyond playNum integrity (matching seasonTransfer
 * conventions).
 */
export function validateSessionArchiveImport(payload: unknown): ArchiveImportValidationResult {
  const errors: ArchiveImportValidationError[] = [];

  if (!payload || typeof payload !== "object") {
    errors.push({ path: "root", message: "Payload must be a non-null object" });
    return { valid: false, errors };
  }
  const obj = payload as Record<string, unknown>;

  // meta
  if (!obj.meta || typeof obj.meta !== "object") {
    errors.push({ path: "meta", message: "Missing or invalid 'meta' object" });
  } else {
    const meta = obj.meta as Record<string, unknown>;
    if (typeof meta.exportFormatVersion !== "string") {
      errors.push({ path: "meta.exportFormatVersion", message: "Must be a string" });
    }
    if (typeof meta.schemaVersion !== "string") {
      errors.push({ path: "meta.schemaVersion", message: "Must be a string" });
    }
    if (typeof meta.exportedAt !== "string") {
      errors.push({ path: "meta.exportedAt", message: "Must be a string" });
    }
  }

  // game
  if (!obj.game || typeof obj.game !== "object") {
    errors.push({ path: "game", message: "Missing or invalid 'game' object" });
  } else {
    const game = obj.game as Record<string, unknown>;
    if (typeof game.gameId !== "string" || !game.gameId) {
      errors.push({ path: "game.gameId", message: "Must be a non-empty string" });
    }
  }

  // plays
  if (!Array.isArray(obj.plays)) {
    errors.push({ path: "plays", message: "Must be an array" });
  } else {
    const seen = new Set<number>();
    for (let i = 0; i < obj.plays.length; i++) {
      const p = obj.plays[i] as Record<string, unknown> | null;
      if (!p || typeof p !== "object") {
        errors.push({ path: `plays[${i}]`, message: "Must be an object" });
        continue;
      }
      if (typeof p.playNum !== "number" || !Number.isInteger(p.playNum) || (p.playNum as number) < 1) {
        errors.push({ path: `plays[${i}].playNum`, message: "Must be a positive integer" });
        continue;
      }
      if (seen.has(p.playNum as number)) {
        errors.push({ path: `plays[${i}].playNum`, message: `Duplicate playNum ${p.playNum}` });
      }
      seen.add(p.playNum as number);
    }
  }

  // notes
  if (!Array.isArray(obj.notes)) {
    errors.push({ path: "notes", message: "Must be an array" });
  } else {
    for (let i = 0; i < obj.notes.length; i++) {
      const n = obj.notes[i] as Record<string, unknown> | null;
      if (!n || typeof n !== "object") {
        errors.push({ path: `notes[${i}]`, message: "Must be an object" });
        continue;
      }
      if (typeof n.id !== "string" || !n.id) {
        errors.push({ path: `notes[${i}].id`, message: "Must be a non-empty string" });
      }
      if (typeof n.createdAt !== "string") {
        errors.push({ path: `notes[${i}].createdAt`, message: "Must be a string" });
      }
    }
  }

  // lookups — object with expected keys or null entries
  if (obj.lookups === undefined || obj.lookups === null || typeof obj.lookups !== "object") {
    errors.push({ path: "lookups", message: "Must be an object" });
  }

  return { valid: errors.length === 0, errors };
}

// ── Normalize ──

/**
 * Deep-clone the payload and project it to a NormalizedSessionArchive.
 * Call only after validateSessionArchiveImport() returns valid.
 */
export function normalizeSessionArchiveImport(payload: unknown): NormalizedSessionArchive {
  const cloned = JSON.parse(JSON.stringify(payload)) as SessionArchive;

  const lookups: SessionArchiveLookupsSnapshot = {
    offForm: cloned.lookups?.offForm ?? null,
    offPlay: cloned.lookups?.offPlay ?? null,
    motion: cloned.lookups?.motion ?? null,
    roster: cloned.lookups?.roster ?? null,
  };

  return {
    sourceGameId: cloned.game.gameId,
    opponent: cloned.game.opponent ?? null,
    date: cloned.game.date ?? null,
    plays: [...(cloned.plays ?? [])].sort((a, b) => a.playNum - b.playNum),
    notes: [...(cloned.notes ?? [])],
    lookups,
    seasonRevision: cloned.meta?.seasonRevision ?? 0,
    exportedAt: cloned.meta?.exportedAt ?? new Date().toISOString(),
  };
}

// ── Restored-copy labeling ──

/**
 * Build a restored opponent label that never collides with an existing
 * game's opponent label in the active season. Always appends
 * " (Restored)" and, if needed, a numeric suffix to guarantee uniqueness.
 *
 * existingOpponents may contain duplicates; comparison is case-insensitive.
 */
export function buildRestoredOpponentLabel(
  sourceOpponent: string | null,
  existingOpponents: ReadonlyArray<string>,
): string {
  const base = (sourceOpponent ?? "Unknown").trim() || "Unknown";
  const existing = new Set(existingOpponents.map((o) => o.trim().toLowerCase()));

  const first = `${base} (Restored)`;
  if (!existing.has(first.toLowerCase())) return first;

  let n = 2;
  // hard cap to avoid pathological loops
  while (n < 10000) {
    const candidate = `${base} (Restored ${n})`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
    n++;
  }
  return `${base} (Restored ${Date.now()})`;
}
