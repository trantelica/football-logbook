/**
 * Football Engine — Season Config Types & Helpers (Phase 9.1)
 *
 * Pure types + functions. No DB imports. No side effects.
 */

export interface SeasonConfig {
  seasonId: string;
  version: number;
  updatedAt: string;
  updatedBy: "local";
  fieldSize: 80 | 100;
  patMode: "none" | "youth_1_2" | "hs_kick";
  activeFields: Record<string, boolean>;
  /**
   * Optional Pass 2 position aliases (translation/display only).
   * Keys are canonical pos* field names (posLT..pos4); values are the
   * coach-friendly alias (e.g. pos1 -> "QB"). Stored data, commits,
   * and exports always use the canonical keys — never the alias text.
   */
  positionAliases?: Record<string, string>;
}

export interface ConfigAuditRecord {
  id?: number;
  seasonId: string;
  eventId: string;
  at: string;
  type: "CONFIG_CHANGE";
  versionBefore: number;
  versionAfter: number;
  changes: Array<{ key: string; before: unknown; after: unknown }>;
}

export function buildDefaultConfig(seasonId: string, fieldKeys: string[]): SeasonConfig {
  const activeFields: Record<string, boolean> = {};
  for (const key of fieldKeys) {
    activeFields[key] = true;
  }
  return {
    seasonId,
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: "local",
    fieldSize: 80,
    patMode: "none",
    activeFields,
  };
}

export interface ConfigChange {
  key: string;
  before: unknown;
  after: unknown;
}

export function diffConfig(before: SeasonConfig, after: SeasonConfig): ConfigChange[] {
  const changes: ConfigChange[] = [];

  // Top-level fieldSize
  if (before.fieldSize !== after.fieldSize) {
    changes.push({ key: "fieldSize", before: before.fieldSize, after: after.fieldSize });
  }

  // Top-level patMode
  if (before.patMode !== after.patMode) {
    changes.push({ key: "patMode", before: before.patMode, after: after.patMode });
  }

  // Nested activeFields
  const allKeys = new Set([
    ...Object.keys(before.activeFields),
    ...Object.keys(after.activeFields),
  ]);
  for (const k of allKeys) {
    const bVal = before.activeFields[k] ?? false;
    const aVal = after.activeFields[k] ?? false;
    if (bVal !== aVal) {
      changes.push({ key: `activeFields.${k}`, before: bVal, after: aVal });
    }
  }

  // Nested positionAliases
  const beforeAliases = before.positionAliases ?? {};
  const afterAliases = after.positionAliases ?? {};
  const aliasKeys = new Set([
    ...Object.keys(beforeAliases),
    ...Object.keys(afterAliases),
  ]);
  for (const k of aliasKeys) {
    const bVal = (beforeAliases[k] ?? "").trim();
    const aVal = (afterAliases[k] ?? "").trim();
    if (bVal !== aVal) {
      changes.push({
        key: `positionAliases.${k}`,
        before: bVal || null,
        after: aVal || null,
      });
    }
  }

  return changes;
}
