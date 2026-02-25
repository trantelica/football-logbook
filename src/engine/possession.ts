/**
 * Football Engine — Possession Guardrail (Phase 5)
 *
 * Detects when a play result or 4th-down-short condition implies
 * a possession change, and returns guardrail metadata for the
 * prediction engine and UI.
 *
 * No auto-flip. No cascade. No enforcement modeling.
 */

import type { PlayRecord } from "./types";

// ── Possession-Change Result Enums ──

export const POSSESSION_CHANGE_RESULTS = new Set([
  "Interception",
  "Interception, Def TD",
  "Interception, Fumble",
  "Fumble",
  "Fumble, Def TD",
  "Sack, Fumble",
  "Sack, Fumble, Def TD",
  "Def TD",
  "Safety",
  "Sack, Safety",
  "Rush, Safety",
  "Penalty, Safety",
]);

// Results that are already governed by penalty logic — do NOT trigger possession guardrail
const PENALTY_GOVERNED_RESULTS = new Set([
  "Penalty",
  "Penalty, Safety",
  "Offsetting Penalties",
]);

/**
 * Check if the previous play implies possession likely changed.
 *
 * Returns true if:
 * - The result is a possession-change enum, OR
 * - 4th-down-short condition is met
 *
 * Returns false if the result is penalty-governed (already handled by penalty logic).
 */
export function isPossessionChange(prevPlay: PlayRecord | null): boolean {
  if (!prevPlay) return false;

  const resultStr = prevPlay.result != null ? String(prevPlay.result) : null;
  if (!resultStr) return false;

  // Penalty-governed results are NOT possession triggers here
  if (PENALTY_GOVERNED_RESULTS.has(resultStr)) return false;

  // Section 1: Possession-change result enums
  if (POSSESSION_CHANGE_RESULTS.has(resultStr)) return true;

  // Section 2: 4th-down-short
  if (isFourthDownShort(prevPlay)) return true;

  return false;
}

/**
 * 4th-down-short condition:
 * dn === 4, gainLoss < dist, result is not penalty-governed
 */
export function isFourthDownShort(prevPlay: PlayRecord): boolean {
  const dn = prevPlay.dn != null ? Number(prevPlay.dn) : null;
  if (dn !== 4) return false;

  const gainLoss = prevPlay.gainLoss != null ? Number(prevPlay.gainLoss) : null;
  const dist = prevPlay.dist != null ? Number(prevPlay.dist) : null;

  if (gainLoss === null || dist === null) return false;

  const resultStr = prevPlay.result != null ? String(prevPlay.result) : null;
  if (resultStr && PENALTY_GOVERNED_RESULTS.has(resultStr)) return false;

  return gainLoss < dist;
}

/**
 * Determine whether a possession-change confirmation modal is needed.
 *
 * @param prevPlay - The previous committed play
 * @param nextSlotOdk - ODK value of the next slot
 * @param isOdkFilterActive - True if the UI is filtered to a single ODK type
 * @returns Object with `needsModal`, `needsBanner`, and `explanation`
 */
export function possessionGuardrail(
  prevPlay: PlayRecord | null,
  nextSlotOdk: string | null,
  isOdkFilterActive: boolean
): {
  possessionChanged: boolean;
  needsModal: boolean;
  needsBanner: boolean;
  explanation: string;
} {
  const changed = isPossessionChange(prevPlay);

  if (!changed) {
    return { possessionChanged: false, needsModal: false, needsBanner: false, explanation: "" };
  }

  const explanation = "Possession likely changed: next yard line/down/distance not predicted.";

  // If filter is active → banner only, no modal
  if (isOdkFilterActive) {
    return { possessionChanged: true, needsModal: false, needsBanner: true, explanation };
  }

  // If next slot is O → blocking modal needed
  if (nextSlotOdk === "O") {
    return { possessionChanged: true, needsModal: true, needsBanner: false, explanation };
  }

  // Next slot is D or K → no modal, just suspend predictions
  return { possessionChanged: true, needsModal: false, needsBanner: true, explanation };
}
