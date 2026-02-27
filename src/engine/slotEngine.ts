/**
 * Football Engine — Slot Engine (Phase 3)
 *
 * Deterministic slot creation and Pass 0 seeding logic.
 * No prediction. No inference. No silent cascades.
 */

import type { PlayRecord, ODKBlock, QuarterMapping } from "./types";
import type { ODK } from "./schema";

/**
 * Split any ODK block that spans the halftime boundary (Q3 start).
 * This ensures series computation never carries across halftime within a single block.
 */
export function splitBlocksAtHalftime(
  odkBlocks: ODKBlock[],
  quarterStarts: QuarterMapping
): ODKBlock[] {
  const q3Start = quarterStarts["3"];
  if (q3Start == null || q3Start <= 0) return odkBlocks;

  const result: ODKBlock[] = [];
  for (const block of odkBlocks) {
    if (block.startPlay < q3Start && block.endPlay >= q3Start) {
      // Split into pre-halftime and post-halftime
      result.push({ odk: block.odk, startPlay: block.startPlay, endPlay: q3Start - 1 });
      result.push({ odk: block.odk, startPlay: q3Start, endPlay: block.endPlay });
    } else {
      result.push(block);
    }
  }
  return result;
}

// ── Validation ──

export interface InitValidationError {
  field: string;
  message: string;
}

export function validateInitConfig(
  totalPlays: number,
  quarterStarts: QuarterMapping,
  odkBlocks: ODKBlock[]
): InitValidationError[] {
  const errors: InitValidationError[] = [];

  if (!Number.isInteger(totalPlays) || totalPlays <= 0) {
    errors.push({ field: "totalPlays", message: "Total plays must be a positive integer" });
  }

  // Validate quarter starts exist and are ascending
  const qtrKeys = ["1", "2", "3", "4"];
  const starts: number[] = [];
  for (const q of qtrKeys) {
    const start = quarterStarts[q];
    if (start === undefined || start === null) {
      errors.push({ field: `q${q}Start`, message: `Q${q} start is required` });
      continue;
    }
    if (!Number.isInteger(start) || start < 1) {
      errors.push({ field: `q${q}Start`, message: `Q${q} start must be a positive integer` });
      continue;
    }
    if (totalPlays > 0 && start > totalPlays) {
      errors.push({ field: `q${q}Start`, message: `Q${q} start must be ≤ ${totalPlays}` });
      continue;
    }
    if (starts.length > 0 && start <= starts[starts.length - 1]) {
      errors.push({ field: `q${q}Start`, message: `Q${q} start must be after Q${Number(q) - 1} start` });
    }
    starts.push(start);
  }

  // Validate ODK blocks
  for (let i = 0; i < odkBlocks.length; i++) {
    const block = odkBlocks[i];
    if (!Number.isInteger(block.startPlay) || !Number.isInteger(block.endPlay)) {
      errors.push({ field: "odkBlocks", message: `Block ${i + 1}: start and end must be integers` });
      continue;
    }
    if (block.startPlay > block.endPlay) {
      errors.push({ field: "odkBlocks", message: `Block ${i + 1} (${block.odk}): start must be ≤ end` });
    }
    if (totalPlays > 0 && (block.startPlay < 1 || block.endPlay > totalPlays)) {
      errors.push({ field: "odkBlocks", message: `Block ${i + 1} (${block.odk}): range must be within 1..${totalPlays}` });
    }
  }

  // Check for overlaps
  const sorted = [...odkBlocks].sort((a, b) => a.startPlay - b.startPlay);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startPlay <= sorted[i - 1].endPlay) {
      errors.push({
        field: "odkBlocks",
        message: `Blocks overlap: ${sorted[i - 1].odk}(${sorted[i - 1].startPlay}–${sorted[i - 1].endPlay}) and ${sorted[i].odk}(${sorted[i].startPlay}–${sorted[i].endPlay})`,
      });
    }
  }

  return errors;
}

// ── Seeding Logic ──

export function computeQuarterForPlay(playNum: number, quarterStarts: QuarterMapping): string | null {
  const entries = Object.entries(quarterStarts)
    .map(([qtr, start]) => ({ qtr, start }))
    .sort((a, b) => b.start - a.start);

  for (const { qtr, start } of entries) {
    if (playNum >= start) return qtr;
  }
  return null;
}

export function computeODKForPlay(playNum: number, odkBlocks: ODKBlock[]): ODK | null {
  for (const block of odkBlocks) {
    if (playNum >= block.startPlay && playNum <= block.endPlay) {
      return block.odk as ODK;
    }
  }
  return null;
}

