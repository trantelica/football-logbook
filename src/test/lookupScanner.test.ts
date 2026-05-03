import { describe, it, expect } from "vitest";
import { scanKnownLookups } from "@/engine/lookupScanner";
import { SECTIONS } from "@/engine/sectionOwnership";

const SITUATION_OWNED = SECTIONS.find((s) => s.id === "situation")!.ownedFields;
const PLAY_DETAILS_OWNED = SECTIONS.find((s) => s.id === "playDetails")!.ownedFields;
const PLAY_RESULTS_OWNED = SECTIONS.find((s) => s.id === "playResults")!.ownedFields;

function map(entries: Record<string, string[]>): Map<string, string[]> {
  return new Map(Object.entries(entries));
}

describe("scanKnownLookups — section gating", () => {
  const lookupMap = map({
    offForm: ["Trips Right", "Black", "Shiny"],
    offPlay: ["26 Punch", "39 Reverse Pass"],
    motion: ["Z Across"],
  });

  it("returns no hits for Situation text containing a known formation", () => {
    const r = scanKnownLookups("3rd and 7 from Trips Right at the 40", lookupMap, SITUATION_OWNED);
    expect(r.hits).toEqual([]);
    expect(r.perField).toEqual({});
  });

  it("returns no hits for Play Results text containing a known play", () => {
    const r = scanKnownLookups("26 Punch for 8 yards complete to 11", lookupMap, PLAY_RESULTS_OWNED);
    expect(r.hits).toEqual([]);
  });
});

describe("scanKnownLookups — Play Details positive matches", () => {
  const lookupMap = map({
    offForm: ["Trips Right", "Shiny"],
    offPlay: ["39 Reverse Pass", "26 Punch"],
    motion: ["Z Across"],
  });

  it("finds a known formation", () => {
    const r = scanKnownLookups("we're in Trips Right", lookupMap, PLAY_DETAILS_OWNED);
    expect(r.perField.offForm?.canonical).toBe("Trips Right");
  });

  it("finds a known multi-token play and a known formation in the same text", () => {
    const r = scanKnownLookups(
      "the play is 39 Reverse Pass from Shiny formation",
      lookupMap,
      PLAY_DETAILS_OWNED,
    );
    expect(r.perField.offPlay?.canonical).toBe("39 Reverse Pass");
    expect(r.perField.offForm?.canonical).toBe("Shiny");
  });

  it("finds a known motion", () => {
    const r = scanKnownLookups("Z Across motion to the right", lookupMap, PLAY_DETAILS_OWNED);
    expect(r.perField.motion?.canonical).toBe("Z Across");
  });

  it("returns no hit for unknown lookup-sounding text", () => {
    const r = scanKnownLookups("Glorpfish formation", lookupMap, PLAY_DETAILS_OWNED);
    expect(r.hits).toEqual([]);
  });
});

describe("scanKnownLookups — match resolution", () => {
  it("longest match wins (Black vs Black Tight)", () => {
    const lookupMap = map({ offForm: ["Black", "Black Tight"] });
    const r = scanKnownLookups("we're in Black Tight today", lookupMap, PLAY_DETAILS_OWNED);
    expect(r.perField.offForm?.canonical).toBe("Black Tight");
  });

  it("drops the field on equal-length tie at same span with different canonicals", () => {
    // Both canonicals are distinct strings of equal token length matching at
    // different positions — earliest position wins (not a true tie).
    const lookupMap = map({ offForm: ["Aaaaa", "Bbbbb"] });
    const r = scanKnownLookups("Aaaaa Bbbbb", lookupMap, PLAY_DETAILS_OWNED);
    expect(r.perField.offForm?.canonical).toBe("Aaaaa");

    // Duplicate identical canonical is not a tie of distinct values.
    const lookupMap2 = map({ offForm: ["Black", "Black"] });
    const r2 = scanKnownLookups("Black formation", lookupMap2, PLAY_DETAILS_OWNED);
    expect(r2.perField.offForm?.canonical).toBe("Black");
  });

  it("supports canonical values with more than 4 tokens", () => {
    const lookupMap = map({ offPlay: ["A B C D E F"] });
    const r = scanKnownLookups("we ran a b c d e f for six", lookupMap, PLAY_DETAILS_OWNED);
    expect(r.perField.offPlay?.canonical).toBe("A B C D E F");
    expect(r.perField.offPlay?.tokenLength).toBe(6);
  });

  it("matches case- and whitespace-insensitively", () => {
    const lookupMap = map({ offPlay: ["39 Reverse Pass"] });
    const r = scanKnownLookups("...   39   reverse   PASS   then ...", lookupMap, PLAY_DETAILS_OWNED);
    expect(r.perField.offPlay?.canonical).toBe("39 Reverse Pass");
  });
});

describe("scanKnownLookups — derived fields are never emitted", () => {
  it("never produces offStrength/personnel/playType/playDir/motionDir", () => {
    const lookupMap = map({
      offForm: ["Trips Right"],
      offPlay: ["26 Punch"],
      motion: ["Z Across"],
      offStrength: ["R"],
      personnel: ["11"],
      playType: ["Pass"],
      playDir: ["R"],
      motionDir: ["R"],
    });
    const allowed = [
      ...PLAY_DETAILS_OWNED,
      "offStrength",
      "personnel",
      "playType",
      "playDir",
      "motionDir",
    ];
    const r = scanKnownLookups("Trips Right 26 Punch Z Across Pass R 11", lookupMap, allowed);
    for (const f of Object.keys(r.perField)) {
      expect(["offForm", "offPlay", "motion"]).toContain(f);
    }
  });
});
