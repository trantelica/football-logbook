/**
 * Football Engine — Season Package Transfer (Phase 8.4)
 *
 * Pure functions only. No DB imports. No side effects.
 * Builds, validates, and normalizes season-level export/import packages.
 */

import type { SeasonMeta, GameMeta, PlayRecord, CoachNote, LookupTable, RosterEntry } from "./types";
import { APP_VERSION, SCHEMA_VERSION } from "./schema";

// ── Constants ──

export const SEASON_PACKAGE_FORMAT_VERSION = "8.4.0";
export const SEASON_PACKAGE_FILENAME = "season_package.json";

// ── Types ──

export interface SeasonPackageMeta {
  appVersion: string;
  schemaVersion: string;
  packageFormatVersion: string;
  exportedAt: string;
}

export interface SeasonPackage {
  meta: SeasonPackageMeta;
  season: SeasonMeta;
  lookups: Record<string, LookupTable | null>;
  roster: RosterEntry[] | null;
  games: GameMeta[];
  playsByGame: Record<string, PlayRecord[]>;
  notesByGame: Record<string, CoachNote[]>;
}

export interface SeasonImportValidationError {
  path: string;
  message: string;
}

export interface SeasonImportValidationResult {
  valid: boolean;
  errors: SeasonImportValidationError[];
}

export interface NormalizedSeasonPackage {
  season: SeasonMeta;
  lookups: Record<string, LookupTable | null>;
  roster: RosterEntry[] | null;
  games: GameMeta[];
  playsByGame: Record<string, PlayRecord[]>;
  notesByGame: Record<string, CoachNote[]>;
}

// ── Validation ──

export function validateSeasonPackageImport(payload: unknown): SeasonImportValidationResult {
  const errors: SeasonImportValidationError[] = [];

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
    if (typeof meta.packageFormatVersion !== "string") {
      errors.push({ path: "meta.packageFormatVersion", message: "Must be a string" });
    }
    if (typeof meta.exportedAt !== "string") {
      errors.push({ path: "meta.exportedAt", message: "Must be a string" });
    }
  }

  // season
  if (!obj.season || typeof obj.season !== "object") {
    errors.push({ path: "season", message: "Missing or invalid 'season' object" });
  } else {
    const season = obj.season as Record<string, unknown>;
    if (typeof season.seasonId !== "string" || !season.seasonId) {
      errors.push({ path: "season.seasonId", message: "Must be a non-empty string" });
    }
    if (typeof season.label !== "string" || !season.label) {
      errors.push({ path: "season.label", message: "Must be a non-empty string" });
    }
  }

  // games
  if (!Array.isArray(obj.games)) {
    errors.push({ path: "games", message: "Must be an array" });
  } else {
    for (let i = 0; i < obj.games.length; i++) {
      const g = obj.games[i] as Record<string, unknown> | null;
      if (!g || typeof g !== "object") {
        errors.push({ path: `games[${i}]`, message: "Must be an object" });
        continue;
      }
      if (typeof g.gameId !== "string" || !g.gameId) {
        errors.push({ path: `games[${i}].gameId`, message: "Must be a non-empty string" });
      }
    }
  }

  // playsByGame
  if (!obj.playsByGame || typeof obj.playsByGame !== "object") {
    errors.push({ path: "playsByGame", message: "Must be an object" });
  } else {
    const pbg = obj.playsByGame as Record<string, unknown>;
    for (const [gameId, plays] of Object.entries(pbg)) {
      if (!Array.isArray(plays)) {
        errors.push({ path: `playsByGame.${gameId}`, message: "Must be an array" });
        continue;
      }
      const seenPlayNums = new Set<number>();
      for (let i = 0; i < plays.length; i++) {
        const p = plays[i] as Record<string, unknown> | null;
        if (!p || typeof p !== "object") {
          errors.push({ path: `playsByGame.${gameId}[${i}]`, message: "Must be an object" });
          continue;
        }
        if (typeof p.playNum !== "number" || !Number.isInteger(p.playNum) || p.playNum < 1) {
          errors.push({ path: `playsByGame.${gameId}[${i}].playNum`, message: "Must be a positive integer" });
          continue;
        }
        if (seenPlayNums.has(p.playNum)) {
          errors.push({ path: `playsByGame.${gameId}[${i}].playNum`, message: `Duplicate playNum ${p.playNum}` });
        }
        seenPlayNums.add(p.playNum);
      }
    }
  }

  // notesByGame
  if (!obj.notesByGame || typeof obj.notesByGame !== "object") {
    errors.push({ path: "notesByGame", message: "Must be an object" });
  } else {
    const nbg = obj.notesByGame as Record<string, unknown>;
    for (const [gameId, notes] of Object.entries(nbg)) {
      if (!Array.isArray(notes)) {
        errors.push({ path: `notesByGame.${gameId}`, message: "Must be an array" });
        continue;
      }
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i] as Record<string, unknown> | null;
        if (!n || typeof n !== "object") {
          errors.push({ path: `notesByGame.${gameId}[${i}]`, message: "Must be an object" });
          continue;
        }
        if (typeof n.id !== "string" || !n.id) {
          errors.push({ path: `notesByGame.${gameId}[${i}].id`, message: "Must be a non-empty string" });
        }
        if (typeof n.createdAt !== "string") {
          errors.push({ path: `notesByGame.${gameId}[${i}].createdAt`, message: "Must be a string" });
        }
      }
    }
  }

  // lookups — object, keys are field names
  if (obj.lookups !== undefined && obj.lookups !== null && typeof obj.lookups !== "object") {
    errors.push({ path: "lookups", message: "Must be an object or null" });
  }

  // roster — array or null
  if (obj.roster !== null && obj.roster !== undefined && !Array.isArray(obj.roster)) {
    errors.push({ path: "roster", message: "Must be an array or null" });
  }

  return { valid: errors.length === 0, errors };
}

