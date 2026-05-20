import { describe, it, expect } from "vitest";
import { parsePersonnelNarration } from "@/engine/personnelParser";
import type { PositionAliasMap } from "@/engine/positionAliases";

// Aliases per manual test setup: F → pos3, Z → pos4.
// (pos1/pos2 left unaliased so they resolve via canonical labels "1"/"2".)
const aliases: PositionAliasMap = {
  pos3: "F",
  pos4: "Z",
};

describe("parsePersonnelNarration — filler-word tolerance", () => {
  it("strips leading 'a' from 'a left guard'", () => {
    const r = parsePersonnelNarration("number two is a left guard", aliases);
    expect(r.patch).toEqual({ posLG: 2 });
  });

  it("strips leading 'it' from 'It Center'", () => {
    const r = parsePersonnelNarration("number three is It Center", aliases);
    expect(r.patch).toEqual({ posC: 3 });
  });

  it("strips leading 'it' and applies STT rewrite 'ray guard' → 'right guard'", () => {
    const r = parsePersonnelNarration("#4 is it Ray guard", aliases);
    expect(r.patch).toEqual({ posRG: 4 });
  });

  it("strips leading 'that' from 'that Y'", () => {
    const r = parsePersonnelNarration("number six is that Y", aliases);
    expect(r.patch).toEqual({ posY: 6 });
  });

  it("strips leading 'position' from 'position one'", () => {
    const r = parsePersonnelNarration(
      "number eight is playing in position one",
      aliases,
    );
    expect(r.patch).toEqual({ pos1: 8 });
  });

  it("strips leading 'position' from 'position Z' (alias)", () => {
    const r = parsePersonnelNarration(
      "number 11 is playing in position Z",
      aliases,
    );
    expect(r.patch).toEqual({ pos4: 11 });
  });
});

describe("parsePersonnelNarration — reverse construction", () => {
  it("'Left tackle is played by number one' → posLT = 1", () => {
    const r = parsePersonnelNarration(
      "Left tackle is played by number one",
      aliases,
    );
    expect(r.patch).toEqual({ posLT: 1 });
  });

  it("'Center was played by #12' → posC = 12", () => {
    const r = parsePersonnelNarration("Center was played by #12", aliases);
    expect(r.patch).toEqual({ posC: 12 });
  });
});

describe("parsePersonnelNarration — full carry-forward overwrite narration", () => {
  // Exact manual test text reported by the coach. After parser+filler
  // strips and reverse construction handling, the parser should resolve
  // all the clauses that survive the clause splitter; the dangling
  // "Z" continuation across a paragraph break is the AI fallback's job.
  const TEXT =
    "Left tackle is played by number one number two is a left guard number three is It Center, #4 is it Ray guard number five is right tackle number six is that Y number seven is at X\n\n" +
    "Number eight is playing in position one number nine is playing position two number 10 is playing in position three and number 11 is playing in position\n\nZ";

  it("resolves at least the 10 unambiguous clauses to canonical pos* fields", () => {
    const r = parsePersonnelNarration(TEXT, aliases);
    // The 10 clauses where jersey and position phrase appear in the same clause.
    expect(r.patch).toMatchObject({
      posLT: 1,
      posLG: 2,
      posC: 3,
      posRG: 4,
      posRT: 5,
      posY: 6,
      posX: 7,
      pos1: 8,
      pos2: 9,
      pos3: 10,
    });
    // Clause 11 ("number 11 is playing in position" / "Z") is split across a
    // paragraph break — surfaced as unrecognized so the AI fallback runs.
    expect(r.report.some((e) => e.status === "unrecognized")).toBe(true);
  });

  it("does not emit standalone null personnel fields when no carry-forward exists", () => {
    const r = parsePersonnelNarration(TEXT, aliases);
    for (const [k, v] of Object.entries(r.patch)) {
      if (k.startsWith("pos")) expect(v).not.toBeNull();
    }
  });
});
