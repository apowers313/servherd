import { describe, it, expect } from "vitest";
import { GlobalConfigSchema, type GlobalConfig } from "../../../src/types/config.js";

describe("GlobalConfigSchema", () => {
  const validConfig: GlobalConfig = {
    version: "1",
    hostname: "localhost",
    protocol: "http",
    portRange: { min: 3000, max: 9999 },
    tempDir: "/tmp/servherd",
    pm2: { logDir: "/tmp/logs", pidDir: "/tmp/pids" },
  };

  it("should validate a complete valid config", () => {
    expect(() => GlobalConfigSchema.parse(validConfig)).not.toThrow();
  });

  it("should reject invalid port ranges (min > max)", () => {
    const config = { ...validConfig, portRange: { min: 9999, max: 3000 } };
    expect(() => GlobalConfigSchema.parse(config)).toThrow();
  });

  it("should reject invalid protocol values", () => {
    const config = { ...validConfig, protocol: "ftp" };
    expect(() => GlobalConfigSchema.parse(config)).toThrow();
  });

  it("should reject negative port numbers", () => {
    const config = { ...validConfig, portRange: { min: -1, max: 9999 } };
    expect(() => GlobalConfigSchema.parse(config)).toThrow();
  });

  it("should reject port numbers exceeding 65535", () => {
    const config = { ...validConfig, portRange: { min: 3000, max: 70000 } };
    expect(() => GlobalConfigSchema.parse(config)).toThrow();
  });

  it("should accept https protocol", () => {
    const config = { ...validConfig, protocol: "https" };
    expect(() => GlobalConfigSchema.parse(config)).not.toThrow();
  });

  it("should accept valid config with all required fields", () => {
    const result = GlobalConfigSchema.parse(validConfig);
    expect(result.hostname).toBe("localhost");
    expect(result.protocol).toBe("http");
    expect(result.portRange.min).toBe(3000);
    expect(result.portRange.max).toBe(9999);
  });
});
