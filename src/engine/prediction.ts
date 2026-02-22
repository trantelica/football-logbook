/**
 * Football Engine — Phase 5B Deterministic Prediction Engine
 *
 * Pure functions for yardline index math and forward-progress prediction.
 * No side effects, no state, no downstream mutation.
 *
 * Phase 5B: Partial prediction support.
 * - Yard Line can predict independently if its prerequisites are met.
 * - DN/DIST require additional prerequisites (dn, dist on prevPlay).
 * - No clamping: field overflow suspends yardLn prediction.
 */

import type { PlayRecord } from "./types";

// ── Field Size Types ──

export type FieldSize = 80 | 100;

// ── Yardline Index Model ──

/** Convert signed yardLn address to internal field index */
export function yardLnToIdx(yardLn: number, fieldSize: FieldSize): number {
  if (yardLn < 0) return -yardLn;
  return fieldSize - yardLn;
}

/** Convert internal field index to signed yardLn address */
export function idxToYardLn(idx: number, fieldSize: FieldSize): number {
  const halfField = fieldSize / 2;
  if (idx <= halfField - 1) return -idx;
  return fieldSize - idx;
}

/** Clamp index to playable range [1, fieldSize-1] */
export function clampIdx(
  idx: number,
  fieldSize: FieldSize
): { idx: number; clamped: boolean } {
  const maxIdx = fieldSize - 1;
  if (idx < 1) return { idx: 1, clamped: true };
  if (idx > maxIdx) return { idx: maxIdx, clamped: true };
  return { idx, clamped: false };
}

// ── Prediction Result ──

export interface PredictionResult {
  yardLn: number | null;
  dn: number | null;
  dist: number | null;
  explanations: string[];
  eligible: boolean;
}

const INELIGIBLE = (explanations: string[]): PredictionResult => ({
  yardLn: null,
  dn: null,
  dist: null,
  explanations,
  eligible: false,
});

// ── Prediction Algorithm (Phase 5B: Partial Prediction) ──

/**
 * Compute deterministic prediction for the next slot based on the
 * immediately preceding committed play.
 *
 * Phase 5B: Split into yardLn prerequisites and dn/dist prerequisites.
 * yardLn can predict even if dn/dist are missing on prevPlay.
 *
 * @param prevPlay - The committed play at playNum - 1 (or null)
 * @param currentSlotOdk - The ODK value of the slot being edited
 * @param fieldSize - 80 or 100
 */
export function computePrediction(
  prevPlay: PlayRecord | null,
  currentSlotOdk: string | null,
  fieldSize: FieldSize
): PredictionResult {
  // ── Yard Line prerequisites (gates 1-7) ──

  // Gate 1: previous play must exist
  if (!prevPlay) {
    return INELIGIBLE(["Prediction suspended: previous slot not available"]);
  }

  // Gate 2: previous play ODK must be "O"
  if (prevPlay.odk !== "O") {
    return INELIGIBLE(["Prediction suspended: previous play is not offensive"]);
  }

  // Gate 3: current slot ODK must be "O"
  if (currentSlotOdk !== "O") {
    return INELIGIBLE(["Prediction suspended: current play is not offensive"]);
  }

  // Gate 4: penalty must be null
  if (prevPlay.penalty !== null && prevPlay.penalty !== undefined) {
    return INELIGIBLE(["Prediction suspended: penalty present on previous play"]);
  }

  // Gate 5: result must be non-null
  if (prevPlay.result === null || prevPlay.result === undefined) {
    return INELIGIBLE(["Prediction suspended: result missing on previous play"]);
  }

  // Gate 6: gainLoss must be non-null
  if (prevPlay.gainLoss === null || prevPlay.gainLoss === undefined) {
    return INELIGIBLE(["Prediction suspended: gain/loss missing on previous play"]);
  }

  // Gate 7: yardLn must be non-null
  if (prevPlay.yardLn === null || prevPlay.yardLn === undefined) {
    return INELIGIBLE(["Prediction suspended: yard line missing on previous play"]);
  }

  // ── Yard Line computation ──
  const explanations: string[] = [];
  const gainLoss = Number(prevPlay.gainLoss);
  const maxIdx = fieldSize - 1;

  const currentIdx = yardLnToIdx(Number(prevPlay.yardLn), fieldSize);
  const rawNewIdx = currentIdx + gainLoss;

  // If forward progress exceeds the playable field, suspend prediction entirely
  if (rawNewIdx < 1 || rawNewIdx > maxIdx) {
    return INELIGIBLE(["Forward progress exceeded playable field; scoring/safety logic deferred. Prediction suspended."]);
  }

  const predictedYardLn = idxToYardLn(rawNewIdx, fieldSize);
  const distToGoal = maxIdx - rawNewIdx + 1;

  // ── DN/DIST prerequisites check ──
  const hasDn = prevPlay.dn !== null && prevPlay.dn !== undefined;
  const hasDist = prevPlay.dist !== null && prevPlay.dist !== undefined;

  if (!hasDn || !hasDist) {
    // Partial prediction: yardLn only
    if (!hasDn) {
      explanations.push("Prediction limited: down missing on previous play");
    }
    if (!hasDist) {
      explanations.push("Prediction limited: distance missing on previous play");
    }
    return {
      yardLn: predictedYardLn,
      dn: null,
      dist: null,
      explanations,
      eligible: true,
    };
  }

  // ── Full DN/DIST prediction ──
  const currentDn = Number(prevPlay.dn);
  const currentDist = Number(prevPlay.dist);

  let predictedDn: number;
  let predictedDist: number;

  if (gainLoss >= currentDist) {
    // First down achieved
    predictedDn = 1;
    predictedDist = Math.min(10, distToGoal > 0 ? distToGoal : 10);
  } else if (currentDn >= 4) {
    // 4th down, no first down → turnover assumed
    predictedDn = 1;
    predictedDist = Math.min(10, distToGoal > 0 ? distToGoal : 10);
    explanations.push("4th down turnover assumed; possession logic deferred");
  } else {
    // Normal progression
    predictedDn = currentDn + 1;
    predictedDist = currentDist - gainLoss;
  }

  return {
    yardLn: predictedYardLn,
    dn: predictedDn,
    dist: predictedDist,
    explanations,
    eligible: true,
  };
}
