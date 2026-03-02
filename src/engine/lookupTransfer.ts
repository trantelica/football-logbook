/**
 * Football Engine — Lookup Transfer (Phase 8.3)
 *
 * Pure functions only. No DB imports. No side effects.
 * Builds export payload and validates import payload for season-scoped lookups + roster.
 */

import type { LookupTable, RosterEntry } from "./types";
import { APP_VERSION, SCHEMA_VERSION } from "./schema";

// ── Constants ──

export const LOOKUP_TRANSFER_FORMAT_VERSION = "8.3.0";
export const LOOKUP_TRANSFER_FILENAME = "lookups_export.json";

// ── Types ──

export interface LookupsExportMeta {
  appVersion: string;
  schemaVersion: string;
  exportFormatVersion: string;
  lookupStoreVersion: string;
  seasonId: string;
  seasonRevision: number;
  exportedAt: string;
}

export interface LookupsExportLookups {
  offForm: LookupTable | null;
  offPlay: LookupTable | null;
  motion: LookupTable | null;
}

export interface LookupsExport {
  meta: LookupsExportMeta;
  lookups: LookupsExportLookups;
  roster: RosterEntry[] | null;
}

// ── Validation ──

export interface ImportValidationError {
  path: string;
  message: string;
}

export interface ImportValidationResult {
  valid: boolean;
  errors: ImportValidationError[];
}

const EXPECTED_LOOKUP_FIELDS = ["offForm", "offPlay", "motion"] as const;

/**
 * Validate a parsed JSON payload for lookup import.
 * Returns all errors (does not throw).
 */
export function validateLookupsImport(payload: unknown): ImportValidationResult {
  const errors: ImportValidationError[] = [];

  if (!payload || typeof payload !== "object") {
    errors.push({ path: "root", message: "Payload must be a non-null object" });
    return { valid: false, errors };
  }

  const obj = payload as Record<string, unknown>;

  // meta checks
  if (!obj.meta || typeof obj.meta !== "object") {
    errors.push({ path: "meta", message: "Missing or invalid 'meta' object" });
  } else {
    const meta = obj.meta as Record<string, unknown>;
    if (typeof meta.seasonId !== "string" || !meta.seasonId) {
      errors.push({ path: "meta.seasonId", message: "meta.seasonId must be a non-empty string" });
    }
  }

  // lookups checks
  if (!obj.lookups || typeof obj.lookups !== "object") {
    errors.push({ path: "lookups", message: "Missing or invalid 'lookups' object" });
  } else {
    const lookups = obj.lookups as Record<string, unknown>;
    for (const field of EXPECTED_LOOKUP_FIELDS) {
      const table = lookups[field];
      if (table === null || table === undefined) continue; // null is acceptable
      if (typeof table !== "object") {
        errors.push({ path: `lookups.${field}`, message: `Must be an object or null` });
        continue;
      }
      const t = table as Record<string, unknown>;
      if (t.fieldName !== field) {
        errors.push({
          path: `lookups.${field}.fieldName`,
          message: `Expected fieldName "${field}", got "${String(t.fieldName)}"`,
        });
      }
      if (!Array.isArray(t.values)) {
        errors.push({ path: `lookups.${field}.values`, message: "values must be an array" });
      }
    }
  }

  // roster checks
  if (obj.roster !== null && obj.roster !== undefined) {
    if (!Array.isArray(obj.roster)) {
      errors.push({ path: "roster", message: "roster must be an array or null" });
    } else {
      for (let i = 0; i < obj.roster.length; i++) {
        const entry = obj.roster[i] as Record<string, unknown>;
        if (!entry || typeof entry !== "object") {
          errors.push({ path: `roster[${i}]`, message: "Each roster entry must be an object" });
          continue;
        }
        if (typeof entry.jerseyNumber !== "number") {
          errors.push({ path: `roster[${i}].jerseyNumber`, message: "jerseyNumber must be a number" });
        }
        if (typeof entry.playerName !== "string") {
          errors.push({ path: `roster[${i}].playerName`, message: "playerName must be a string" });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Normalize ──

export interface NormalizedLookupsImport {
  lookups: LookupsExportLookups;
  roster: RosterEntry[] | null;
}

/**
 * Normalize a validated import payload into clean typed objects.
 * Does not mutate the input.
 */
export function normalizeLookupsImport(payload: unknown): NormalizedLookupsImport {
  const obj = payload as Record<string, unknown>;
  const lookups = obj.lookups as Record<string, unknown>;

  const normalize = (field: string): LookupTable | null => {
    const table = lookups[field];
    if (!table) return null;
    const t = table as LookupTable;
    return {
      seasonId: t.seasonId,
      fieldName: t.fieldName,
      values: [...t.values],
      updatedAt: t.updatedAt,
      ...(t.entryAttributes ? { entryAttributes: JSON.parse(JSON.stringify(t.entryAttributes)) } : {}),
    };
  };

  const rawRoster = obj.roster as RosterEntry[] | null | undefined;
  const roster = rawRoster
    ? rawRoster.map((r) => ({
        seasonId: r.seasonId,
        jerseyNumber: r.jerseyNumber,
        playerName: r.playerName,
      }))
    : null;

  return {
    lookups: {
      offForm: normalize("offForm"),
      offPlay: normalize("offPlay"),
      motion: normalize("motion"),
    },
    roster,
  };
}

// ── Builder ──

export interface BuildLookupsExportParams {
  seasonId: string;
  seasonRevision: number;
  lookupTables: ReadonlyArray<LookupTable>;
  roster: ReadonlyArray<RosterEntry> | null;
  lookupStoreVersion?: string;
  exportedAtISO?: string;
}

/**
 * Build a lookups export object. Pure, no side effects, no mutation.
 */
export function buildLookupsExport(params: BuildLookupsExportParams): LookupsExport {
  const findTable = (fieldName: string): LookupTable | null => {
    const t = params.lookupTables.find((lt) => lt.fieldName === fieldName);
    if (!t) return null;
    return {
      ...t,
      values: [...t.values],
      updatedAt: t.updatedAt || new Date().toISOString(),
      ...(t.entryAttributes
        ? { entryAttributes: JSON.parse(JSON.stringify(t.entryAttributes)) }
        : {}),
    };
  };

  return {
    meta: {
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportFormatVersion: LOOKUP_TRANSFER_FORMAT_VERSION,
      lookupStoreVersion: params.lookupStoreVersion ?? "unknown",
      seasonId: params.seasonId,
      seasonRevision: params.seasonRevision,
      exportedAt: params.exportedAtISO ?? new Date().toISOString(),
    },
    lookups: {
      offForm: findTable("offForm"),
      offPlay: findTable("offPlay"),
      motion: findTable("motion"),
    },
    roster: params.roster ? params.roster.map((r) => ({ ...r })) : null,
  };
}
