import { describe, it, expect } from "vitest";
import { formatUptime, formatBytes } from "../../../src/utils/format.js";

describe("Shared formatting utilities", () => {
  describe("formatUptime", () => {
    it("should format seconds correctly", () => {
      expect(formatUptime(45000)).toBe("45s");
    });

    it("should format zero seconds correctly", () => {
      expect(formatUptime(0)).toBe("0s");
    });

    it("should format minutes correctly", () => {
      expect(formatUptime(125000)).toBe("2m 5s");
    });

    it("should format exact minutes correctly", () => {
      expect(formatUptime(120000)).toBe("2m 0s");
    });

    it("should format hours correctly", () => {
      expect(formatUptime(3665000)).toBe("1h 1m");
    });

    it("should format exact hours correctly", () => {
      expect(formatUptime(3600000)).toBe("1h 0m");
    });

    it("should format days correctly", () => {
      expect(formatUptime(90000000)).toBe("1d 1h");
    });

    it("should format exact days correctly", () => {
      expect(formatUptime(86400000)).toBe("1d 0h");
    });

    it("should format multiple days correctly", () => {
      expect(formatUptime(259200000)).toBe("3d 0h");
    });

    it("should handle large values", () => {
      // 7 days, 23 hours
      expect(formatUptime(691200000)).toBe("8d 0h");
    });
  });

  describe("formatBytes", () => {
    it("should format bytes", () => {
      expect(formatBytes(512)).toBe("512 B");
    });

    it("should format zero bytes", () => {
      expect(formatBytes(0)).toBe("0 B");
    });

    it("should format kilobytes", () => {
      expect(formatBytes(1536)).toBe("1.50 KB");
    });

    it("should format exact kilobytes", () => {
      expect(formatBytes(1024)).toBe("1.00 KB");
    });

    it("should format megabytes", () => {
      expect(formatBytes(1048576)).toBe("1.00 MB");
    });

    it("should format megabytes with decimals", () => {
      expect(formatBytes(1572864)).toBe("1.50 MB");
    });

    it("should format gigabytes", () => {
      expect(formatBytes(1073741824)).toBe("1.00 GB");
    });

    it("should format terabytes", () => {
      expect(formatBytes(1099511627776)).toBe("1.00 TB");
    });

    it("should handle values just under threshold", () => {
      expect(formatBytes(1023)).toBe("1023 B");
    });
  });
});
