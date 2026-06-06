import { describe, it, expect } from "vitest";
import {
  validateSessionArchiveImport,
  normalizeSessionArchiveImport,
  buildRestoredOpponentLabel,
} from "@/engine/sessionArchiveImport";
import { buildSessionArchive } from "@/engine/sessionArchiveExport";
import { toHudlCsv } from "@/engine/hudlExport";
import type { PlayRecord, CoachNote } from "@/engine/types";

function makePlay(overrides: Partial<PlayRecord> & { playNum: number }): PlayRecord {
  const base: PlayRecord = {
    gameId: "src-game", playNum: 1,
    qtr: null, odk: null, series: null, yardLn: null, dn: null, dist: null,
    hash: null, offForm: null, offPlay: null, motion: null, result: null,
    gainLoss: null, twoMin: null, rusher: null, passer: null, receiver: null,
    penalty: null, penYards: null, eff: null, offStrength: null, personnel: null,
    playType: null, playDir: null, motionDir: null, patTry: null,
    posLT: null, posLG: null, posC: null, posRG: null, posRT: null,
    posX: null, posY: null, pos1: null, pos2: null, pos3: null, pos4: null,
    returner: null,
    gradeLT: null, gradeLG: null, gradeC: null, gradeRG: null, gradeRT: null,
    gradeX: null, gradeY: null, grade1: null, grade2: null, grade3: null, grade4: null,
  };
  return { ...base, ...overrides };
}

function makeNote(overrides: Partial<CoachNote> & { id: string }): CoachNote {
  return {
    id: "n1", gameId: "src-game", playNum: 1, text: "note",
    createdAt: "2025-01-01T00:00:00Z", updatedAt: null, deletedAt: null,
    ...overrides,
  };
}

const baseExportParams = (plays: PlayRecord[], notes: CoachNote[] = []) => ({
  gameMeta: { gameId: "src-game", opponent: "Rival", date: "2025-09-01" },
  plays, notes,
  lookupsSnapshot: { offForm: null, offPlay: null, motion: null, roster: null },
  seasonRevision: 4,
  exportedAtISO: "2025-09-01T12:00:00Z",
});

describe("sessionArchiveImport — validation", () => {
  it("rejects non-object payload", () => {
    expect(validateSessionArchiveImport(null).valid).toBe(false);
    expect(validateSessionArchiveImport("nope").valid).toBe(false);
  });

  it("rejects missing meta/game/plays/notes/lookups", () => {
    const res = validateSessionArchiveImport({});
    expect(res.valid).toBe(false);
    const paths = res.errors.map((e) => e.path);
    expect(paths).toContain("meta");
    expect(paths).toContain("game");
    expect(paths).toContain("plays");
    expect(paths).toContain("notes");
    expect(paths).toContain("lookups");
  });

  it("rejects duplicate playNums", () => {
    const archive = buildSessionArchive(
      baseExportParams([makePlay({ playNum: 1 }), makePlay({ playNum: 1 })])
    );
    const res = validateSessionArchiveImport(archive);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });

  it("rejects non-positive playNum", () => {
    const archive: any = buildSessionArchive(baseExportParams([makePlay({ playNum: 1 })]));
    archive.plays[0].playNum = 0;
    const res = validateSessionArchiveImport(archive);
    expect(res.valid).toBe(false);
  });

  it("accepts a freshly-built archive (round-trip valid)", () => {
    const archive = buildSessionArchive(
      baseExportParams(
        [makePlay({ playNum: 2, qtr: "1", odk: "O", gainLoss: 4 }), makePlay({ playNum: 1 })],
        [makeNote({ id: "n1", playNum: 1, text: "good rep" })]
      )
    );
    const res = validateSessionArchiveImport(archive);
    expect(res.valid).toBe(true);
  });
});

describe("sessionArchiveImport — normalize round-trip", () => {
  it("normalizes plays sorted by playNum and preserves committed fields", () => {
    const plays = [
      makePlay({ playNum: 3, qtr: "2", odk: "O", gainLoss: 7, gradeLT: 1 }),
      makePlay({ playNum: 1, qtr: "1", odk: "O", gainLoss: 0 }),
      makePlay({ playNum: 2, qtr: "1", odk: "D", gainLoss: -2 }),
    ];
    const archive = buildSessionArchive(baseExportParams(plays));
    expect(validateSessionArchiveImport(archive).valid).toBe(true);

    const norm = normalizeSessionArchiveImport(archive);
    expect(norm.plays.map((p) => p.playNum)).toEqual([1, 2, 3]);
    const p3 = norm.plays.find((p) => p.playNum === 3)!;
    expect(p3.gainLoss).toBe(7);
    expect(p3.gradeLT).toBe(1);
    expect(p3.odk).toBe("O");
    expect(norm.opponent).toBe("Rival");
    expect(norm.sourceGameId).toBe("src-game");
  });

  it("deep-clones — mutating normalized result does not affect source payload", () => {
    const archive = buildSessionArchive(baseExportParams([makePlay({ playNum: 1, gainLoss: 5 })]));
    const snapshot = JSON.parse(JSON.stringify(archive));
    const norm = normalizeSessionArchiveImport(archive);
    norm.plays[0].gainLoss = 999;
    expect(archive.plays[0].gainLoss).toBe(snapshot.plays[0].gainLoss);
  });

  it("Hudl CSV of normalized plays contains committed rows only (no scaffold/proposal data)", () => {
    // Source export only ever includes whatever is in the `plays` store
    // (committed). The archive carries those rows verbatim; transient
    // candidate/proposal state never enters this pipeline.
    const plays = [
      makePlay({ playNum: 1, qtr: "1", odk: "O", offPlay: "Power", gainLoss: 6 }),
      makePlay({ playNum: 2, qtr: "1", odk: "O", offPlay: "Sweep", gainLoss: 3 }),
    ];
    const archive = buildSessionArchive(baseExportParams(plays));
    const norm = normalizeSessionArchiveImport(archive);
    const csv = toHudlCsv(norm.plays);
    const lines = csv.split("\n");
    expect(lines.length).toBe(3); // header + 2 rows
    expect(lines[1].split(",")[0]).toBe("1");
    expect(lines[2].split(",")[0]).toBe("2");
  });
});

describe("sessionArchiveImport — restored label safety", () => {
  it("uses base + (Restored) when no collision", () => {
    expect(buildRestoredOpponentLabel("Rival", [])).toBe("Rival (Restored)");
    expect(buildRestoredOpponentLabel("Rival", ["Other Team"])).toBe("Rival (Restored)");
  });

  it("appends numeric suffix on collision (case-insensitive)", () => {
    expect(
      buildRestoredOpponentLabel("Rival", ["Rival (Restored)"])
    ).toBe("Rival (Restored 2)");
    expect(
      buildRestoredOpponentLabel("Rival", ["RIVAL (restored)", "rival (restored 2)"])
    ).toBe("Rival (Restored 3)");
  });

  it("falls back to 'Unknown' when source opponent is null/empty", () => {
    expect(buildRestoredOpponentLabel(null, [])).toBe("Unknown (Restored)");
    expect(buildRestoredOpponentLabel("   ", [])).toBe("Unknown (Restored)");
  });

  it("never returns a label that matches any existing opponent", () => {
    const existing = ["Rival", "Rival (Restored)", "Rival (Restored 2)"];
    const label = buildRestoredOpponentLabel("Rival", existing);
    expect(existing.map((s) => s.toLowerCase())).not.toContain(label.toLowerCase());
  });
});
