/**
 * Phase 8.1 — Hudl Export Deterministic Tests
 */

import { describe, it, expect } from "vitest";
import {
  HUDL_HEADERS,
  NOTES_HEADERS,
  toHudlCsv,
  toNotesCsv,
  validateForExport,
  buildExportManifest,
  EXPORT_FORMAT_VERSION,
} from "@/engine/hudlExport";
import { APP_VERSION } from "@/engine/schema";
import type { PlayRecord, CoachNote } from "@/engine/types";

/** Helper: minimal valid play */
function makPlay(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    gameId: "g1",
    playNum: 1,
    qtr: null,
    odk: null,
    series: null,
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
    gradeLT: null,
    gradeLG: null,
    gradeC: null,
    gradeRG: null,
    gradeRT: null,
    gradeX: null,
    gradeY: null,
    grade1: null,
    grade2: null,
    grade3: null,
    grade4: null,
    ...overrides,
  };
}

function makeNote(overrides: Partial<CoachNote> = {}): CoachNote {
  return {
    id: "n1",
    gameId: "g1",
    playNum: 1,
    text: "Test note",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

// ── TEST 1: Header stability ──

describe("toHudlCsv", () => {
  it("outputs exactly HUDL_HEADERS as header row for empty plays", () => {
    const csv = toHudlCsv([]);
    const headerLine = csv.split("\n")[0];
    const expectedHeaders = HUDL_HEADERS.map((h) => h.label).join(",");
    expect(headerLine).toBe(expectedHeaders);
    // Only one line (header, no data rows)
    expect(csv.split("\n")).toHaveLength(1);
  });

  it("header row does not include PAT TRY", () => {
    const csv = toHudlCsv([]);
    const headerLine = csv.split("\n")[0];
    expect(headerLine).not.toContain("PAT TRY");
  });

  it("header row contains position labels 1,2,3,4 (not POS 1..4)", () => {
    const headers = HUDL_HEADERS.map((h) => h.label);
    expect(headers).toContain("1");
    expect(headers).toContain("2");
    expect(headers).toContain("3");
    expect(headers).toContain("4");
    expect(headers).not.toContain("POS 1");
    expect(headers).not.toContain("POS 2");
    expect(headers).not.toContain("POS 3");
    expect(headers).not.toContain("POS 4");
  });

  // ── TEST 2: Sorting ──

  it("sorts rows by playNum ascending", () => {
    const plays = [
      makPlay({ playNum: 5, qtr: "2" }),
      makPlay({ playNum: 1, qtr: "1" }),
      makPlay({ playNum: 3, qtr: "1" }),
    ];
    const csv = toHudlCsv(plays);
    const lines = csv.split("\n").slice(1); // skip header
    expect(lines).toHaveLength(3);
    // First column is playNum
    expect(lines[0].split(",")[0]).toBe("1");
    expect(lines[1].split(",")[0]).toBe("3");
    expect(lines[2].split(",")[0]).toBe("5");
  });

  // ── TEST 3: Blank handling ──

  it("outputs empty cells for null/undefined, never 'null' or 'undefined'", () => {
    const plays = [makPlay({ playNum: 1 })];
    const csv = toHudlCsv(plays);
    expect(csv).not.toContain("null");
    expect(csv).not.toContain("undefined");
    // All fields after playNum should be empty
    const dataLine = csv.split("\n")[1];
    const cells = dataLine.split(",");
    // First cell is playNum = "1", rest should be empty
    expect(cells[0]).toBe("1");
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i]).toBe("");
    }
  });

  // ── TEST 4: No mutation ──

  it("does not mutate input plays array", () => {
    const plays = [
      makPlay({ playNum: 3 }),
      makPlay({ playNum: 1 }),
    ];
    const snapshot = JSON.parse(JSON.stringify(plays));
    toHudlCsv(plays);
    expect(plays).toEqual(snapshot);
  });
});

// ── TEST 5: Preflight validation ──

