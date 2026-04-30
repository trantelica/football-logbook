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
  });

  it("ignores irrelevant chatter without anchors", () => {
    const r = parsePersonnelNarration("we ran a great play out there today", aliases);
    expect(r.patch).toEqual({});
  });
});
