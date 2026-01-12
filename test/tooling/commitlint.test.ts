import { describe, it, expect } from "vitest";
import lint from "@commitlint/lint";
import config from "../../commitlint.config.js";

describe("commitlint rules", () => {
  it("should accept valid conventional commit", async () => {
    const result = await lint("feat(cli): add json output flag", config.rules);
    expect(result.valid).toBe(true);
  });

  it("should accept valid conventional commit without scope", async () => {
    const result = await lint("feat: add json output flag", config.rules);
    expect(result.valid).toBe(true);
  });

  it("should reject missing type", async () => {
    const result = await lint("add json output flag", config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "type-empty")).toBe(true);
  });

  it("should reject invalid type", async () => {
    const result = await lint("invalid(cli): add feature", config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "type-enum")).toBe(true);
  });

  it("should reject invalid scope", async () => {
    const result = await lint("feat(invalid): add feature", config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "scope-enum")).toBe(true);
  });

  it("should accept all defined scopes", async () => {
    const scopes = ["cli", "mcp", "services", "types", "utils", "test", "ci", "docs", "deps"];
    for (const scope of scopes) {
      const result = await lint(`feat(${scope}): test`, config.rules);
      expect(result.valid).toBe(true);
    }
  });

  it("should accept all defined types", async () => {
    const types = [
      "build",
      "chore",
      "ci",
      "docs",
      "feat",
      "fix",
      "perf",
      "refactor",
      "revert",
      "style",
      "test",
    ];
    for (const type of types) {
      const result = await lint(`${type}: test`, config.rules);
      expect(result.valid).toBe(true);
    }
  });

  it("should reject uppercase type", async () => {
    const result = await lint("FEAT(cli): add feature", config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "type-case")).toBe(true);
  });

  it("should reject uppercase scope", async () => {
    const result = await lint("feat(CLI): add feature", config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "scope-case")).toBe(true);
  });

  it("should reject empty subject", async () => {
    const result = await lint("feat:", config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "subject-empty")).toBe(true);
  });

  it("should reject subject ending with period", async () => {
    const result = await lint("feat: add feature.", config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "subject-full-stop")).toBe(true);
  });

  it("should reject header longer than 100 characters", async () => {
    const longSubject = "a".repeat(101);
    const result = await lint(`feat: ${longSubject}`, config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "header-max-length")).toBe(true);
  });

  it("should accept commit with body", async () => {
    const message = `feat(cli): add json output flag

This adds a --json flag to all commands that outputs results in JSON format.`;
    const result = await lint(message, config.rules);
    expect(result.valid).toBe(true);
  });

  it("should warn when body is not preceded by blank line", async () => {
    const message = `feat(cli): add json output flag
This adds a --json flag to all commands.`;
    const result = await lint(message, config.rules);
    // This should have a warning, not an error (level 1 vs level 2)
    expect(result.warnings.some((w) => w.name === "body-leading-blank")).toBe(true);
  });

  it("should reject body line longer than 100 characters", async () => {
    const longLine = "a".repeat(101);
    const message = `feat(cli): add json output flag

${longLine}`;
    const result = await lint(message, config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "body-max-line-length")).toBe(true);
  });

  it("should accept commit with footer", async () => {
    const message = `feat(cli): add json output flag

This adds a --json flag to all commands.

BREAKING CHANGE: changes output format`;
    const result = await lint(message, config.rules);
    expect(result.valid).toBe(true);
  });

  it("should reject sentence-case subject", async () => {
    const result = await lint("feat: Add json output flag", config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "subject-case")).toBe(true);
  });

  it("should reject start-case subject", async () => {
    const result = await lint("feat: Add Json Output Flag", config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "subject-case")).toBe(true);
  });

  it("should reject pascal-case subject", async () => {
    const result = await lint("feat: AddJsonOutputFlag", config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "subject-case")).toBe(true);
  });

  it("should reject upper-case subject", async () => {
    const result = await lint("feat: ADD JSON OUTPUT FLAG", config.rules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === "subject-case")).toBe(true);
  });
});
