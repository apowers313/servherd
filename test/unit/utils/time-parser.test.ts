import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseTimeFilter,
  filterLogsByTime,
} from "../../../src/utils/time-parser.js";
import { ServherdError } from "../../../src/types/errors.js";

describe("time-parser", () => {
  describe("parseTimeFilter", () => {
    beforeEach(() => {
      // Fix the current time for predictable tests
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe("duration format", () => {
      it("should parse seconds duration", () => {
        const date = parseTimeFilter("30s");
        expect(date.toISOString()).toBe("2024-06-15T11:59:30.000Z");
      });

      it("should parse minutes duration", () => {
        const date = parseTimeFilter("30m");
        expect(date.toISOString()).toBe("2024-06-15T11:30:00.000Z");
      });

      it("should parse hours duration", () => {
        const date = parseTimeFilter("1h");
        expect(date.toISOString()).toBe("2024-06-15T11:00:00.000Z");
      });

      it("should parse days duration", () => {
        const date = parseTimeFilter("2d");
        expect(date.toISOString()).toBe("2024-06-13T12:00:00.000Z");
      });

      it("should parse weeks duration", () => {
        const date = parseTimeFilter("1w");
        expect(date.toISOString()).toBe("2024-06-08T12:00:00.000Z");
      });

      it("should parse large numeric values", () => {
        const date = parseTimeFilter("120m");
        expect(date.toISOString()).toBe("2024-06-15T10:00:00.000Z");
      });
    });

    describe("ISO date format", () => {
      it("should parse ISO date strings", () => {
        const date = parseTimeFilter("2024-01-15");
        expect(date.toISOString()).toContain("2024-01-15");
      });

      it("should parse ISO datetime strings", () => {
        // Use UTC timezone explicitly for predictable results
        const date = parseTimeFilter("2024-01-15T10:30:00Z");
        expect(date.getUTCHours()).toBe(10);
        expect(date.getUTCMinutes()).toBe(30);
      });

      it("should parse ISO datetime strings without timezone (local)", () => {
        const date = parseTimeFilter("2024-01-15T10:30:00");
        // Without timezone, it's parsed as local time - just check it parses
        expect(date).toBeInstanceOf(Date);
        expect(isNaN(date.getTime())).toBe(false);
      });

      it("should parse ISO datetime with timezone", () => {
        const date = parseTimeFilter("2024-01-15T10:30:00Z");
        expect(date.getUTCHours()).toBe(10);
        expect(date.getUTCMinutes()).toBe(30);
      });
    });

    describe("invalid formats", () => {
      it("should throw on invalid format", () => {
        expect(() => parseTimeFilter("invalid")).toThrow(ServherdError);
      });

      it("should throw on empty string", () => {
        expect(() => parseTimeFilter("")).toThrow(ServherdError);
      });

      it("should throw on invalid duration unit", () => {
        expect(() => parseTimeFilter("10x")).toThrow(ServherdError);
      });

      it("should throw error with helpful message", () => {
        try {
          parseTimeFilter("bad");
        } catch (error) {
          expect(error).toBeInstanceOf(ServherdError);
          if (error instanceof ServherdError) {
            expect(error.message).toContain("Invalid time format");
            expect(error.message).toContain("duration (1h, 30m)");
            expect(error.message).toContain("ISO date");
          }
        }
      });
    });
  });

  describe("filterLogsByTime", () => {
    const sampleLogs = [
      "2024-06-15T11:00:00.000Z - old log entry",
      "2024-06-15T11:30:00.000Z - middle log entry",
      "2024-06-15T11:45:00.000Z - recent log entry",
      "2024-06-15T11:59:00.000Z - newest log entry",
      "no timestamp line",
    ];

    const timestampParser = (line: string): Date | null => {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
      return match ? new Date(match[1]) : null;
    };

    it("should filter logs to only include those after since date", () => {
      const since = new Date("2024-06-15T11:30:00.000Z");
      const filtered = filterLogsByTime(sampleLogs, since, timestampParser);

      expect(filtered).toContain("2024-06-15T11:30:00.000Z - middle log entry");
      expect(filtered).toContain("2024-06-15T11:45:00.000Z - recent log entry");
      expect(filtered).toContain("2024-06-15T11:59:00.000Z - newest log entry");
      expect(filtered).not.toContain("2024-06-15T11:00:00.000Z - old log entry");
    });

    it("should include lines without timestamps", () => {
      const since = new Date("2024-06-15T11:30:00.000Z");
      const filtered = filterLogsByTime(sampleLogs, since, timestampParser);

      expect(filtered).toContain("no timestamp line");
    });

    it("should return empty array when all logs are before since", () => {
      const since = new Date("2024-06-15T12:00:00.000Z");
      const filtered = filterLogsByTime(
        ["2024-06-15T10:00:00.000Z - old log"],
        since,
        timestampParser,
      );

      expect(filtered).toHaveLength(0);
    });

    it("should return all logs when since is very old", () => {
      const since = new Date("2020-01-01T00:00:00.000Z");
      const filtered = filterLogsByTime(sampleLogs, since, timestampParser);

      expect(filtered).toHaveLength(sampleLogs.length);
    });

    it("should handle empty logs array", () => {
      const since = new Date("2024-06-15T11:30:00.000Z");
      const filtered = filterLogsByTime([], since, timestampParser);

      expect(filtered).toEqual([]);
    });
  });
});
