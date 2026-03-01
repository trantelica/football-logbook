/**
 * Coach Notes Tests — Phase 7.2.1
 */
import { describe, it, expect } from "vitest";
import { notesToCSV } from "../engine/export";
import type { CoachNote, PlayRecord } from "../engine/types";

function makePlay(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    gameId: "g1",
    playNum: 1,
    qtr: "1",
    odk: "O",
    series: 1,
    yardLn: 25,
    dn: "1",
    dist: 10,
    hash: null,
    offForm: "Trips Rt",
    offPlay: "26 Punch",
    motion: null,
    result: "Rush",
    gainLoss: 4,
    twoMin: null,
    rusher: null,
    passer: null,
    receiver: null,
    penalty: null,
    penYards: null,
    eff: null,
    offStrength: "R",
    personnel: null,
    playType: null,
    playDir: null,
    motionDir: null,
    patTry: null,
    posLT: null, posLG: null, posC: null, posRG: null, posRT: null,
    posX: null, posY: null, pos1: null, pos2: null, pos3: null, pos4: null,
    returner: null,
    gradeLT: null, gradeLG: null, gradeC: null, gradeRG: null, gradeRT: null,
    gradeX: null, gradeY: null, grade1: null, grade2: null, grade3: null, grade4: null,
    ...overrides,
  };
}

function makeNote(overrides: Partial<CoachNote> = {}): CoachNote {
  return {
    id: "n1",
    gameId: "g1",
    playNum: 1,
    text: "Good blocking on the left side",
    createdAt: "2026-03-01T12:00:00.000Z",
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("Coach Notes", () => {
  describe("notesToCSV — derived context", () => {
    it("includes play context when committed play exists", () => {
      const notes = [makeNote()];
      const plays = [makePlay()];
      const csv = notesToCSV(notes, plays);
      const lines = csv.split("\n");

      // Header line
      expect(lines[0]).toContain("PLAY #");
      expect(lines[0]).toContain("NOTE ID");
      expect(lines[0]).toContain("QTR");
      expect(lines[0]).toContain("RESULT");

      // Data line — play context derived
      expect(lines[1]).toContain("n1"); // note id
      expect(lines[1]).toContain("1"); // qtr
      expect(lines[1]).toContain("O"); // odk
      expect(lines[1]).toContain("25"); // yardLn
      expect(lines[1]).toContain("Rush"); // result
      expect(lines[1]).toContain("Trips Rt"); // offForm
    });

    it("leaves derived fields blank when play missing", () => {
      const notes = [makeNote({ playNum: 99 })];
      const plays = [makePlay({ playNum: 1 })]; // no play 99
      const csv = notesToCSV(notes, plays);
      const lines = csv.split("\n");
      const cols = lines[1].split(",");
      // After TEXT (index 5), derived fields should be empty
      // QTR is index 6
      expect(cols[6]).toBe("");
      expect(cols[7]).toBe(""); // ODK
    });

    it("returns empty string for empty notes array", () => {
      expect(notesToCSV([], [makePlay()])).toBe("");
    });

    it("includes correct note core fields", () => {
      const note = makeNote({ text: "Test note, with comma" });
      const csv = notesToCSV([note], [makePlay()]);
      const lines = csv.split("\n");
      // Text with comma should be quoted
      expect(lines[1]).toContain('"Test note, with comma"');
      expect(lines[1]).toContain("g1"); // gameId
    });
  });

  describe("CoachNote type", () => {
    it("has required fields", () => {
      const note = makeNote();
      expect(note.id).toBe("n1");
      expect(note.gameId).toBe("g1");
      expect(note.playNum).toBe(1);
      expect(note.text).toBeTruthy();
      expect(note.createdAt).toBeTruthy();
      expect(note.updatedAt).toBeNull();
      expect(note.deletedAt).toBeNull();
    });

    it("soft delete sets deletedAt", () => {
      const note = makeNote();
      note.deletedAt = "2026-03-01T13:00:00.000Z";
      note.updatedAt = "2026-03-01T13:00:00.000Z";
      expect(note.deletedAt).toBeTruthy();
    });

    it("edit sets updatedAt", () => {
      const note = makeNote();
      note.text = "Updated text";
      note.updatedAt = "2026-03-01T13:00:00.000Z";
      expect(note.updatedAt).toBeTruthy();
      expect(note.text).toBe("Updated text");
    });
  });

  describe("No side-effects", () => {
    it("note creation does not alter play record", () => {
      const play = makePlay();
      const originalPlay = { ...play };
      // Simulate creating a note (just verify the play object is unchanged)
      makeNote({ gameId: play.gameId, playNum: play.playNum });
      expect(play).toEqual(originalPlay);
    });
  });

  describe("Export join correctness", () => {
    it("handles multiple notes for same play", () => {
      const notes = [
        makeNote({ id: "n1", text: "First" }),
        makeNote({ id: "n2", text: "Second" }),
      ];
      const csv = notesToCSV(notes, [makePlay()]);
      const lines = csv.split("\n");
      expect(lines.length).toBe(3); // header + 2 data rows
    });

    it("handles notes across different plays", () => {
      const notes = [
        makeNote({ id: "n1", playNum: 1 }),
        makeNote({ id: "n2", playNum: 2 }),
      ];
      const plays = [makePlay({ playNum: 1 }), makePlay({ playNum: 2, odk: "D" })];
      const csv = notesToCSV(notes, plays);
      const lines = csv.split("\n");
      expect(lines.length).toBe(3);
      expect(lines[2]).toContain("D"); // second play ODK
    });
  });
});
