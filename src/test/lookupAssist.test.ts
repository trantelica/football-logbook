import { describe, it, expect } from "vitest";
import { collectAssistCandidates } from "@/engine/lookupAssist";
import type { LookupScanResult } from "@/engine/lookupScanner";

const lookup = (entries: Record<string, string[]>) =>
  new Map<string, readonly string[]>(Object.entries(entries));

describe("collectAssistCandidates (Slice F2.a)", () => {
  it("1. offPlay numeric cue '26' returns 3 options sharing the digit", () => {
    const r = collectAssistCandidates({
      sectionText: "the play is 26",
      lookupMap: lookup({
        offPlay: ["26 Punch", "26 Power", "26 Pass", "39 Sweep"],
      }),
    });
    const f = r.perField.offPlay;
    expect(f?.kind).toBe("options");
    if (f?.kind !== "options") return;
    expect(f.knownOptions.map((o) => o.canonical).sort()).toEqual([
      "26 Pass", "26 Power", "26 Punch",
    ]);
    for (const o of f.knownOptions) {
      expect(o.signals).toContain("numeric");
    }
  });

  it("2. offPlay 'Fake 26 Punch' returns both, ranking '26 Punch Fake' higher by overlap", () => {
    const r = collectAssistCandidates({
      sectionText: "Fake 26 Punch",
      lookupMap: lookup({ offPlay: ["26 Punch", "26 Punch Fake"] }),
    });
    const f = r.perField.offPlay;
    expect(f?.kind).toBe("options");
    if (f?.kind !== "options") return;
    expect(f.knownOptions.map((o) => o.canonical)).toEqual([
      "26 Punch Fake",
      "26 Punch",
    ]);
  });

  it("3. offForm 'Vader formation' returns Invader and Vader Tight; excludes Black", () => {
    const r = collectAssistCandidates({
      sectionText: "Vader formation",
      lookupMap: lookup({ offForm: ["Invader", "Vader Tight", "Black"] }),
    });
    const f = r.perField.offForm;
    expect(f?.kind).toBe("options");
    if (f?.kind !== "options") return;
    const names = f.knownOptions.map((o) => o.canonical).sort();
    expect(names).toEqual(["Invader", "Vader Tight"]);
    expect(names).not.toContain("Black");
  });

  it("4. motion 'Z acros motion' returns Z Across only", () => {
    const r = collectAssistCandidates({
      sectionText: "Z acros motion",
      lookupMap: lookup({ motion: ["Z Across", "Z Jet"] }),
    });
    const f = r.perField.motion;
    expect(f?.kind).toBe("options");
    if (f?.kind !== "options") return;
    expect(f.knownOptions.map((o) => o.canonical)).toEqual(["Z Across"]);
  });

  it("5. text with no governed-relevant tokens returns no_match for all fields", () => {
    const r = collectAssistCandidates({
      sectionText: "hello world today",
      lookupMap: lookup({
        offForm: ["Invader"],
        offPlay: ["26 Punch"],
        motion: ["Z Across"],
      }),
    });
    expect(r.perField.offForm?.kind).toBe("no_match");
    expect(r.perField.offPlay?.kind).toBe("no_match");
    expect(r.perField.motion?.kind).toBe("no_match");
  });

  it("6. cap respected: 12 numeric matches → 6 returned for offPlay", () => {
    const canonicals = Array.from({ length: 12 }, (_, i) => `26 Play${i}`);
    const r = collectAssistCandidates({
      sectionText: "26",
      lookupMap: lookup({ offPlay: canonicals }),
    });
    const f = r.perField.offPlay;
    expect(f?.kind).toBe("options");
    if (f?.kind !== "options") return;
    expect(f.knownOptions.length).toBe(6);
    // Deterministic alphabetical secondary ordering
    const names = f.knownOptions.map((o) => o.canonical);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("7. scanner whole-canonical winner suppresses assist for that field", () => {
    const scannerResult: LookupScanResult = {
      perField: {
        offForm: {
          fieldName: "offForm",
          canonical: "Invader",
          tokenLength: 1,
          startIndex: 0,
          endIndex: 7,
        },
      },
      hits: [],
    };
    const r = collectAssistCandidates({
      sectionText: "Invader formation",
      scannerResult,
      lookupMap: lookup({ offForm: ["Invader", "Vader Tight"] }),
    });
    expect(r.perField.offForm).toBeUndefined();
  });

  it("8. already-touched field suppresses assist", () => {
    const r = collectAssistCandidates({
      sectionText: "26",
      touchedFields: new Set(["offPlay"]),
      lookupMap: lookup({ offPlay: ["26 Punch", "26 Power"] }),
    });
    expect(r.perField.offPlay).toBeUndefined();
  });

  it("8b. already-filled field suppresses assist", () => {
    const r = collectAssistCandidates({
      sectionText: "26",
      filledFields: new Set(["offPlay"]),
      lookupMap: lookup({ offPlay: ["26 Punch"] }),
    });
    expect(r.perField.offPlay).toBeUndefined();
  });

  it("10. uniqueOption set when only one candidate has a strong signal", () => {
    const r = collectAssistCandidates({
      sectionText: "Vader",
      lookupMap: lookup({ offForm: ["Vader Tight", "Other"] }),
    });
    const f = r.perField.offForm;
    if (f?.kind !== "options") throw new Error("expected options");
    expect(f.uniqueOption).toBe("Vader Tight");
  });

  it("10b. uniqueOption NOT set when 2+ candidates carry numeric/prefix", () => {
    const r = collectAssistCandidates({
      sectionText: "26",
      lookupMap: lookup({ offPlay: ["26 Punch", "26 Power"] }),
    });
    const f = r.perField.offPlay;
    if (f?.kind !== "options") throw new Error("expected options");
    expect(f.uniqueOption).toBeUndefined();
  });
});
