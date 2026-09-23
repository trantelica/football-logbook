/**
 * Pass 2 personnel pins ("starters cascade").
 *
 * A pin records "this jersey normally plays this position". Pinned positions
 * are seeded as PROPOSAL-ONLY values into freshly opened, uncommitted Pass 2
 * slots so the coach only handles exceptions instead of re-entering the same
 * player every play.
 *
 * Rules (deliberate, do not loosen):
 *  - Pins never commit anything and never write to plays. Seeding fills empty
 *    candidate fields only; committed personnel is never overwritten.
 *  - Replacing the player at a pinned position removes the pin. The coach must
 *    re-pin to restore cascading.
 *  - Pins are per-game working state, stored in localStorage (no schema change).
 */

import { PERSONNEL_POSITIONS } from "./personnel";

export type PersonnelPins = Record<string, number>;

const KEY_PREFIX = "hudl.pass2Pins.";

const POS_SET = new Set<string>(PERSONNEL_POSITIONS);

function keyFor(gameId: string): string {
  return `${KEY_PREFIX}${gameId}`;
}

/** Sanitize an untrusted pins object: canonical position keys, integer jerseys. */
export function normalizePins(raw: unknown): PersonnelPins {
  const out: PersonnelPins = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!POS_SET.has(k)) continue;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0) out[k] = n;
  }
  return out;
}

export function loadPersonnelPins(gameId: string): PersonnelPins {
  if (!gameId || typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(keyFor(gameId));
    if (!raw) return {};
    return normalizePins(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function savePersonnelPins(gameId: string, pins: PersonnelPins): void {
  if (!gameId || typeof localStorage === "undefined") return;
  try {
    const clean = normalizePins(pins);
    if (Object.keys(clean).length === 0) localStorage.removeItem(keyFor(gameId));
    else localStorage.setItem(keyFor(gameId), JSON.stringify(clean));
  } catch {
    /* storage unavailable — pins degrade to session-only */
  }
}

/**
 * Pure: seed pinned personnel into a candidate. Fills only empty positions.
 * Returns a new object plus the set of fields actually seeded from pins.
 */
export function applyPinnedPersonnel<T extends Record<string, unknown>>(
  candidate: T,
  pins: PersonnelPins,
): { candidate: T; pinnedFields: Set<string> } {
  const next = { ...(candidate as Record<string, unknown>) };
  const pinnedFields = new Set<string>();
  for (const pos of PERSONNEL_POSITIONS) {
    const pinned = pins[pos];
    if (pinned == null) continue;
    const cur = next[pos];
    if (cur === null || cur === undefined || cur === "") {
      next[pos] = pinned;
      pinnedFields.add(pos);
    }
  }
  return { candidate: next as T, pinnedFields };
}

/** Pure: a pinned position whose value was replaced loses its pin. */
export function pinsAfterEdit(
  pins: PersonnelPins,
  fieldName: string,
  value: unknown,
): PersonnelPins {
  if (pins[fieldName] == null) return pins;
  const n = Number(value);
  if (Number.isInteger(n) && n >= 0 && n === pins[fieldName]) return pins;
  const next = { ...pins };
  delete next[fieldName];
  return next;
}
