import { describe, it, expect } from "vitest";
import { detectParserSuspicion } from "../engine/parserSuspicion";
import type { LookupScanResult } from "../engine/lookupScanner";

function lookups(map: Record<string, string[]>): Map<string, string[]> {
  return new Map(Object.entries(map));
}

const LOOKUPS = lookups({
  offForm: ["Trips", "Black", "Twins", "Shiny"],
  offPlay: ["26 Punch", "Curly Chair Max", "Sweep Left", "Counter"],
  motion: ["Z Jet", "Y Across"],
});

describe("parserSuspicion — clean/known", () => {
  it("1. clean known lookup value produces no suspicion", () => {
    const r = detectParserSuspicion({
      parserPatch: { offForm: "Trips", offPlay: "26 Punch", motion: "Z Jet" },
      lookupMap: LOOKUPS,
    });
    expect(r.signals).toEqual([]);
    expect(r.perField).toEqual({});
  });

  it("9. non-governed fields are ignored", () => {
    const r = detectParserSuspicion({
      parserPatch: { dn: 3, dist: 5, hash: "L", result: "Complete", penalty: "Holding" },
      lookupMap: LOOKUPS,
    });
    expect(r.signals).toEqual([]);
  });
});

describe("parserSuspicion — single codes", () => {
  it("2. overlong governed value produces overlong_value", () => {
    const r = detectParserSuspicion({
      parserPatch: { offForm: "alpha bravo charlie delta echo" },
      lookupMap: LOOKUPS,
    });
    expect(r.perField.offForm?.codes).toContain("overlong_value");
  });

  it("3. sentence-shaped play value produces sentence_shape", () => {
    const r = detectParserSuspicion({
      parserPatch: { offPlay: "Counter ran hard" },
      lookupMap: LOOKUPS,
    });
    expect(r.perField.offPlay?.codes).toContain("sentence_shape");
  });

  it("5. motion containing another field anchor produces contains_other_anchor", () => {
    const r = detectParserSuspicion({
      parserPatch: { motion: "Jet PASSER right" },
      lookupMap: LOOKUPS,
    });
    expect(r.perField.motion?.codes).toContain("contains_other_anchor");
  });

  it("7. unknown phrase fragment produces phrase_fragment_unknown", () => {
    const r = detectParserSuspicion({
      parserPatch: { offPlay: "Wibble" },
      lookupMap: LOOKUPS,
    });
    expect(r.perField.offPlay?.codes).toEqual(["phrase_fragment_unknown"]);
  });
});

describe("parserSuspicion — multi-code", () => {
  it("4. 'Pass From Shiny' as offForm yields connector_absorbed and contains_other_anchor", () => {
    const r = detectParserSuspicion({
      parserPatch: { offForm: "Pass From Shiny" },
      lookupMap: LOOKUPS,
    });
    const codes = r.perField.offForm?.codes ?? [];
    expect(codes).toContain("connector_absorbed");
    expect(codes).toContain("contains_other_anchor");
  });

  it("6. parser/scanner disagreement produces scanner_conflict with scannerCanonical", () => {
    const scanner: LookupScanResult = {
      perField: {
        offPlay: {
          fieldName: "offPlay",
          canonical: "Sweep Left",
          tokenLength: 2,
          startIndex: 0,
          endIndex: 10,
        },
      },
      hits: [],
    };
    const r = detectParserSuspicion({
      parserPatch: { offPlay: "Sweep Right" },
      scannerResult: scanner,
      lookupMap: LOOKUPS,
    });
    const sig = r.perField.offPlay!;
    expect(sig.codes).toContain("scanner_conflict");
    expect(sig.scannerCanonical).toBe("Sweep Left");
  });

  it("8. multi-code result is ordered deterministically", () => {
    // Trigger overlong + sentence_shape + connector + anchor
    const r = detectParserSuspicion({
      parserPatch: {
        offPlay: "throws the ball PASSER from deep, again and again",
      },
      lookupMap: LOOKUPS,
    });
    const codes = r.perField.offPlay!.codes;
    const expectedOrder = [
      "overlong_value",
      "sentence_shape",
      "connector_absorbed",
      "contains_other_anchor",
    ];
    const filtered = codes.filter((c) => expectedOrder.includes(c));
    expect(filtered).toEqual(expectedOrder);
  });
});

describe("parserSuspicion — purity", () => {
  it("10. detector is pure: no input mutation, stable output", () => {
    const patch = { offForm: "Pass From Shiny", offPlay: "Counter ran hard" };
    const patchSnapshot = JSON.parse(JSON.stringify(patch));
    const scanner: LookupScanResult = { perField: {}, hits: [] };
    const scannerSnapshot = JSON.parse(JSON.stringify(scanner));

    const r1 = detectParserSuspicion({ parserPatch: patch, scannerResult: scanner, lookupMap: LOOKUPS });
    const r2 = detectParserSuspicion({ parserPatch: patch, scannerResult: scanner, lookupMap: LOOKUPS });

    expect(patch).toEqual(patchSnapshot);
    expect(scanner).toEqual(scannerSnapshot);
    expect(r1).toEqual(r2);
  });
});
