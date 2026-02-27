/**
 * Football Engine — Personnel Logic (Phase 6)
 *
 * Pass-aware completion checks, personnel validation, carry-forward seeding.
 */

import type { PlayRecord, SlotMeta, CandidateData } from "./types";

/** The 11 blocking grade field names */
export const GRADE_FIELDS = [
  "gradeLT", "gradeLG", "gradeC", "gradeRG", "gradeRT",
  "gradeX", "gradeY", "grade1", "grade2", "grade3", "grade4",
] as const;

/** Grade field display labels (position name only) */
export const GRADE_LABELS: Record<string, string> = {
  gradeLT: "LT", gradeLG: "LG", gradeC: "C", gradeRG: "RG", gradeRT: "RT",
  gradeX: "X", gradeY: "Y", grade1: "1", grade2: "2", grade3: "3", grade4: "4",
};

/** Returns true if any of the 11 grade fields is non-null */
export function anyGradePresent(row: PlayRecord): boolean {
  const r = row as unknown as Record<string, unknown>;
  return GRADE_FIELDS.some((f) => r[f] != null);
}

/** The 11 offensive personnel position field names */
export const PERSONNEL_POSITIONS = [
  "posLT", "posLG", "posC", "posRG", "posRT",
  "posX", "posY", "pos1", "pos2", "pos3", "pos4",
] as const;

/** Position display labels */
export const PERSONNEL_LABELS: Record<string, string> = {
  posLT: "LT", posLG: "LG", posC: "C", posRG: "RG", posRT: "RT",
  posX: "X", posY: "Y", pos1: "1", pos2: "2", pos3: "3", pos4: "4",
};

/** Actor fields that must match a personnel jersey */
export const ACTOR_FIELDS = ["rusher", "passer", "receiver", "returner"] as const;

/**
 * Check if a play is Pass 1 complete.
 * Pass 1 requires certain fields committed depending on ODK.
 */
export function isPass1Complete(play: PlayRecord, meta: SlotMeta | undefined): boolean {
  if (!meta) return false;
  const committed = new Set(meta.committedFields);
  const p = play as unknown as Record<string, unknown>;

  // Always required
  if (!committed.has("qtr") || p.qtr == null) return false;
  if (!committed.has("odk") || p.odk == null) return false;
  if (!committed.has("result") || p.result == null) return false;
  if (!committed.has("gainLoss")) return false; // gainLoss can be 0

  const isOffense = p.odk === "O";
  if (isOffense) {
    if (!committed.has("series") || p.series == null) return false;
    if (!committed.has("yardLn") || p.yardLn == null) return false;
    if (!committed.has("dn") || p.dn == null) return false;
    if (!committed.has("dist") || p.dist == null) return false;
    if (!committed.has("offPlay") || p.offPlay == null) return false;
    // Motion: if committed and has value, fine. If not committed, also fine (optional).
  }

  return true;
}

/**
 * Check if a play is Pass 2 complete.
 * All 11 offensive personnel positions must be committed and non-null.
 * Only applies to ODK=O plays.
 */
export function isPass2Complete(play: PlayRecord, meta: SlotMeta | undefined): boolean {
  if (!meta) return false;
  const p = play as unknown as Record<string, unknown>;
  if (p.odk !== "O") return true; // Non-offensive plays are trivially Pass 2 complete

  const committed = new Set(meta.committedFields);
  for (const pos of PERSONNEL_POSITIONS) {
    if (!committed.has(pos) || p[pos] == null) return false;
  }
  return true;
}

/**
 * Validate personnel assignments at Review Proposal time for Pass 2.
 * Returns error map (empty = valid).
 */
export function validatePersonnel(
  candidate: CandidateData,
  rosterNumbers?: Set<number>
): Record<string, string> {
  const errors: Record<string, string> = {};
  const c = candidate as unknown as Record<string, unknown>;

  // Only validate for offensive plays
  if (c.odk !== "O") return errors;

  const jerseys: number[] = [];
  const seen = new Set<number>();

  // 1. Check all 11 positions filled
  for (const pos of PERSONNEL_POSITIONS) {
    const val = c[pos];
    if (val == null || val === "" || val === undefined) {
      errors[pos] = `${PERSONNEL_LABELS[pos]} is required`;
      continue;
    }
    const num = Number(val);
    if (!Number.isInteger(num) || num < 0) {
      errors[pos] = `${PERSONNEL_LABELS[pos]} must be a valid jersey number`;
      continue;
    }

    // Roster check
    if (rosterNumbers && !rosterNumbers.has(num)) {
      errors[pos] = `Jersey #${num} not in roster`;
      continue;
    }

    // Duplicate check
    if (seen.has(num)) {
      errors[pos] = `Jersey #${num} is already assigned to another position`;
    }
    seen.add(num);
    jerseys.push(num);
  }

  // 3. Actor membership: each set actor must be one of the 11 personnel jerseys
  if (jerseys.length === 11 && Object.keys(errors).length === 0) {
    const personnelSet = new Set(jerseys);
    for (const actor of ACTOR_FIELDS) {
      const actorVal = c[actor];
      if (actorVal == null || actorVal === "" || actorVal === undefined) continue;
      const actorNum = Number(actorVal);
      if (!Number.isInteger(actorNum) || actorNum < 0) continue;
      if (!personnelSet.has(actorNum)) {
        errors[actor] = `${actor.charAt(0).toUpperCase() + actor.slice(1)} (#${actorNum}) must be one of the 11 personnel — use Actor Integrity fix below`;
      }
    }
  }

  return errors;
}

/**
 * Find the most recent prior offensive play with Pass 2 complete,
 * and return its personnel values for carry-forward seeding.
 */
export function getCarryForwardPersonnel(
  plays: PlayRecord[],
  slotMetaMap: Map<number, SlotMeta>,
  currentPlayNum: number
): Record<string, number> | null {
  // Sort descending by playNum, filter to plays before current
  const priorPlays = plays
    .filter((p) => p.playNum < currentPlayNum && p.odk === "O")
    .sort((a, b) => b.playNum - a.playNum);

  for (const play of priorPlays) {
    const meta = slotMetaMap.get(play.playNum);
    if (isPass2Complete(play, meta)) {
      const result: Record<string, number> = {};
      const p = play as unknown as Record<string, unknown>;
      for (const pos of PERSONNEL_POSITIONS) {
        if (p[pos] != null) result[pos] = Number(p[pos]);
      }
      return result;
    }
  }
  return null;
}

/**
 * Compute pass completion flags for a SlotMeta update.
 */
export function computePassCompletion(
  play: PlayRecord,
  committedFields: string[]
): { pass1Complete: boolean; pass2Complete: boolean } {
  const meta: SlotMeta = {
    gameId: play.gameId,
    playNum: play.playNum,
    committedFields,
  };
  return {
    pass1Complete: isPass1Complete(play, meta),
    pass2Complete: isPass2Complete(play, meta),
  };
}