// ── Normalize ──

export function normalizeSeasonPackageImport(payload: unknown): NormalizedSeasonPackage {
  // Deep-clone everything to prevent shared references
  const cloned = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;

  const season = cloned.season as SeasonMeta;
  const lookups = (cloned.lookups ?? {}) as Record<string, LookupTable | null>;
  const roster = (cloned.roster as RosterEntry[] | null) ?? null;
  const games = (cloned.games as GameMeta[]) ?? [];
  const playsByGame = (cloned.playsByGame as Record<string, PlayRecord[]>) ?? {};
  const notesByGame = (cloned.notesByGame as Record<string, CoachNote[]>) ?? {};

  return { season, lookups, roster, games, playsByGame, notesByGame };
}

// ── Builder ──

export interface BuildSeasonPackageParams {
  season: SeasonMeta;
  lookupTables: ReadonlyArray<LookupTable>;
  roster: ReadonlyArray<RosterEntry> | null;
  games: ReadonlyArray<GameMeta>;
  playsByGame: Readonly<Record<string, ReadonlyArray<PlayRecord>>>;
  notesByGame: Readonly<Record<string, ReadonlyArray<CoachNote>>>;
  exportedAtISO?: string;
}

export function buildSeasonPackage(params: BuildSeasonPackageParams): SeasonPackage {
  const exportedAt = params.exportedAtISO ?? new Date().toISOString();

  // Build lookups dictionary from array, deep-cloning entryAttributes
  const lookups: Record<string, LookupTable | null> = {};
  for (const lt of params.lookupTables) {
    lookups[lt.fieldName] = {
      ...lt,
      values: [...lt.values],
      updatedAt: lt.updatedAt || new Date().toISOString(),
      ...(lt.entryAttributes
        ? { entryAttributes: JSON.parse(JSON.stringify(lt.entryAttributes)) }
        : {}),
    };
  }

  // Deep-clone and sort plays by playNum per game
  const playsByGame: Record<string, PlayRecord[]> = {};
  for (const [gameId, plays] of Object.entries(params.playsByGame)) {
    playsByGame[gameId] = [...plays]
      .map((p) => ({ ...p }))
      .sort((a, b) => a.playNum - b.playNum);
  }

  // Deep-clone notes
  const notesByGame: Record<string, CoachNote[]> = {};
  for (const [gameId, notes] of Object.entries(params.notesByGame)) {
    notesByGame[gameId] = notes.map((n) => ({ ...n }));
  }

  return {
    meta: {
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      packageFormatVersion: SEASON_PACKAGE_FORMAT_VERSION,
      exportedAt,
    },
    season: { ...params.season },
    lookups,
    roster: params.roster ? params.roster.map((r) => ({ ...r })) : null,
    games: params.games.map((g) => ({ ...g })),
    playsByGame,
    notesByGame,
  };
}
