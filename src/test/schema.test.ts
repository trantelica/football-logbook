import { describe, it, expect } from "vitest";
import { getFieldDef } from "@/engine/schema";

describe("schema metadata: Pass 2 skill slot outputLabels (CDC-2)", () => {
  it("pos1..pos4 outputLabel matches canonical 1..4", () => {
    expect(getFieldDef("pos1")?.outputLabel).toBe("1");
    expect(getFieldDef("pos2")?.outputLabel).toBe("2");
    expect(getFieldDef("pos3")?.outputLabel).toBe("3");
    expect(getFieldDef("pos4")?.outputLabel).toBe("4");
  });
});
