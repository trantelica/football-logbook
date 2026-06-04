import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAiGradeProposal } from "../engine/aiGradeClient";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

beforeEach(() => {
  invokeMock.mockReset();
});

describe("aiGradeClient — Pass 3 advisory fallback contract", () => {
  it("empty narrationText → no invocation, returns error", async () => {
    const res = await fetchAiGradeProposal({
      narrationText: "   ",
      parserPatch: {},
      unresolvedFields: ["gradeY"],
    });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(res.patch).toEqual({});
    expect(res.conflicts).toEqual([]);
    expect(res.error).toBeTruthy();
  });

  it("non-grade keys are dropped", async () => {
    invokeMock.mockResolvedValue({
      data: { patch: { gradeY: 3, posC: 12, foo: 1 } },
      error: null,
    });
    const res = await fetchAiGradeProposal({
      narrationText: "Y gets a three",
      parserPatch: {},
      unresolvedFields: ["gradeY"],
    });
    expect(res.patch).toEqual({ gradeY: 3 });
    expect(res.conflicts).toEqual([]);
  });

  it("unknown grade-shaped keys are dropped", async () => {
    invokeMock.mockResolvedValue({
      data: { patch: { gradeQB: 2, grade1: 1 } },
      error: null,
    });
    const res = await fetchAiGradeProposal({
      narrationText: "x",
      parserPatch: {},
      unresolvedFields: ["grade1"],
    });
    expect(res.patch).toEqual({ grade1: 1 });
  });

  it("out-of-range values are dropped", async () => {
    invokeMock.mockResolvedValue({
      data: { patch: { gradeLT: 4, gradeLG: -4, gradeC: 3, gradeRG: -3, gradeRT: 0 } },
      error: null,
    });
    const res = await fetchAiGradeProposal({
      narrationText: "x",
      parserPatch: {},
      unresolvedFields: ["gradeLT", "gradeLG", "gradeC", "gradeRG", "gradeRT"],
    });
    expect(res.patch).toEqual({ gradeC: 3, gradeRG: -3, gradeRT: 0 });
  });

  it("non-integer values are dropped", async () => {
    invokeMock.mockResolvedValue({
      data: { patch: { gradeY: "three", grade2: 2.5, grade3: 2 } },
      error: null,
    });
    const res = await fetchAiGradeProposal({
      narrationText: "x",
      parserPatch: {},
      unresolvedFields: ["gradeY", "grade2", "grade3"],
    });
    expect(res.patch).toEqual({ grade3: 2 });
  });

  it("AI value matching parser value is silently dropped (no conflict)", async () => {
    invokeMock.mockResolvedValue({
      data: { patch: { gradeLT: 1, gradeY: 3 } },
      error: null,
    });
    const res = await fetchAiGradeProposal({
      narrationText: "x",
      parserPatch: { gradeLT: 1 },
      unresolvedFields: ["gradeY"],
    });
    expect(res.patch).toEqual({ gradeY: 3 });
    expect(res.conflicts).toEqual([]);
  });

  it("AI value differing from parser value becomes a conflict, never overwrites", async () => {
    invokeMock.mockResolvedValue({
      data: { patch: { gradeLT: 2, gradeY: 3 } },
      error: null,
    });
    const res = await fetchAiGradeProposal({
      narrationText: "x",
      parserPatch: { gradeLT: 1 },
      unresolvedFields: ["gradeY"],
    });
    expect(res.patch).toEqual({ gradeY: 3 });
    expect(res.conflicts).toEqual([
      { field: "gradeLT", parserValue: 1, aiValue: 2 },
    ]);
  });

  it("request body includes narration, parserPatch, unresolvedFields, aliases, grade range", async () => {
    invokeMock.mockResolvedValue({ data: { patch: {} }, error: null });
    await fetchAiGradeProposal({
      narrationText: "Y three",
      parserPatch: { gradeLT: 1 },
      unresolvedFields: ["gradeY", "grade2"],
      positionAliases: { pos3: "F", pos2: "H" },
      positionLabels: { gradeY: "Y", grade2: "2" },
    });
    const [name, opts] = invokeMock.mock.calls[0];
    expect(name).toBe("ai-enrich-grades");
    expect(opts.body.narrationText).toBe("Y three");
    expect(opts.body.parserPatch).toEqual({ gradeLT: 1 });
    expect(opts.body.unresolvedFields).toEqual(["gradeY", "grade2"]);
    expect(opts.body.positionAliases).toEqual({ pos3: "F", pos2: "H" });
    expect(opts.body.gradeRange).toEqual({ min: -3, max: 3 });
  });

  it("invocation error → returns error, empty patch and conflicts", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await fetchAiGradeProposal({
      narrationText: "x",
      parserPatch: {},
      unresolvedFields: [],
    });
    expect(res.patch).toEqual({});
    expect(res.conflicts).toEqual([]);
    expect(res.error).toBeTruthy();
  });

  it("server error envelope → propagates error string", async () => {
    invokeMock.mockResolvedValue({
      data: { error: "AI credits exhausted.", errorCategory: "credits_exhausted" },
      error: null,
    });
    const res = await fetchAiGradeProposal({
      narrationText: "x",
      parserPatch: {},
      unresolvedFields: [],
    });
    expect(res.patch).toEqual({});
    expect(res.error).toMatch(/credits exhausted/i);
    expect(res.errorCategory).toBe("credits_exhausted");
  });

  it("manual scenario — parser handles OL/exception/Y, AI fills F=+2 and H/2=+3", async () => {
    // Simulate the agreed split: parser already resolved OL (with exception)
    // and Y. AI should fill grade3 (F) and grade2 (H/2 back).
    invokeMock.mockResolvedValue({
      data: { patch: { grade3: 2, grade2: 3 } },
      error: null,
    });
    const res = await fetchAiGradeProposal({
      narrationText:
        "All of the offensive line should get a one except for the right tackle who get a two the Y should get a three and the F should get a two and the two back should get a three",
      parserPatch: {
        gradeLT: 1, gradeLG: 1, gradeC: 1, gradeRG: 1, gradeRT: 2, gradeY: 3,
      },
      unresolvedFields: ["gradeX", "grade1", "grade2", "grade3", "grade4"],
      positionAliases: { pos3: "F", pos2: "H" },
    });
    expect(res.patch).toEqual({ grade3: 2, grade2: 3 });
    expect(res.conflicts).toEqual([]);
  });
});
