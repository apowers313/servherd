import { describe, it, expect } from "vitest";
import { generateName } from "../../../src/utils/names.js";

describe("generateName", () => {
  it("should generate adjective-noun format", () => {
    const name = generateName();
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("should avoid existing names when provided", () => {
    const existing = new Set(["brave-tiger", "calm-panda"]);
    const name = generateName(existing);
    expect(existing.has(name)).toBe(false);
  });

  it("should generate unique names on consecutive calls", () => {
    const names = new Set<string>();
    // Generate multiple names to test uniqueness
    for (let i = 0; i < 10; i++) {
      const name = generateName(names);
      expect(names.has(name)).toBe(false);
      names.add(name);
    }
    expect(names.size).toBe(10);
  });

  it("should return a non-empty string", () => {
    const name = generateName();
    expect(name.length).toBeGreaterThan(0);
  });

  it("should contain only lowercase letters and hyphens", () => {
    const name = generateName();
    expect(name).toMatch(/^[a-z-]+$/);
  });
});
