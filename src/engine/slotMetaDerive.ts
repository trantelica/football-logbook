/**
 * Football Engine — commit metadata recovered from stored plays.
 *
 * Pure functions only. No DB imports. No side effects.
 *
 * `slot_meta` records which fields of a play are committed. Overwrite review,
 * pass progress and carry-forward all read it. Season packages and session
 * archives carry plays but not slot_meta, so a restored game used to arrive
 * with none: the first edit to any restored play overwrote committed data with
 * no review, and every play read as untouched.
 *
 * The plays store only ever holds committed rows (drafts live in React state),
 * so a non-empty stored field is committed by definition. That makes the
 * metadata recoverable from the play itself.
 */

import type { PlayRecord, SlotMeta } from "./types";
import { playSchema } from "./schema";
import { computePassCompletion } from "./personnel";

const SCHEMA_FIELD_NAMES: ReadonlyArray<string> = playSchema.map((f) => f.name);

/** Schema fields that hold a committed value on this stored play. */
export function deriveCommittedFields(play: PlayRecord): string[] {
  const rec = play as unknown as Record<string, unknown>;
  const fields = SCHEMA_FIELD_NAMES.filter((name) => {
    const v = rec[name];
    return v !== null && v !== undefined && v !== "";
  });
  if (!fields.includes("playNum")) fields.unshift("playNum");
  return fields;
}

/** Full slot metadata for a stored play that has none. */
export function deriveSlotMeta(play: PlayRecord): SlotMeta {
  const committedFields = deriveCommittedFields(play);
  const flags = computePassCompletion(play, committedFields);
  return {
    gameId: play.gameId,
    playNum: play.playNum,
    committedFields,
    pass1Complete: flags.pass1Complete,
    pass2Complete: flags.pass2Complete,
  };
}

/**
 * Index stored metadata by play number, deriving an entry for any play that
 * has none. Stored metadata always wins. This is what keeps games restored
 * before this module existed (which have no slot_meta rows) protected too.
 */
export function fillMissingSlotMeta(
  plays: ReadonlyArray<PlayRecord>,
  metas: ReadonlyArray<SlotMeta>,
): Map<number, SlotMeta> {
  const map = new Map<number, SlotMeta>();
  for (const m of metas) map.set(m.playNum, m);
  for (const p of plays) {
    if (!map.has(p.playNum)) map.set(p.playNum, deriveSlotMeta(p));
  }
  return map;
}

/**
 * Field size implied by the plays, for archives written before the archive
 * recorded it. A yard line beyond the 40 cannot exist on an 80-yard field, so
 * it proves a 100-yard field. Anything else proves nothing and returns
 * undefined, leaving the app default in place.
 */
export function inferFieldSizeFromPlays(plays: ReadonlyArray<PlayRecord>): 100 | undefined {
  for (const p of plays) {
    const y = Number((p as unknown as Record<string, unknown>).yardLn);
    if (Number.isFinite(y) && Math.abs(y) > 40 && Math.abs(y) <= 50) return 100;
  }
  return undefined;
}
