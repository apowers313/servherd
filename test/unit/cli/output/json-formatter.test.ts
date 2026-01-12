import { describe, it, expect } from "vitest";
import { formatAsJson, formatErrorAsJson } from "../../../../src/cli/output/json-formatter.js";
import { ServherdError, ServherdErrorCode } from "../../../../src/types/errors.js";

describe("json-formatter", () => {
  describe("formatAsJson", () => {
    it("should output valid JSON", () => {
      const data = { servers: [{ name: "test", status: "online" }] };
      const result = formatAsJson(data);

      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("should wrap data with success flag", () => {
      const data = { name: "test-server" };
      const result = formatAsJson(data);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(data);
      expect(parsed.error).toBeUndefined();
    });

    it("should handle array data", () => {
      const data = [{ name: "server1" }, { name: "server2" }];
      const result = formatAsJson(data);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toHaveLength(2);
    });

    it("should handle nested objects", () => {
      const data = {
        server: {
          name: "test",
          config: {
            port: 3000,
            protocol: "http",
          },
        },
      };
      const result = formatAsJson(data);
      const parsed = JSON.parse(result);

      expect(parsed.data.server.config.port).toBe(3000);
    });

    it("should handle null values", () => {
      const result = formatAsJson(null);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeNull();
    });

    it("should handle primitive values", () => {
      const result = formatAsJson("test-string");
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toBe("test-string");
    });
  });

  describe("formatErrorAsJson", () => {
    it("should format ServherdError with code and message", () => {
      const error = new ServherdError(
        ServherdErrorCode.SERVER_NOT_FOUND,
        "Server not found",
      );
      const result = formatErrorAsJson(error);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.data).toBeNull();
      expect(parsed.error.code).toBe("SERVER_NOT_FOUND");
      expect(parsed.error.message).toBe("Server not found");
    });

    it("should format standard Error", () => {
      const error = new Error("Something went wrong");
      const result = formatErrorAsJson(error);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.data).toBeNull();
      expect(parsed.error.code).toBe("UNKNOWN_ERROR");
      expect(parsed.error.message).toBe("Something went wrong");
    });

    it("should format string error", () => {
      const result = formatErrorAsJson("Just a string error");
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("UNKNOWN_ERROR");
      expect(parsed.error.message).toBe("Just a string error");
    });

    it("should output valid JSON", () => {
      const error = new Error("test");
      const result = formatErrorAsJson(error);

      expect(() => JSON.parse(result)).not.toThrow();
    });
  });
});
