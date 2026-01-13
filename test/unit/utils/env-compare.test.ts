/**
 * Unit tests for the hasEnvChanged utility function.
 *
 * These tests ensure the environment variable comparison logic works correctly
 * for all edge cases. This is critical for the servherd start command to properly
 * detect when a server needs to be restarted due to env var changes.
 */

import { describe, it, expect } from "vitest";
import { hasEnvChanged } from "../../../src/utils/env-compare.js";

describe("hasEnvChanged", () => {
  describe("basic comparisons", () => {
    it("should return false for two empty objects", () => {
      expect(hasEnvChanged({}, {})).toBe(false);
    });

    it("should return false for identical single key-value pairs", () => {
      expect(hasEnvChanged({ KEY: "value" }, { KEY: "value" })).toBe(false);
    });

    it("should return false for identical multiple key-value pairs", () => {
      expect(
        hasEnvChanged(
          { A: "1", B: "2", C: "3" },
          { A: "1", B: "2", C: "3" },
        ),
      ).toBe(false);
    });

    it("should return true when value changes", () => {
      expect(hasEnvChanged({ KEY: "old" }, { KEY: "new" })).toBe(true);
    });

    it("should return true when key is added", () => {
      expect(hasEnvChanged({}, { KEY: "value" })).toBe(true);
    });

    it("should return true when key is removed", () => {
      expect(hasEnvChanged({ KEY: "value" }, {})).toBe(true);
    });
  });

  describe("undefined and null handling", () => {
    it("should return false for undefined vs empty object", () => {
      expect(hasEnvChanged(undefined, {})).toBe(false);
    });

    it("should return false for empty object vs undefined", () => {
      expect(hasEnvChanged({}, undefined)).toBe(false);
    });

    it("should return false for both undefined", () => {
      expect(hasEnvChanged(undefined, undefined)).toBe(false);
    });

    it("should return true for undefined vs object with values", () => {
      expect(hasEnvChanged(undefined, { KEY: "value" })).toBe(true);
    });

    it("should return true for object with values vs undefined", () => {
      expect(hasEnvChanged({ KEY: "value" }, undefined)).toBe(true);
    });
  });

  describe("key ordering independence", () => {
    it("should return false when keys are in different order", () => {
      expect(
        hasEnvChanged(
          { A: "1", B: "2", C: "3" },
          { C: "3", A: "1", B: "2" },
        ),
      ).toBe(false);
    });

    it("should return false when keys are in reverse order", () => {
      expect(
        hasEnvChanged(
          { Z: "26", Y: "25", X: "24" },
          { X: "24", Y: "25", Z: "26" },
        ),
      ).toBe(false);
    });
  });

  describe("key count differences", () => {
    it("should return true when new env has more keys", () => {
      expect(
        hasEnvChanged(
          { A: "1" },
          { A: "1", B: "2" },
        ),
      ).toBe(true);
    });

    it("should return true when new env has fewer keys", () => {
      expect(
        hasEnvChanged(
          { A: "1", B: "2" },
          { A: "1" },
        ),
      ).toBe(true);
    });

    it("should return true when keys are completely different", () => {
      expect(
        hasEnvChanged(
          { OLD_KEY: "value" },
          { NEW_KEY: "value" },
        ),
      ).toBe(true);
    });
  });

  describe("value type edge cases", () => {
    it("should handle empty string values", () => {
      expect(hasEnvChanged({ KEY: "" }, { KEY: "" })).toBe(false);
    });

    it("should detect change from empty string to value", () => {
      expect(hasEnvChanged({ KEY: "" }, { KEY: "value" })).toBe(true);
    });

    it("should detect change from value to empty string", () => {
      expect(hasEnvChanged({ KEY: "value" }, { KEY: "" })).toBe(true);
    });

    it("should handle whitespace-only values", () => {
      expect(hasEnvChanged({ KEY: "   " }, { KEY: "   " })).toBe(false);
    });

    it("should detect whitespace differences", () => {
      expect(hasEnvChanged({ KEY: "value" }, { KEY: " value" })).toBe(true);
    });
  });

  describe("special characters in values", () => {
    it("should handle equals signs in values", () => {
      expect(
        hasEnvChanged(
          { KEY: "a=b=c" },
          { KEY: "a=b=c" },
        ),
      ).toBe(false);
    });

    it("should handle newlines in values", () => {
      expect(
        hasEnvChanged(
          { KEY: "line1\nline2" },
          { KEY: "line1\nline2" },
        ),
      ).toBe(false);
    });

    it("should handle JSON strings in values", () => {
      const json = "{\"nested\": \"value\"}";
      expect(hasEnvChanged({ KEY: json }, { KEY: json })).toBe(false);
    });

    it("should handle URLs in values", () => {
      const url = "https://user:pass@host.com:8080/path?query=1&other=2";
      expect(hasEnvChanged({ URL: url }, { URL: url })).toBe(false);
    });

    it("should handle unicode in values", () => {
      expect(hasEnvChanged({ KEY: "日本語" }, { KEY: "日本語" })).toBe(false);
    });

    it("should handle emoji in values", () => {
      expect(hasEnvChanged({ KEY: "🚀🎉" }, { KEY: "🚀🎉" })).toBe(false);
    });
  });

  describe("special characters in keys", () => {
    it("should handle underscore keys", () => {
      expect(
        hasEnvChanged(
          { MY_ENV_VAR: "value" },
          { MY_ENV_VAR: "value" },
        ),
      ).toBe(false);
    });

    it("should handle numeric suffixes in keys", () => {
      expect(
        hasEnvChanged(
          { VAR1: "a", VAR2: "b" },
          { VAR1: "a", VAR2: "b" },
        ),
      ).toBe(false);
    });
  });

  describe("real-world scenarios", () => {
    it("should detect API URL change", () => {
      expect(
        hasEnvChanged(
          { API_URL: "http://localhost:3000" },
          { API_URL: "http://localhost:4000" },
        ),
      ).toBe(true);
    });

    it("should detect debug flag change", () => {
      expect(
        hasEnvChanged(
          { DEBUG: "false" },
          { DEBUG: "true" },
        ),
      ).toBe(true);
    });

    it("should detect addition of new config", () => {
      expect(
        hasEnvChanged(
          { NODE_ENV: "development" },
          { NODE_ENV: "development", LOG_LEVEL: "debug" },
        ),
      ).toBe(true);
    });

    it("should handle typical web app env vars", () => {
      const oldEnv = {
        NODE_ENV: "development",
        PORT: "3000",
        DATABASE_URL: "postgres://localhost:5432/db",
        REDIS_URL: "redis://localhost:6379",
        SECRET_KEY: "abc123",
      };
      const newEnv = {
        NODE_ENV: "development",
        PORT: "3000",
        DATABASE_URL: "postgres://localhost:5432/db",
        REDIS_URL: "redis://localhost:6379",
        SECRET_KEY: "abc123",
      };
      expect(hasEnvChanged(oldEnv, newEnv)).toBe(false);
    });

    it("should detect database URL change in typical web app", () => {
      const oldEnv = {
        NODE_ENV: "development",
        DATABASE_URL: "postgres://localhost:5432/dev_db",
      };
      const newEnv = {
        NODE_ENV: "development",
        DATABASE_URL: "postgres://localhost:5432/test_db",
      };
      expect(hasEnvChanged(oldEnv, newEnv)).toBe(true);
    });
  });

  describe("boundary cases", () => {
    it("should handle very long values", () => {
      const longValue = "x".repeat(10000);
      expect(
        hasEnvChanged(
          { KEY: longValue },
          { KEY: longValue },
        ),
      ).toBe(false);
    });

    it("should handle many keys", () => {
      const manyKeys: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        manyKeys[`KEY_${i}`] = `value_${i}`;
      }
      expect(hasEnvChanged(manyKeys, { ...manyKeys })).toBe(false);
    });

    it("should detect single changed value in many keys", () => {
      const manyKeys: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        manyKeys[`KEY_${i}`] = `value_${i}`;
      }
      const modified = { ...manyKeys, KEY_50: "changed" };
      expect(hasEnvChanged(manyKeys, modified)).toBe(true);
    });
  });

  describe("case sensitivity", () => {
    it("should treat different case keys as different", () => {
      expect(
        hasEnvChanged(
          { key: "value" },
          { KEY: "value" },
        ),
      ).toBe(true);
    });

    it("should treat different case values as different", () => {
      expect(
        hasEnvChanged(
          { KEY: "Value" },
          { KEY: "value" },
        ),
      ).toBe(true);
    });
  });
});
