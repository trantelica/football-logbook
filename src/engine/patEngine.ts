/**
 * Football Engine — PAT (Point After Touchdown) Engine
 *
 * Handles PAT context detection, playType override, and result constraints.
 * Pure functions, no side effects.
 */

import type { PlayRecord, PatMode } from "./types";

/** PAT-allowed results for youth mode */
export const PAT_RESULTS = ["Good", "No Good", "Penalty"] as const;

/** Check if a play result contains "TD" */
export function isTDResult(result: string | null | undefined): boolean {
  return result != null && result.includes("TD");
}

/** Check if a play result is "Safety" */
export function isSafetyResult(result: string | null | undefined): boolean {
  return result != null && result === "Safety";
}

/**
 * Determine if a slot should enter PAT context.
 * A slot is in PAT context if:
 * - patMode != "none"
 * - The previous committed play's result contains "TD"
 * OR
 * - The slot already has patTry set (penalty re-try)
 */
export function shouldEnterPATContext(
  prevPlay: PlayRecord | null,
  currentSlot: PlayRecord | null,
  patMode: PatMode | undefined
): boolean {
  if (!patMode || patMode === "none") return false;
  
  // Already in PAT context (penalty re-try)
  if (currentSlot?.patTry) return true;
  
  // Previous play was TD
  if (prevPlay && isTDResult(prevPlay.result)) return true;
  
  return false;
}

/**
 * Get the patTry value to carry forward.
 * - If previous play was TD → null (needs PAT try dialog)
 * - If current slot already has patTry → keep it (penalty re-try)
 */
export function getCarriedPatTry(
  prevPlay: PlayRecord | null,
  currentSlot: PlayRecord | null
): string | null {
  // Penalty re-try: previous PAT had "Penalty" result, keep patTry
  if (prevPlay?.patTry && prevPlay.result === "Penalty") {
    return prevPlay.patTry;
  }
  // Current slot already has patTry (e.g., from previous edit)
  if (currentSlot?.patTry) return currentSlot.patTry;
  return null;
}

/**
 * Determine playType override for PAT try.
 */
export function patTryToPlayType(patTry: string): string {
  return patTry === "1" ? "Extra Pt." : "2 Pt.";
}

/**
 * Validate PAT result: must be one of the allowed PAT results.
 */
export function validatePATResult(result: string | null | undefined): string | null {
  if (result == null || result === "") return null;
  if (!(PAT_RESULTS as readonly string[]).includes(result)) {
    return `PAT result must be one of: ${PAT_RESULTS.join(", ")}`;
  }
  return null;
}

/**
 * Check if the next slot after a safety should be ODK=K.
 */
export function shouldSetKickAfterSafety(
  prevPlay: PlayRecord | null,
  patMode: PatMode | undefined
): boolean {
  if (!patMode || patMode === "none") return false;
  return prevPlay != null && isSafetyResult(prevPlay.result);
}
