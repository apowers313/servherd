import { describe, it, expect } from "vitest";
import { generateName, generateDeterministicName, normalizeForHash } from "../../../src/utils/names.js";

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

  it("should fallback to timestamp suffix when max attempts exhausted", () => {
    // Create a mock Set that always claims to have any name
    const alwaysHas = {
      has: () => true,
      size: 0,
      [Symbol.iterator]: function* () {},
      add: () => alwaysHas,
      clear: () => {},
      delete: () => false,
      forEach: () => {},
      entries: function* () {},
      keys: function* () {},
      values: function* () {},
    } as Set<string>;

    // With maxAttempts=1, it will immediately fallback to timestamp suffix
    const name = generateName(alwaysHas, 1);
    // Name should have format: adjective-noun-XXXX (4 char timestamp suffix)
    expect(name).toMatch(/^[a-z]+-[a-z]+-[a-z0-9]{4}$/);
  });
});

describe("normalizeForHash", () => {
  it("should normalize command whitespace", () => {
    const result1 = normalizeForHash("  npm  start  ");
    const result2 = normalizeForHash("npm start");
    expect(result1).toBe(result2);
  });

  it("should collapse multiple spaces to single space", () => {
    const result = normalizeForHash("npm    run    dev");
    expect(result).toBe("npm run dev");
  });

  it("should produce same result for undefined and empty env", () => {
    const result1 = normalizeForHash("npm start", undefined);
    const result2 = normalizeForHash("npm start", {});
    expect(result1).toBe(result2);
  });

  it("should include env in hash input", () => {
    const withoutEnv = normalizeForHash("npm start");
    const withEnv = normalizeForHash("npm start", { NODE_ENV: "dev" });
    expect(withoutEnv).not.toBe(withEnv);
  });

  it("should sort env keys for consistent hashing", () => {
    const result1 = normalizeForHash("npm start", { A: "1", B: "2", C: "3" });
    const result2 = normalizeForHash("npm start", { C: "3", A: "1", B: "2" });
    expect(result1).toBe(result2);
  });

  it("should differentiate by env values", () => {
    const result1 = normalizeForHash("npm start", { NODE_ENV: "dev" });
    const result2 = normalizeForHash("npm start", { NODE_ENV: "prod" });
    expect(result1).not.toBe(result2);
  });
});

describe("generateDeterministicName", () => {
  it("should return same name for same command", () => {
    const name1 = generateDeterministicName("npm start");
    const name2 = generateDeterministicName("npm start");
    expect(name1).toBe(name2);
  });

  it("should return same name for same command + env", () => {
    const name1 = generateDeterministicName("npm start", { NODE_ENV: "dev" });
    const name2 = generateDeterministicName("npm start", { NODE_ENV: "dev" });
    expect(name1).toBe(name2);
  });

  it("should return different name for different command", () => {
    const name1 = generateDeterministicName("npm start");
    const name2 = generateDeterministicName("npm run dev");
    expect(name1).not.toBe(name2);
  });

  it("should return different name for different env", () => {
    const name1 = generateDeterministicName("npm start", { NODE_ENV: "dev" });
    const name2 = generateDeterministicName("npm start", { NODE_ENV: "prod" });
    expect(name1).not.toBe(name2);
  });

  it("should return different name when env is added", () => {
    const name1 = generateDeterministicName("npm start");
    const name2 = generateDeterministicName("npm start", { FOO: "bar" });
    expect(name1).not.toBe(name2);
  });

  it("should generate adjective-noun format", () => {
    const name = generateDeterministicName("npm start");
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("should handle whitespace normalization", () => {
    const name1 = generateDeterministicName("npm  start");
    const name2 = generateDeterministicName("npm start");
    expect(name1).toBe(name2);
  });

  it("should handle env key ordering", () => {
    const name1 = generateDeterministicName("npm start", { A: "1", B: "2" });
    const name2 = generateDeterministicName("npm start", { B: "2", A: "1" });
    expect(name1).toBe(name2);
  });

  it("should treat undefined env same as empty env", () => {
    const name1 = generateDeterministicName("npm start", undefined);
    const name2 = generateDeterministicName("npm start", {});
    expect(name1).toBe(name2);
  });
});
