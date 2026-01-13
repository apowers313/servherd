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
      expect(keys).toContain("hostname");
      expect(keys).toContain("portRange"); // Always included as implicit dependency
    });

    it("should extract httpsCert config key from {{https-cert}}", () => {
      const keys = extractUsedConfigKeys("node server.js --cert {{https-cert}}");
      expect(keys).toContain("httpsCert");
      expect(keys).toContain("portRange"); // Always included as implicit dependency
    });

    it("should extract httpsKey config key from {{https-key}}", () => {
      const keys = extractUsedConfigKeys("node server.js --key {{https-key}}");
      expect(keys).toContain("httpsKey");
      expect(keys).toContain("portRange"); // Always included as implicit dependency
    });

    it("should extract multiple config keys", () => {
      const keys = extractUsedConfigKeys("node server.js --cert {{https-cert}} --key {{https-key}}");
      expect(keys).toContain("httpsCert");
      expect(keys).toContain("httpsKey");
      expect(keys).toContain("portRange");
    });

    it("should always include portRange as implicit dependency", () => {
      const keys = extractUsedConfigKeys("node server.js --port {{port}}");
      expect(keys).toContain("portRange");
      // port is auto-generated so no configKey for it
      expect(keys).not.toContain("port");
    });

    it("should deduplicate config keys", () => {
      const keys = extractUsedConfigKeys("{{hostname}} {{hostname}} {{hostname}}");
      expect(keys).toContain("hostname");
      expect(keys).toContain("portRange");
      // Should only have hostname once (plus portRange)
      expect(keys.filter(k => k === "hostname")).toHaveLength(1);
    });

    it("should include portRange even for command with no template variables", () => {
      const keys = extractUsedConfigKeys("node server.js");
      expect(keys).toContain("portRange");
    });

    it("should include protocol when {{url}} is used", () => {
      const keys = extractUsedConfigKeys("node server.js --url {{url}}");
      expect(keys).toContain("protocol");
      expect(keys).toContain("portRange");
    });
  });

  describe("createConfigSnapshot", () => {
    it("should create snapshot with hostname", () => {
      const snapshot = createConfigSnapshot(baseConfig, ["hostname"], "node server.js --host {{hostname}}");
      expect(snapshot.hostname).toBe("localhost");
    });

    it("should create snapshot with httpsCert", () => {
      const snapshot = createConfigSnapshot(baseConfig, ["httpsCert"], "node server.js --cert {{https-cert}}");
      expect(snapshot.httpsCert).toBe("/path/to/cert.pem");
    });

    it("should create snapshot with multiple keys", () => {
      const snapshot = createConfigSnapshot(
        baseConfig,
        ["hostname", "httpsCert", "httpsKey"],
        "node server.js --host {{hostname}} --cert {{https-cert}} --key {{https-key}}",
      );
      expect(snapshot.hostname).toBe("localhost");
      expect(snapshot.httpsCert).toBe("/path/to/cert.pem");
      expect(snapshot.httpsKey).toBe("/path/to/key.pem");
    });

    it("should handle empty used keys", () => {
      const snapshot = createConfigSnapshot(baseConfig, [], "node server.js");
      // No template vars, so no snapshot values (except custom vars which are also empty)
      expect(snapshot.hostname).toBeUndefined();
      expect(snapshot.httpsCert).toBeUndefined();
    });

    it("should handle undefined config values", () => {
      const configWithoutCert = { ...baseConfig, httpsCert: undefined };
      const snapshot = createConfigSnapshot(configWithoutCert, ["httpsCert"], "node server.js --cert {{https-cert}}");
      expect(snapshot.httpsCert).toBeUndefined();
    });

    it("should create snapshot with portRange when included", () => {
      const snapshot = createConfigSnapshot(baseConfig, ["portRange"], "node server.js --port {{port}}");
      expect(snapshot.portRangeMin).toBe(3000);
      expect(snapshot.portRangeMax).toBe(9999);
    });

    it("should create snapshot with protocol when included", () => {
      const snapshot = createConfigSnapshot(baseConfig, ["protocol"], "node server.js --url {{url}}");
      expect(snapshot.protocol).toBe("http");
    });

    it("should capture custom variables used in command", () => {
      const configWithVars: GlobalConfig = {
        ...baseConfig,
        variables: { "api-key": "secret123", "unused-var": "ignored" },
      };
      const snapshot = createConfigSnapshot(
        configWithVars,
        ["hostname"],
        "node server.js --host {{hostname}} --api-key {{api-key}}",
      );
      expect(snapshot.customVariables).toEqual({ "api-key": "secret123" });
      // unused-var should not be in snapshot since it's not in the command
      expect(snapshot.customVariables?.["unused-var"]).toBeUndefined();
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

    it("should detect port out of range", () => {
      const server = createServer({
        command: "node server.js --port {{port}}",
        port: 2000, // Below the range min of 3000
        usedConfigKeys: ["portRange"],
        configSnapshot: { portRangeMin: 1000, portRangeMax: 5000 },
      });

      const result = detectDrift(server, baseConfig);

      expect(result.hasDrift).toBe(true);
      expect(result.portOutOfRange).toBe(true);
      expect(result.driftedValues).toHaveLength(1);
      expect(result.driftedValues[0].configKey).toBe("portRange");
    });

    it("should not flag port in range as drift", () => {
      const server = createServer({
        command: "node server.js --port {{port}}",
        port: 5000, // Within range
        usedConfigKeys: ["portRange"],
        configSnapshot: { portRangeMin: 3000, portRangeMax: 9999 },
      });

      const result = detectDrift(server, baseConfig);

      expect(result.portOutOfRange).toBeFalsy();
    });

    it("should detect protocol change", () => {
      const server = createServer({
        command: "node server.js --url {{url}}",
        usedConfigKeys: ["protocol"],
        configSnapshot: { protocol: "https" },
      });

      const result = detectDrift(server, baseConfig); // baseConfig has protocol: "http"

      expect(result.hasDrift).toBe(true);
      expect(result.protocolChanged).toBe(true);
    });

    it("should detect custom variable drift", () => {
      const configWithVars: GlobalConfig = {
        ...baseConfig,
        variables: { "api-key": "new-secret" },
      };
      const server = createServer({
        command: "node server.js --api-key {{api-key}}",
        usedConfigKeys: ["portRange"],
        configSnapshot: {
          portRangeMin: 3000,
          portRangeMax: 9999,
          customVariables: { "api-key": "old-secret" },
        },
      });

      const result = detectDrift(server, configWithVars);

      expect(result.hasDrift).toBe(true);
      expect(result.driftedValues.some(d => d.configKey === "variables.api-key")).toBe(true);
    });

    it("should detect custom variable removed", () => {
      const configWithoutVars: GlobalConfig = {
        ...baseConfig,
        variables: {},
      };
      const server = createServer({
        command: "node server.js --api-key {{api-key}}",
        usedConfigKeys: ["portRange"],
        configSnapshot: {
          portRangeMin: 3000,
          portRangeMax: 9999,
          customVariables: { "api-key": "old-secret" },
        },
      });

      const result = detectDrift(server, configWithoutVars);

      expect(result.hasDrift).toBe(true);
      expect(result.driftedValues.some(d => d.currentValue === undefined)).toBe(true);
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
