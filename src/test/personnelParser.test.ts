import { describe, it, expect } from "vitest";
import { parsePersonnelNarration } from "@/engine/personnelParser";
import type { PositionAliasMap } from "@/engine/positionAliases";

const aliases: PositionAliasMap = {
  pos1: "Q",
  pos2: "H",
  pos3: "F",
  pos4: "Z",
};

describe("parsePersonnelNarration", () => {
  it("parses 'number one is playing at Q' → pos1", () => {
    const r = parsePersonnelNarration("number one is playing at Q", aliases);
    expect(r.patch).toEqual({ pos1: 1 });
    expect(r.report[0].status).toBe("matched");
    expect(r.report[0].canonicalField).toBe("pos1");
  });

  it("parses several aliased assignments in one utterance", () => {
    const text =
      "number one is playing at Q. number two is playing at H. number three is playing at F. number four is playing at Z.";
    const r = parsePersonnelNarration(text, aliases);
    expect(r.patch).toEqual({ pos1: 1, pos2: 2, pos3: 3, pos4: 4 });
  });

  it("parses 'number five is playing X' (canonical label, no 'at')", () => {
    const r = parsePersonnelNarration("number five is playing X", aliases);
    expect(r.patch).toEqual({ posX: 5 });
  });

  it("parses 'number six is playing at Y' canonical", () => {
    const r = parsePersonnelNarration("number six is playing at Y", aliases);
    expect(r.patch).toEqual({ posY: 6 });
  });

  it("parses long-form role phrases 'left guard' and 'left tackle'", () => {
    const r = parsePersonnelNarration(
      "number seven is playing left guard. number eight is playing left tackle.",
      aliases,
    );
    expect(r.patch).toEqual({ posLG: 7, posLT: 8 });
  });

  it("emits canonical pos* keys only — never alias keys", () => {
    const r = parsePersonnelNarration(
      "number one is playing at Q. number three is playing at F.",
      aliases,
    );
    for (const k of Object.keys(r.patch)) {
      expect(k.startsWith("pos")).toBe(true);
    }
  });

  it("detects move when jersey already lives in another canonical slot", () => {
    const r = parsePersonnelNarration(
      "number 12 is playing at Q",
      aliases,
      { pos2: 12, pos1: null },
    );
    expect(r.patch).toEqual({ pos2: null, pos1: 12 });
    expect(r.report[0].movedFrom).toBe("pos2");
  });

  it("does not duplicate when assignment is to same slot", () => {
    const r = parsePersonnelNarration(
      "number 12 is playing at Q",
      aliases,
      { pos1: 12 },
    );
    expect(r.patch).toEqual({ pos1: 12 });
    expect(r.report[0].movedFrom).toBeUndefined();
  });

  it("flags unrecognized position phrase", () => {
    const r = parsePersonnelNarration("number 9 is playing at zorp", aliases);
    expect(r.patch).toEqual({});
    expect(r.report[0].status).toBe("unrecognized");
    expect(r.report[0].jersey).toBe(9);
  });

  it("supports digit jersey '#22 plays right tackle'", () => {
    const r = parsePersonnelNarration("#22 plays right tackle", aliases);
    expect(r.patch).toEqual({ posRT: 22 });
  });

  it("returns empty for blank input", () => {
    const r = parsePersonnelNarration("", aliases);
    expect(r.patch).toEqual({});
    expect(r.report).toEqual([]);
    expect(r.offRosterJerseys).toEqual([]);
    expect(r.duplicateJerseys).toEqual([]);
  });

  it("ignores irrelevant chatter without anchors", () => {
    const r = parsePersonnelNarration("we ran a great play out there today", aliases);
    expect(r.patch).toEqual({});
  });

  it("blocks off-roster jerseys when roster is supplied — never silently applies", () => {
    const roster = new Set<number>([1, 2, 3]);
    const r = parsePersonnelNarration(
      "number 99 is playing at Q",
      aliases,
      null,
      roster,
    );
    expect(r.patch).toEqual({});
    expect(r.offRosterJerseys).toEqual([99]);
    expect(r.report[0].status).toBe("off_roster");
    expect(r.report[0].jersey).toBe(99);
    expect(r.report[0].canonicalField).toBe("pos1");
  });

  it("applies on-roster jerseys when roster is supplied", () => {
    const roster = new Set<number>([12]);
    const r = parsePersonnelNarration(
      "number 12 is playing at Q",
      aliases,
      null,
      roster,
    );
    expect(r.patch).toEqual({ pos1: 12 });
    expect(r.offRosterJerseys).toEqual([]);
  });

  it("blocks intra-utterance duplicate when same jersey targets two distinct slots", () => {
    const r = parsePersonnelNarration(
      "number 7 is playing at Q. number 7 is playing at H.",
      aliases,
    );
    // First assignment applied; second blocked as duplicate (NOT silently re-routed).
    expect(r.patch).toEqual({ pos1: 7 });
    expect(r.duplicateJerseys).toEqual([7]);
    const dupEntry = r.report.find((x) => x.status === "duplicate");
    expect(dupEntry).toBeDefined();
    expect(dupEntry?.jersey).toBe(7);
    expect(dupEntry?.canonicalField).toBe("pos2");
  });

  it("does not flag duplicate when same jersey re-targets the same slot", () => {
    const r = parsePersonnelNarration(
      "number 7 is playing at Q. number 7 is playing at Q.",
      aliases,
    );
    expect(r.patch).toEqual({ pos1: 7 });
    expect(r.duplicateJerseys).toEqual([]);
  });

  it("blocks same-slot conflict in compact comma-chained assignments", () => {
    // pos1 is targeted by both #0 ('q' alias) and #5 (canonical '1') in the
    // same utterance. Per strict policy, NEITHER assignment to pos1 is
    // applied — last-write-wins is forbidden. Other slots still apply.
    const r = parsePersonnelNarration(
      "0 is at q, #1 is at 2, 2 is at F, #5 is at 1",
      aliases,
    );
    expect(r.patch).toEqual({ pos2: 1, pos3: 2 });
    expect(r.sameSlotConflicts).toHaveLength(1);
    expect(r.sameSlotConflicts[0].canonicalField).toBe("pos1");
    expect(r.sameSlotConflicts[0].jerseys.sort()).toEqual([0, 5]);
    const conflictReports = r.report.filter((x) => x.status === "same_slot_conflict");
    expect(conflictReports).toHaveLength(2);
  });

  it("blocks simple same-slot conflict between two jerseys", () => {
    const r = parsePersonnelNarration("12 is at Q, 13 is at Q", aliases);
    expect(r.patch).toEqual({});
    expect(r.sameSlotConflicts).toHaveLength(1);
    expect(r.sameSlotConflicts[0].canonicalField).toBe("pos1");
    expect(r.sameSlotConflicts[0].jerseys.sort()).toEqual([12, 13]);
  });

  it("parses 'is at' with canonical numeric position labels", () => {
    const r = parsePersonnelNarration("#1 is at 2", aliases);
    expect(r.patch).toEqual({ pos2: 1 });
  });

  it("parses bare-comma separation without trailing whitespace", () => {
    const r = parsePersonnelNarration("2 is at F,#5 is at 1", aliases);
    expect(r.patch).toEqual({ pos3: 2, pos1: 5 });
  });
});

