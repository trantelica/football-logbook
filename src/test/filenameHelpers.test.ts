import { describe, it, expect } from "vitest";
import { slugify, dateStamp } from "@/engine/filenameHelpers";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("2026 Varsity")).toBe("2026-varsity");
  });

  it("removes non-alphanumeric characters", () => {
    expect(slugify("Fall '26 (JV)")).toBe("fall-26-jv");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("a - - b")).toBe("a-b");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify(" --hello-- ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});

describe("dateStamp", () => {
  it("returns YYYY-MM-DD format", () => {
    const result = dateStamp();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
