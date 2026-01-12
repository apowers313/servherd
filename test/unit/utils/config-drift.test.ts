import { describe, it, expect } from "vitest";
import {
  extractUsedConfigKeys,
  createConfigSnapshot,
  detectDrift,
  findServersUsingConfigKey,
  findServersWithDrift,
  formatDrift,
} from "../../../src/utils/config-drift.js";
import type { GlobalConfig } from "../../../src/types/config.js";
import type { ServerEntry } from "../../../src/types/registry.js";

describe("config-drift", () => {
  const baseConfig: GlobalConfig = {
    version: "1",
    hostname: "localhost",
    protocol: "http",
    portRange: { min: 3000, max: 9999 },
    tempDir: "/tmp/servherd",
    pm2: { logDir: "/tmp/servherd/logs", pidDir: "/tmp/servherd/pids" },
    httpsCert: "/path/to/cert.pem",
    httpsKey: "/path/to/key.pem",
    refreshOnChange: "on-start",
  };

  const createServer = (overrides: Partial<ServerEntry> = {}): ServerEntry => ({
    id: "test-id",
    name: "test-server",
    command: "node server.js",
    resolvedCommand: "node server.js",
    cwd: "/test",
    port: 3000,
    protocol: "http",
    hostname: "localhost",
    env: {},
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-test-server",
    ...overrides,
  });

  describe("extractUsedConfigKeys", () => {
    it("should extract hostname config key from {{hostname}}", () => {
      const keys = extractUsedConfigKeys("node server.js --host {{hostname}}");
      expect(keys).toEqual(["hostname"]);
    });

    it("should extract httpsCert config key from {{https-cert}}", () => {
      const keys = extractUsedConfigKeys("node server.js --cert {{https-cert}}");
      expect(keys).toEqual(["httpsCert"]);
    });

    it("should extract httpsKey config key from {{https-key}}", () => {
      const keys = extractUsedConfigKeys("node server.js --key {{https-key}}");
      expect(keys).toEqual(["httpsKey"]);
    });

    it("should extract multiple config keys", () => {
      const keys = extractUsedConfigKeys("node server.js --cert {{https-cert}} --key {{https-key}}");
      expect(keys).toContain("httpsCert");
      expect(keys).toContain("httpsKey");
    });

    it("should not include non-configurable variables like port", () => {
      const keys = extractUsedConfigKeys("node server.js --port {{port}}");
      expect(keys).toEqual([]);
    });

    it("should deduplicate config keys", () => {
      const keys = extractUsedConfigKeys("{{hostname}} {{hostname}} {{hostname}}");
      expect(keys).toEqual(["hostname"]);
    });

    it("should return empty array for command with no template variables", () => {
      const keys = extractUsedConfigKeys("node server.js");
      expect(keys).toEqual([]);
    });
  });

  describe("createConfigSnapshot", () => {
    it("should create snapshot with hostname", () => {
      const snapshot = createConfigSnapshot(baseConfig, ["hostname"]);
      expect(snapshot).toEqual({ hostname: "localhost" });
    });

    it("should create snapshot with httpsCert", () => {
      const snapshot = createConfigSnapshot(baseConfig, ["httpsCert"]);
      expect(snapshot).toEqual({ httpsCert: "/path/to/cert.pem" });
    });

    it("should create snapshot with multiple keys", () => {
      const snapshot = createConfigSnapshot(baseConfig, ["hostname", "httpsCert", "httpsKey"]);
      expect(snapshot).toEqual({
        hostname: "localhost",
        httpsCert: "/path/to/cert.pem",
        httpsKey: "/path/to/key.pem",
      });
    });

    it("should handle empty used keys", () => {
      const snapshot = createConfigSnapshot(baseConfig, []);
      expect(snapshot).toEqual({});
    });

    it("should handle undefined config values", () => {
      const configWithoutCert = { ...baseConfig, httpsCert: undefined };
      const snapshot = createConfigSnapshot(configWithoutCert, ["httpsCert"]);
      expect(snapshot).toEqual({ httpsCert: undefined });
    });
  });

  describe("detectDrift", () => {
    it("should detect no drift when config unchanged", () => {
      const server = createServer({
        command: "node server.js --host {{hostname}}",
        usedConfigKeys: ["hostname"],
        configSnapshot: { hostname: "localhost" },
      });

      const result = detectDrift(server, baseConfig);

      expect(result.hasDrift).toBe(false);
      expect(result.driftedValues).toEqual([]);
    });

    it("should detect hostname drift", () => {
      const server = createServer({
        command: "node server.js --host {{hostname}}",
        usedConfigKeys: ["hostname"],
        configSnapshot: { hostname: "oldhost" },
      });

      const result = detectDrift(server, baseConfig);

      expect(result.hasDrift).toBe(true);
      expect(result.driftedValues).toHaveLength(1);
      expect(result.driftedValues[0]).toEqual({
        configKey: "hostname",
        templateVar: "hostname",
        startedWith: "oldhost",
        currentValue: "localhost",
      });
    });

    it("should detect httpsCert drift", () => {
      const server = createServer({
        command: "node server.js --cert {{https-cert}}",
        usedConfigKeys: ["httpsCert"],
        configSnapshot: { httpsCert: "/old/cert.pem" },
      });

      const result = detectDrift(server, baseConfig);

      expect(result.hasDrift).toBe(true);
      expect(result.driftedValues[0].configKey).toBe("httpsCert");
      expect(result.driftedValues[0].startedWith).toBe("/old/cert.pem");
      expect(result.driftedValues[0].currentValue).toBe("/path/to/cert.pem");
    });

    it("should detect multiple drifts", () => {
      const server = createServer({
        command: "node server.js --cert {{https-cert}} --key {{https-key}}",
        usedConfigKeys: ["httpsCert", "httpsKey"],
        configSnapshot: { httpsCert: "/old/cert.pem", httpsKey: "/old/key.pem" },
      });

      const result = detectDrift(server, baseConfig);

      expect(result.hasDrift).toBe(true);
      expect(result.driftedValues).toHaveLength(2);
    });

    it("should return no drift if no snapshot exists", () => {
      const server = createServer({
        command: "node server.js --host {{hostname}}",
        usedConfigKeys: undefined,
        configSnapshot: undefined,
      });

      const result = detectDrift(server, baseConfig);

      expect(result.hasDrift).toBe(false);
    });

    it("should detect drift from undefined to defined value", () => {
      const server = createServer({
        command: "node server.js --cert {{https-cert}}",
        usedConfigKeys: ["httpsCert"],
        configSnapshot: { httpsCert: undefined },
      });

      const result = detectDrift(server, baseConfig);

      expect(result.hasDrift).toBe(true);
      expect(result.driftedValues[0].startedWith).toBeUndefined();
      expect(result.driftedValues[0].currentValue).toBe("/path/to/cert.pem");
    });
  });

  describe("findServersUsingConfigKey", () => {
    it("should find servers using a specific config key", () => {
      const servers = [
        createServer({ name: "server1", usedConfigKeys: ["hostname"] }),
        createServer({ name: "server2", usedConfigKeys: ["httpsCert"] }),
        createServer({ name: "server3", usedConfigKeys: ["hostname", "httpsCert"] }),
      ];

      const result = findServersUsingConfigKey(servers, "hostname");

      expect(result).toHaveLength(2);
      expect(result.map(s => s.name)).toContain("server1");
      expect(result.map(s => s.name)).toContain("server3");
    });

    it("should return empty array if no servers use the key", () => {
      const servers = [
        createServer({ name: "server1", usedConfigKeys: ["hostname"] }),
      ];

      const result = findServersUsingConfigKey(servers, "httpsCert");

      expect(result).toEqual([]);
    });

    it("should handle servers without usedConfigKeys", () => {
      const servers = [
        createServer({ name: "server1", usedConfigKeys: undefined }),
        createServer({ name: "server2", usedConfigKeys: ["hostname"] }),
      ];

      const result = findServersUsingConfigKey(servers, "hostname");

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("server2");
    });
  });

  describe("findServersWithDrift", () => {
    it("should find servers with config drift", () => {
      const servers = [
        createServer({
          name: "server1",
          usedConfigKeys: ["hostname"],
          configSnapshot: { hostname: "oldhost" },
        }),
        createServer({
          name: "server2",
          usedConfigKeys: ["hostname"],
          configSnapshot: { hostname: "localhost" }, // No drift
        }),
      ];

      const result = findServersWithDrift(servers, baseConfig);

      expect(result).toHaveLength(1);
      expect(result[0].server.name).toBe("server1");
      expect(result[0].drift.hasDrift).toBe(true);
    });

    it("should return empty array if no servers have drift", () => {
      const servers = [
        createServer({
          name: "server1",
          usedConfigKeys: ["hostname"],
          configSnapshot: { hostname: "localhost" },
        }),
      ];

      const result = findServersWithDrift(servers, baseConfig);

      expect(result).toEqual([]);
    });
  });

  describe("formatDrift", () => {
    it("should format no drift message", () => {
      const result = formatDrift({ hasDrift: false, driftedValues: [] });
      expect(result).toBe("No config drift");
    });

    it("should format single drift", () => {
      const result = formatDrift({
        hasDrift: true,
        driftedValues: [{
          configKey: "hostname",
          templateVar: "hostname",
          startedWith: "oldhost",
          currentValue: "newhost",
        }],
      });

      expect(result).toContain("Config drift detected");
      expect(result).toContain("hostname");
      expect(result).toContain("oldhost");
      expect(result).toContain("newhost");
    });

    it("should format undefined values as (not set)", () => {
      const result = formatDrift({
        hasDrift: true,
        driftedValues: [{
          configKey: "httpsCert",
          templateVar: "https-cert",
          startedWith: undefined,
          currentValue: "/path/cert.pem",
        }],
      });

      expect(result).toContain("(not set)");
    });
  });
});