describe("parsePersonnelNarration — move/switch verbs", () => {
  it("'move 6 to RG' relocates jersey 6 from prior slot to posRG", () => {
    const current = { posLG: 6 };
    const r = parsePersonnelNarration("move 6 to RG", aliases, current);
    expect(r.patch).toEqual({ posLG: null, posRG: 6 });
    expect(r.report.find((e) => e.status === "matched")?.movedFrom).toBe("posLG");
  });

  it("'switch #6 to right guard' relocates with alias-resolved target", () => {
    const current = { posC: 6 };
    const r = parsePersonnelNarration("switch #6 to right guard", aliases, current);
    expect(r.patch).toEqual({ posC: null, posRG: 6 });
  });

  it("'6 moves to RG' (subject-verb form) relocates", () => {
    const current = { posLT: 6 };
    const r = parsePersonnelNarration("6 moves to RG", aliases, current);
    expect(r.patch).toEqual({ posLT: null, posRG: 6 });
  });

  it("move phrase with no prior assignment behaves as plain assignment", () => {
    const r = parsePersonnelNarration("move 6 to RG", aliases, {});
    expect(r.patch).toEqual({ posRG: 6 });
  });

  it("preserves same-slot conflict when move target collides with another jersey", () => {
    const r = parsePersonnelNarration("move 6 to RG, 7 is at RG", aliases, {});
    expect(r.patch).toEqual({});
    expect(r.sameSlotConflicts).toHaveLength(1);
    expect(r.sameSlotConflicts[0].canonicalField).toBe("posRG");
    expect(r.sameSlotConflicts[0].jerseys.sort()).toEqual([6, 7]);
  });
});

describe("parsePersonnelNarration — off-roster pending payload", () => {
  it("preserves jersey, canonicalField, and rawSentence for off-roster blocks (used by roster-resolve dialog)", () => {
    const roster = new Set<number>([1, 2, 3]);
    const r = parsePersonnelNarration("12 at C", aliases, null, roster);
    expect(r.patch).toEqual({});
    expect(r.offRosterJerseys).toEqual([12]);
    const entry = r.report.find((e) => e.status === "off_roster");
    expect(entry).toBeDefined();
    expect(entry?.jersey).toBe(12);
    expect(entry?.canonicalField).toBe("posC");
    expect(entry?.rawSentence).toBe("12 at C");
  });

  it("re-parse with extended roster unblocks the previously off-roster assignment", () => {
    const r1 = parsePersonnelNarration("12 at C", aliases, null, new Set([1]));
    expect(r1.patch).toEqual({});
    // Simulate dialog adding #12 to roster, then re-parse with extended set.
    const r2 = parsePersonnelNarration("12 at C", aliases, null, new Set([1, 12]));
    expect(r2.patch).toEqual({ posC: 12 });
    expect(r2.offRosterJerseys).toEqual([]);
  });
});
