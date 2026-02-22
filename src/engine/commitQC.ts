/**
 * Football Engine — Phase 5C Commit-Gate Quality Checks
 *
 * Pure functions for gainLoss limiting and TD labeling correction.
 * Used during commit normalization. No side effects.
 */

import { yardLnToIdx, type FieldSize } from "./prediction";

/** Result of commit-gate QC checks */
export interface CommitQCResult {
  /** Adjusted gainLoss (may be limited) */
  adjustedGainLoss: number | null;
  /** Coach-facing message if gainLoss was limited */
  gainLossMessage: string | null;
  /** Whether play reaches the goal line after adjustment */
  reachesGoalLine: boolean;
  /** Corrected result if TD suffix needed, else null */
  correctedResult: string | null;
}

/** Map from base result → TD-suffixed result */
const TD_RESULT_MAP: Record<string, string> = {
  "Rush": "Rush, TD",
  "Complete": "Complete, TD",
  "Scramble": "Scramble, TD",
};

/**
 * Run commit-gate QC on a candidate play.
 *
 * 1. Compute distToGoal using yardline index model.
 * 2. If gainLoss > distToGoal, limit to distToGoal.
 * 3. If play reaches goal line and result lacks TD suffix, flag for correction.
 */
export function runCommitQC(
  yardLn: number | null | undefined,
  gainLoss: number | null | undefined,
  result: string | null | undefined,
  fieldSize: FieldSize
): CommitQCResult {
  const noOp: CommitQCResult = {
    adjustedGainLoss: gainLoss != null ? Number(gainLoss) : null,
    gainLossMessage: null,
    reachesGoalLine: false,
    correctedResult: null,
  };

  if (yardLn == null || gainLoss == null) return noOp;

  const yl = Number(yardLn);
  const gl = Number(gainLoss);
  const goalIdx = fieldSize; // goal line index (NOT fieldSize-1)
  const currentIdx = yardLnToIdx(yl, fieldSize);
  const distToGoal = goalIdx - currentIdx;

  // Only limit positive gain toward opponent end zone
  if (gl <= 0 || distToGoal <= 0) return noOp;

  let adjustedGL = gl;
  let message: string | null = null;

  if (gl > distToGoal) {
    adjustedGL = distToGoal;
    message = `Gain limited to ${distToGoal}: play can't advance beyond the goal line.`;
  }

  // Check if play reaches goal line
  const newIdx = currentIdx + adjustedGL;
  const reachesGoalLine = newIdx >= goalIdx;

  // TD labeling correction
  let correctedResult: string | null = null;
  if (reachesGoalLine && result) {
    const resultStr = String(result);
    if (!resultStr.includes("TD")) {
      correctedResult = TD_RESULT_MAP[resultStr] ?? null;
    }
  }

  return {
    adjustedGainLoss: adjustedGL,
    gainLossMessage: message,
    reachesGoalLine,
    correctedResult,
  };
}
