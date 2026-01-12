import { describe, it, expect } from "vitest";
import { ServherdError, ServherdErrorCode } from "../../../src/types/errors.js";
import {
  wrapError,
  assertServherd,
  tryAsync,
} from "../../../src/utils/error-handler.js";

describe("error-handler utilities", () => {
  describe("wrapError", () => {
    it("should return ServherdError unchanged", () => {
      const original = new ServherdError(
        ServherdErrorCode.SERVER_NOT_FOUND,
        "Not found",
      );
      const wrapped = wrapError(original, ServherdErrorCode.UNKNOWN_ERROR);
      expect(wrapped).toBe(original);
    });

    it("should wrap regular Error with provided code", () => {
      const original = new Error("Something went wrong");
      const wrapped = wrapError(original, ServherdErrorCode.PM2_START_FAILED);
      expect(wrapped).toBeInstanceOf(ServherdError);
      expect(wrapped.code).toBe(ServherdErrorCode.PM2_START_FAILED);
      expect(wrapped.message).toBe("Something went wrong");
    });

    it("should use custom message when provided", () => {
      const original = new Error("Original message");
      const wrapped = wrapError(
        original,
        ServherdErrorCode.PM2_START_FAILED,
        "Custom message",
      );
      expect(wrapped.message).toBe("Custom message");
    });

    it("should wrap non-Error values", () => {
      const wrapped = wrapError(
        "string error",
        ServherdErrorCode.UNKNOWN_ERROR,
      );
      expect(wrapped).toBeInstanceOf(ServherdError);
      expect(wrapped.message).toBe("string error");
    });

    it("should include cause in details for Error", () => {
      const original = new Error("Original error");
      const wrapped = wrapError(original, ServherdErrorCode.PM2_START_FAILED);
      expect(wrapped.details?.cause).toBe(original);
    });
  });

  describe("assertServherd", () => {
    it("should not throw when condition is true", () => {
      expect(() => {
        assertServherd(
          true,
          ServherdErrorCode.SERVER_NOT_FOUND,
          "Should not throw",
        );
      }).not.toThrow();
    });

    it("should throw ServherdError when condition is false", () => {
      expect(() => {
        assertServherd(
          false,
          ServherdErrorCode.SERVER_NOT_FOUND,
          "Server not found",
        );
      }).toThrow(ServherdError);
    });

    it("should include correct code and message", () => {
      try {
        assertServherd(
          false,
          ServherdErrorCode.PORT_UNAVAILABLE,
          "Port 3000 is in use",
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ServherdError);
        const servherdError = error as ServherdError;
        expect(servherdError.code).toBe(ServherdErrorCode.PORT_UNAVAILABLE);
        expect(servherdError.message).toBe("Port 3000 is in use");
      }
    });

    it("should treat truthy values as true", () => {
      expect(() => {
        assertServherd(1, ServherdErrorCode.SERVER_NOT_FOUND, "Message");
        assertServherd("string", ServherdErrorCode.SERVER_NOT_FOUND, "Message");
        assertServherd({}, ServherdErrorCode.SERVER_NOT_FOUND, "Message");
      }).not.toThrow();
    });

    it("should treat falsy values as false", () => {
      expect(() => {
        assertServherd(0, ServherdErrorCode.SERVER_NOT_FOUND, "Message");
      }).toThrow(ServherdError);

      expect(() => {
        assertServherd("", ServherdErrorCode.SERVER_NOT_FOUND, "Message");
      }).toThrow(ServherdError);

      expect(() => {
        assertServherd(null, ServherdErrorCode.SERVER_NOT_FOUND, "Message");
      }).toThrow(ServherdError);

      expect(() => {
        assertServherd(undefined, ServherdErrorCode.SERVER_NOT_FOUND, "Message");
      }).toThrow(ServherdError);
    });
  });

  describe("tryAsync", () => {
    it("should return success result for successful function", async () => {
      const result = await tryAsync(async () => "success value");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe("success value");
      }
    });

    it("should return failure result for throwing function", async () => {
      const result = await tryAsync(async () => {
        throw new Error("Something failed");
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ServherdError);
        expect(result.error.message).toBe("Something failed");
      }
    });

    it("should wrap ServherdError correctly", async () => {
      const result = await tryAsync(async () => {
        throw new ServherdError(
          ServherdErrorCode.SERVER_NOT_FOUND,
          "Server not found",
        );
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ServherdErrorCode.SERVER_NOT_FOUND);
      }
    });

    it("should handle non-Error throws", async () => {
      const result = await tryAsync(async () => {
        throw "string error";
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ServherdError);
        expect(result.error.code).toBe(ServherdErrorCode.UNKNOWN_ERROR);
      }
    });
  });
});
