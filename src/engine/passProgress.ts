/**
 * Football Engine — per-pass progress.
 *
 * Pure functions only. No DB imports. No side effects.
 *
 * Progress used to be gated on Pass 1: a play showed nothing until its
 * situation and result were logged, and "logged" meant Pass 1 complete. But
 * the passes are independent. A coach whose down, distance and result already
 * live in Hudl may use this app only for personnel and blocking grades, and
 * every play of a fully worked game then read as untouched: empty pips, a rail
 * count of zero and "0 of N logged".
 *
 * Each pass now reports for itself.
 */

import type { PlayRecord, SlotMeta } from "./types";
import { playSchema } from "./schema";
import {
  isPass1Complete, isPass2Complete, anyGradePresent, PERSONNEL_POSITIONS,
} from "./personnel";

/** Fields entered in Pass 4 (defense). */
export const DEFENSE_FIELD_NAMES: ReadonlyArray<string> = playSchema
  .filter((f) => f.defaultPassEntry === 4)
  .map((f) => f.name);

function hasAny(play: PlayRecord, fields: ReadonlyArray<string>): boolean {
  const rec = play as unknown as Record<string, unknown>;
  return fields.some((f) => rec[f] !== null && rec[f] !== undefined && rec[f] !== "");
}

/**
 * One flag per pip, in pass order: play details, personnel, blocking.
 *
 * Non-offensive plays have no personnel or blocking work, so Pass 1 is all
 * there is to do and it fills all three. Showing them as one-of-three forever
 * would read as permanently unfinished.
 */
export function passFlags(
  play: PlayRecord,
  meta: SlotMeta | undefined,
): [boolean, boolean, boolean] {
  const pass1 = isPass1Complete(play, meta);
  if (play.odk !== "O") return [pass1, pass1, pass1];
  return [pass1, isPass2Complete(play, meta), anyGradePresent(play)];
}

/** Every pass that applies to this play is done. */
export function isFullyLogged(play: PlayRecord, meta: SlotMeta | undefined): boolean {
  return passFlags(play, meta).every(Boolean);
}

/**
 * Whether the coach has committed any real work on this play, in any pass.
 *
 * Not `committedFields.length > 0`: scaffolding pre-commits qtr/odk/series, so
 * that is true for every slot of a brand-new game. Personnel, grades and
 * defensive fields only reach the plays store through a commit (pins and
 * carry-forward seed the proposal, never the store), so a stored value there
 * is the coach's work.
 */
export function hasCoachWork(play: PlayRecord, meta: SlotMeta | undefined): boolean {
  return (
    isPass1Complete(play, meta) ||
    hasAny(play, PERSONNEL_POSITIONS) ||
    anyGradePresent(play) ||
    hasAny(play, DEFENSE_FIELD_NAMES)
  );
}

/** Whether the pass the coach is working in has committed work on this play. */
export function isPassWorkCommitted(
  play: PlayRecord,
  meta: SlotMeta | undefined,
  activePass: number,
): boolean {
  if (activePass === 2) return play.odk === "O" && isPass2Complete(play, meta);
  if (activePass === 3) return anyGradePresent(play);
  if (activePass === 4) return hasAny(play, DEFENSE_FIELD_NAMES) || isPass1Complete(play, meta);
  return isPass1Complete(play, meta);
}

export interface PassTally {
  done: number;
  total: number;
  /** Plain-language reading of the count, for a tooltip. */
  description: string;
}

/**
 * The count shown above the play rail, for the pass the coach is in.
 *
 * Personnel and blocking are counted over offensive plays only and defense
 * over defensive plays, so the total is the work that pass actually has.
 * Elsewhere it counts plays finished in every pass that applies to them.
 */
export function passTally(
  plays: ReadonlyArray<PlayRecord>,
  metaMap: ReadonlyMap<number, SlotMeta>,
  activePass: number,
): PassTally {
  const count = (list: ReadonlyArray<PlayRecord>, test: (p: PlayRecord, m: SlotMeta | undefined) => boolean) =>
    list.filter((p) => test(p, metaMap.get(p.playNum))).length;

  if (activePass === 2 || activePass === 3) {
    const offense = plays.filter((p) => p.odk === "O");
    const done = activePass === 2
      ? count(offense, isPass2Complete)
      : count(offense, (p) => anyGradePresent(p));
    const what = activePass === 2 ? "Personnel set" : "Blocking graded";
    return { done, total: offense.length, description: `${what} on ${done} of ${offense.length} offensive plays` };
  }
  if (activePass === 4) {
    const defense = plays.filter((p) => p.odk === "D");
    const done = count(defense, isPass1Complete);
    return { done, total: defense.length, description: `${done} of ${defense.length} defensive plays logged` };
  }
  const done = count(plays, isFullyLogged);
  return { done, total: plays.length, description: `${done} of ${plays.length} plays finished in every pass` };
}
