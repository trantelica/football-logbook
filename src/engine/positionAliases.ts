/**
 * Pass 2 Position Aliases — translation layer (Phase 2.x)
 *
 * Pure helpers. No DB. No side effects.
 *
 * Hard rule: aliases are translation/display only. Stored data, proposal
 * patches, committed rows, and exports MUST always use the canonical
 * position field names (posLT, posLG, posC, posRG, posRT, posY, posX,
 * pos1, pos2, pos3, pos4).
 */

import { PERSONNEL_POSITIONS, PERSONNEL_LABELS } from "./personnel";

/** Canonical position labels (display short names) — order matches PERSONNEL_POSITIONS. */
export const CANONICAL_POSITION_LABELS = PERSONNEL_POSITIONS.map(
  (p) => PERSONNEL_LABELS[p],
);

/** Map of canonical-field-name → optional alias string. */
export type PositionAliasMap = Partial<Record<(typeof PERSONNEL_POSITIONS)[number], string>>;

/** Trim + uppercase a token for case-insensitive comparison. */
export function normalizeAlias(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).trim().toUpperCase();
}

/** Build a normalized lookup of canonical label (uppercase) → canonical field name. */
const CANONICAL_LABEL_TO_FIELD: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const field of PERSONNEL_POSITIONS) {
    out[normalizeAlias(PERSONNEL_LABELS[field])] = field;
  }
  return out;
})();

/**
 * Validate a proposed alias map.
 * Returns a per-field error map (empty = valid).
 *
 * Rules:
 *  - alias is optional (empty / undefined are fine)
 *  - case-insensitive + trimmed comparisons
 *  - no duplicate aliases across positions
 *  - alias may NOT equal any canonical position label (including its own)
 *    — per spec: "do not allow alias 'RG' for slot 3", and we go strictest:
 *    block all canonical-label collisions to keep canonical identity unambiguous.
 */
export function validateAliasMap(map: PositionAliasMap): Record<string, string> {
  const errors: Record<string, string> = {};
  const seen = new Map<string, string>(); // normalized alias → canonical field

  for (const field of PERSONNEL_POSITIONS) {
    const raw = map[field];
    const norm = normalizeAlias(raw);
    if (!norm) continue;

    // Canonical-label collision (any canonical label, including its own slot)
    if (CANONICAL_LABEL_TO_FIELD[norm] !== undefined) {
      errors[field] = `Alias "${raw}" collides with canonical position label "${norm}"`;
      continue;
    }

    // Duplicate across positions
    const prior = seen.get(norm);
    if (prior) {
      errors[field] = `Alias "${raw}" is already used by ${PERSONNEL_LABELS[prior]}`;
      continue;
    }
    seen.set(norm, field);
  }

  return errors;
}

/**
 * Resolve a free-text token to a canonical position field name.
 * Accepts canonical labels (e.g. "1", "RG", "Y") or any configured alias
 * (e.g. "QB", "F", "H"). Case-insensitive, whitespace trimmed.
 *
 * Returns the canonical field name (e.g. "pos1") or null if unknown.
 */
export function resolveToCanonicalPos(
  token: string | null | undefined,
  map: PositionAliasMap | undefined | null,
): string | null {
  const norm = normalizeAlias(token);
  if (!norm) return null;

  // Canonical first
  if (CANONICAL_LABEL_TO_FIELD[norm]) return CANONICAL_LABEL_TO_FIELD[norm];

  // Then aliases
  if (map) {
    for (const field of PERSONNEL_POSITIONS) {
      const a = normalizeAlias(map[field]);
      if (a && a === norm) return field;
    }
  }
  return null;
}

/** Display helper: alias text for a canonical field, or null. */
export function getAliasFor(
  canonicalField: string,
  map: PositionAliasMap | undefined | null,
): string | null {
  if (!map) return null;
  const v = (map as Record<string, unknown>)[canonicalField];
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * Translate any non-canonical position-token keys in a patch to canonical
 * pos* field keys, using the alias map. Canonical keys pass through unchanged.
 *
 * Returns { patch, unresolved } — `patch` only contains canonical keys; any
 * source key that could not be resolved is dropped and listed in `unresolved`.
 *
 * Used at the seam between AI/parser output and proposal-patch construction
 * to enforce: "proposal patches still write only canonical fields".
 */
export function normalizePatchKeysToCanonical(
  rawPatch: Record<string, unknown>,
  map: PositionAliasMap | undefined | null,
): { patch: Record<string, unknown>; unresolved: string[] } {
  const out: Record<string, unknown> = {};
  const unresolved: string[] = [];
  const canonicalSet = new Set<string>(PERSONNEL_POSITIONS);

  for (const [k, v] of Object.entries(rawPatch)) {
    // Canonical pos* field — pass through
    if (canonicalSet.has(k)) {
      out[k] = v;
      continue;
    }
    // Try to interpret key as a position token (label or alias)
    const resolved = resolveToCanonicalPos(k, map);
    if (resolved) {
      out[resolved] = v;
    } else {
      out[k] = v; // non-position key, leave alone
    }
  }
  return { patch: out, unresolved };
}