describe("validateForExport", () => {
  it("returns invalid for missing playNum", () => {
    const plays = [makPlay({ playNum: 0 })];
    const result = validateForExport(plays);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("playNum");
  });

  it("returns invalid for duplicate playNums", () => {
    const plays = [
      makPlay({ playNum: 1 }),
      makPlay({ playNum: 1 }),
    ];
    const result = validateForExport(plays);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });

  it("returns valid for clean plays", () => {
    const plays = [
      makPlay({ playNum: 1, odk: "O", qtr: "1" }),
      makPlay({ playNum: 2, odk: "D", qtr: "2" }),
    ];
    const result = validateForExport(plays);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid enum values", () => {
    const plays = [makPlay({ playNum: 1, odk: "Z" as any })];
    const result = validateForExport(plays);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("odk");
  });

  // ── TEST 6: PAT consistency ──

  it("rejects patTry=1 with wrong playType", () => {
    const plays = [makPlay({ playNum: 1, patTry: "1", playType: "Run" })];
    const result = validateForExport(plays);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "playType")).toBe(true);
  });

  // ── TEST 7: PAT override allowed ──

  it("accepts patTry=1 with playType=Extra Pt.", () => {
    const plays = [makPlay({ playNum: 1, patTry: "1", playType: "Extra Pt." })];
    const result = validateForExport(plays);
    expect(result.valid).toBe(true);
  });

  it("rejects invalid PAT result in PAT context", () => {
    const plays = [
      makPlay({ playNum: 1, patTry: "1", playType: "Extra Pt.", result: "Rush, TD" }),
    ];
    const result = validateForExport(plays);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "result")).toBe(true);
  });

  it("allows null result in PAT context", () => {
    const plays = [
      makPlay({ playNum: 1, patTry: "1", playType: "Extra Pt.", result: null }),
    ];
    const result = validateForExport(plays);
    expect(result.valid).toBe(true);
  });

  // No mutation test for validateForExport
  it("does not mutate input plays", () => {
    const plays = [makPlay({ playNum: 1 }), makPlay({ playNum: 2 })];
    const snapshot = JSON.parse(JSON.stringify(plays));
    validateForExport(plays);
    expect(plays).toEqual(snapshot);
  });
});

// ── TEST 8: Notes export ──

describe("toNotesCsv", () => {
  it("excludes soft-deleted notes", () => {
    const plays = [makPlay({ playNum: 1 })];
    const notes = [
      makeNote({ deletedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const csv = toNotesCsv(plays, notes);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1); // header only
  });

  it("excludes notes referencing non-existent plays", () => {
    const plays = [makPlay({ playNum: 1 })];
    const notes = [makeNote({ playNum: 999 })];
    const csv = toNotesCsv(plays, notes);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1); // header only
  });

  it("includes valid notes with play context", () => {
    const plays = [makPlay({ playNum: 1, qtr: "3", odk: "O" })];
    const notes = [makeNote({ playNum: 1 })];
    const csv = toNotesCsv(plays, notes);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2); // header + 1 row
    expect(lines[1]).toContain("3"); // qtr
    expect(lines[1]).toContain("O"); // odk
  });

  it("outputs header row matching NOTES_HEADERS", () => {
    const csv = toNotesCsv([], []);
    const headerLine = csv.split("\n")[0];
    const expected = NOTES_HEADERS.map((h) => h.label).join(",");
    expect(headerLine).toBe(expected);
  });
});

// ── TEST 9: Manifest structure ──

describe("buildExportManifest", () => {
  it("returns correct structure with expected types", () => {
    const manifest = buildExportManifest({
      lookupStoreVersion: "unknown",
      seasonRevision: 42,
      playCount: 10,
      noteCount: 3,
    });

    expect(manifest.appVersion).toBe(APP_VERSION);
    expect(manifest.exportFormatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(manifest.lookupStoreVersion).toBe("unknown");
    expect(manifest.seasonRevision).toBe(42);
    expect(typeof manifest.exportedAt).toBe("string");
    expect(manifest.counts.plays).toBe(10);
    expect(manifest.counts.notes).toBe(3);
  });
});
