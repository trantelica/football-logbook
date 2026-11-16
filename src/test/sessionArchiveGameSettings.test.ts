/**
 * A restored game must keep the settings that change how it behaves. Field
 * size drives yard-line prediction and validation, and totalPlays is what
 * makes a game slot-based. Archives used to record neither, so a 100-yard
 * game came back as the 80-yard default in the legacy free-form mode.
 */
import { describe, it, expect } from "vitest";
import { buildSessionArchive } from "@/engine/sessionArchiveExport";
import { normalizeSessionArchiveImport, validateSessionArchiveImport } from "@/engine/sessionArchiveImport";

const EMPTY_LOOKUPS = { offForm: null, offPlay: null, motion: null, roster: null };

function archive(gameMeta: Parameters<typeof buildSessionArchive>[0]["gameMeta"]) {
  return JSON.parse(JSON.stringify(buildSessionArchive({
    gameMeta, plays: [], notes: [], lookupsSnapshot: EMPTY_LOOKUPS, seasonRevision: 0,
  })));
}

describe("session archive game settings", () => {
  it("round-trips field size, PAT mode and total plays", () => {
    const a = archive({ gameId: "g1", opponent: "Fremont", date: "2026-10-17", fieldSize: 100, patMode: "hs_kick", totalPlays: 96 });
    expect(validateSessionArchiveImport(a).valid).toBe(true);
    expect(normalizeSessionArchiveImport(a)).toMatchObject({ fieldSize: 100, patMode: "hs_kick", totalPlays: 96 });
  });

  it("still reads an archive written before the settings were recorded", () => {
    const a = archive({ gameId: "g1", opponent: "Murray", date: "2026-09-26" });
    expect(a.game).toEqual({ gameId: "g1", opponent: "Murray", date: "2026-09-26", score: null });
    const norm = normalizeSessionArchiveImport(a);
    expect(norm.fieldSize).toBeUndefined();
    expect(norm.patMode).toBeUndefined();
    expect(norm.totalPlays).toBeUndefined();
  });

  it("ignores malformed settings rather than importing them", () => {
    const a = archive({ gameId: "g1" });
    a.game.fieldSize = 120;
    a.game.patMode = "college";
    a.game.totalPlays = -3;
    const norm = normalizeSessionArchiveImport(a);
    expect(norm.fieldSize).toBeUndefined();
    expect(norm.patMode).toBeUndefined();
    expect(norm.totalPlays).toBeUndefined();
  });
});
