import { describe, it, expect } from "vitest";
import { GlobalConfigSchema, DEFAULT_CONFIG, type GlobalConfig } from "../../../src/types/config.js";

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

describe("DEFAULT_CONFIG", () => {
  // Regression test: default hostname must be 0.0.0.0 to avoid IPv4/IPv6 issues
  // When Node.js resolves 'localhost', it may prefer IPv6 (::1) over IPv4 (127.0.0.1).
  // This causes connection failures when vite binds to ::1 but fetch() connects to 127.0.0.1.
  // Using 0.0.0.0 ensures the server listens on all interfaces, avoiding this mismatch.
  it("should have 0.0.0.0 as default hostname to avoid IPv4/IPv6 issues", () => {
    expect(DEFAULT_CONFIG.hostname).toBe("0.0.0.0");
  });
});
