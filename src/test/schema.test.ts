import { describe, it, expect } from "vitest";
import { getFieldDef, LOOKUP_DEPENDENT_ATTRS } from "@/engine/schema";

describe("schema metadata: Pass 2 skill slot outputLabels (CDC-2)", () => {
  it("pos1..pos4 outputLabel matches canonical 1..4", () => {
    expect(getFieldDef("pos1")?.outputLabel).toBe("1");
    expect(getFieldDef("pos2")?.outputLabel).toBe("2");
    expect(getFieldDef("pos3")?.outputLabel).toBe("3");
    expect(getFieldDef("pos4")?.outputLabel).toBe("4");
  });
});

describe("schema metadata: personnel allowed values include '10'", () => {
  it("personnel field allowedValues contains '10'", () => {
    const def = getFieldDef("personnel");
    expect(def?.allowedValues).toContain("10");
  });

  it("LOOKUP_DEPENDENT_ATTRS offForm.personnel allowedValues contains '10'", () => {
    const personnelAttr = LOOKUP_DEPENDENT_ATTRS.offForm.find(
      (a) => a.name === "personnel",
    );
    expect(personnelAttr?.allowedValues).toContain("10");
  });
});