/**
 * Compute series number for a play.
 * Series increments when:
 *   - Transitioning from D/K → O
 *   - Entering a new O block (even after another O block, e.g. halftime split)
 * Series carries within a continuous O block.
 * Returns null for non-O plays.
 */
export function computeSeriesForPlay(playNum: number, odkBlocks: ODKBlock[]): number | null {
  const currentODK = computeODKForPlay(playNum, odkBlocks);
  if (currentODK !== "O") return null;

  // Build a map of playNum → which block index it belongs to
  const getBlockIndex = (p: number): number => {
    for (let i = 0; i < odkBlocks.length; i++) {
      if (p >= odkBlocks[i].startPlay && p <= odkBlocks[i].endPlay) return i;
    }
    return -1;
  };

  let series = 0;
  let prevBlockIdx = -1;
  let prevODK: string | null = null;

  for (let p = 1; p <= playNum; p++) {
    const odk = computeODKForPlay(p, odkBlocks);
    if (odk === "O") {
      const blockIdx = getBlockIndex(p);
      if (prevODK !== "O" || blockIdx !== prevBlockIdx) {
        series++;
      }
      prevBlockIdx = blockIdx;
    }
    if (odk !== null) prevODK = odk;
  }

  return series > 0 ? series : null;
}

// ── Slot Creation ──

export function createSlots(
  gameId: string,
  totalPlays: number,
  quarterStarts: QuarterMapping,
  odkBlocks: ODKBlock[]
): { slots: PlayRecord[]; seededFieldsPerSlot: Map<number, string[]> } {
  // Split blocks at halftime to prevent series carrying across Q2→Q3
  const normalizedBlocks = splitBlocksAtHalftime(odkBlocks, quarterStarts);
  const slots: PlayRecord[] = [];
  const seededFieldsPerSlot = new Map<number, string[]>();

  for (let i = 1; i <= totalPlays; i++) {
    const qtr = computeQuarterForPlay(i, quarterStarts);
    const odk = computeODKForPlay(i, normalizedBlocks);
    const series = computeSeriesForPlay(i, normalizedBlocks);

    const seeded: string[] = ["playNum"];
    if (qtr !== null) seeded.push("qtr");
    if (odk !== null) seeded.push("odk");
    if (series !== null) seeded.push("series");

    slots.push({
      gameId,
      playNum: i,
      qtr,
      odk,
      series,
      yardLn: null,
      dn: null,
      dist: null,
      hash: null,
      offForm: null,
      offPlay: null,
      motion: null,
      result: null,
      gainLoss: null,
      twoMin: null,
      rusher: null,
      passer: null,
      receiver: null,
      penalty: null,
      penYards: null,
      eff: null,
      offStrength: null,
      personnel: null,
      playType: null,
      playDir: null,
      motionDir: null,
      patTry: null,
      posLT: null,
      posLG: null,
      posC: null,
      posRG: null,
      posRT: null,
      posX: null,
      posY: null,
      pos1: null,
      pos2: null,
      pos3: null,
      pos4: null,
      returner: null,
    });

    seededFieldsPerSlot.set(i, seeded);
  }

  return { slots, seededFieldsPerSlot };
}

/**
 * Recalculate seeded fields for all slots given updated init config.
 * Returns the proposed new values without applying them.
 */
export function recalculateSlots(
  gameId: string,
  totalPlays: number,
  quarterStarts: QuarterMapping,
  odkBlocks: ODKBlock[],
  existingSlots: PlayRecord[]
): { playNum: number; field: string; oldValue: unknown; newValue: unknown }[] {
  const changes: { playNum: number; field: string; oldValue: unknown; newValue: unknown }[] = [];

  for (const slot of existingSlots) {
    const newQtr = computeQuarterForPlay(slot.playNum, quarterStarts);
    const newODK = computeODKForPlay(slot.playNum, odkBlocks);
    const newSeries = computeSeriesForPlay(slot.playNum, odkBlocks);

    if (slot.qtr !== newQtr) {
      changes.push({ playNum: slot.playNum, field: "qtr", oldValue: slot.qtr, newValue: newQtr });
    }
    if (slot.odk !== newODK) {
      changes.push({ playNum: slot.playNum, field: "odk", oldValue: slot.odk, newValue: newODK });
    }
    if (slot.series !== newSeries) {
      changes.push({ playNum: slot.playNum, field: "series", oldValue: slot.series, newValue: newSeries });
    }
  }

  return changes;
}
