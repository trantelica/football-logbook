import { describe, it, expect } from "vitest";
import { parsePersonnelNarration } from "@/engine/personnelParser";
import type { PositionAliasMap } from "@/engine/positionAliases";

const aliases: PositionAliasMap = {
  pos1: "Q",
  pos2: "H",
  pos3: "F",
  pos4: "Z",
};

describe("parsePersonnelNarration — surgical edit verbs", () => {
  it("'Number three moved to F' → pos3 = 3 via alias", () => {
    const r = parsePersonnelNarration("Number three moved to F", aliases);
    expect(r.patch).toEqual({ pos3: 3 });
  });

  it("'Number 12 moved to center' → posC = 12", () => {
    const r = parsePersonnelNarration("Number 12 moved to center", aliases);
    expect(r.patch).toEqual({ posC: 12 });
  });

  it("two surgical edits in one block via 'and'", () => {
    const r = parsePersonnelNarration(
      "Number three moved to F and number 12 moved to center",
      aliases,
    );
    expect(r.patch).toEqual({ pos3: 3, posC: 12 });
  });

  it("two surgical edits in one block across newlines", () => {
    const r = parsePersonnelNarration(
      "Number three moved to F\nAnd number 12 moved to center",
      aliases,
    );
    expect(r.patch).toEqual({ pos3: 3, posC: 12 });
  });

  it("'#3 moved to F' → pos3 = 3", () => {
    const r = parsePersonnelNarration("#3 moved to F", aliases);
    expect(r.patch).toEqual({ pos3: 3 });
  });

  it("'3 moved to F' → pos3 = 3", () => {
    const r = parsePersonnelNarration("3 moved to F", aliases);
    expect(r.patch).toEqual({ pos3: 3 });
  });

  it("'number three moves to F' → pos3 = 3", () => {
    const r = parsePersonnelNarration("number three moves to F", aliases);
    expect(r.patch).toEqual({ pos3: 3 });
  });

  it("'number three is now at F' → pos3 = 3", () => {
    const r = parsePersonnelNarration("number three is now at F", aliases);
    expect(r.patch).toEqual({ pos3: 3 });
  });

  it("'number 12 is now playing center' → posC = 12", () => {
    const r = parsePersonnelNarration("number 12 is now playing center", aliases);
    expect(r.patch).toEqual({ posC: 12 });
  });

  it("'twelve moved to center' (number-word jersey) → posC = 12", () => {
    const r = parsePersonnelNarration("twelve moved to center", aliases);
    expect(r.patch).toEqual({ posC: 12 });
  });

  it("surgical edit emits only mentioned canonical fields (carry-forward preserved by caller)", () => {
    // Parser only emits patch keys for what was said. Other carried-forward
    // fields are left for the application merge layer to preserve.
    const r = parsePersonnelNarration(
      "Number three moved to F and number 12 moved to center",
      aliases,
    );
    expect(Object.keys(r.patch).sort()).toEqual(["pos3", "posC"].sort());
  });

  it("surgical edit triggers move-detection when jersey was at another slot", () => {
    const current = { pos1: 12 };
    const r = parsePersonnelNarration(
      "number 12 moved to center",
      aliases,
      current,
    );
    expect(r.patch).toEqual({ pos1: null, posC: 12 });
  });

  it("duplicate jersey gate still applies across surgical-edit verbs", () => {
    const r = parsePersonnelNarration(
      "number 7 moved to F and number 7 is now at Z",
      aliases,
    );
    // First applied; second blocked as duplicate.
    expect(r.patch).toEqual({ pos3: 7 });
    expect(r.duplicateJerseys).toEqual([7]);
  });

  it("off-roster gate still applies across surgical-edit verbs", () => {
    const roster = new Set<number>([1, 2, 3]);
    const r = parsePersonnelNarration(
      "number 99 moved to F",
      aliases,
      null,
      roster,
    );
    expect(r.patch).toEqual({});
    expect(r.offRosterJerseys).toEqual([99]);
  });
});
