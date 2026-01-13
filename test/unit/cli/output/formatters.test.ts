import { describe, it, expect } from "vitest";
import {
  formatStatus,
  formatUrl,
  formatName,
  formatServerListTable,
  formatStartResult,
  formatStopResult,
  formatError,
  formatSuccess,
  formatInfo,
  formatWarning,
  formatServerInfo,
  formatLogs,
  formatRestartResult,
  formatRemoveResult,
  formatConfigResult,
} from "../../../../src/cli/output/formatters.js";
import type { ServerEntry } from "../../../../src/types/registry.js";
import type { InfoCommandResult } from "../../../../src/cli/commands/info.js";
import type { LogsCommandResult } from "../../../../src/cli/commands/logs.js";

describe("formatters", () => {
  describe("formatStatus", () => {
    it("should format online status with green color", () => {
      const result = formatStatus("online");
      expect(result).toContain("online");
    });

    it("should format stopped status with gray color", () => {
      const result = formatStatus("stopped");
      expect(result).toContain("stopped");
    });

    it("should format errored status with red color", () => {
      const result = formatStatus("errored");
      expect(result).toContain("errored");
    });

    it("should format unknown status with yellow color", () => {
      const result = formatStatus("unknown");
      expect(result).toContain("unknown");
    });
  });

  describe("formatUrl", () => {
    it("should format http URL correctly", () => {
      const result = formatUrl("http", "localhost", 3000);
      expect(result).toContain("http://localhost:3000");
    });

    it("should format https URL correctly", () => {
      const result = formatUrl("https", "example.com", 443);
      expect(result).toContain("https://example.com:443");
    });
  });

  describe("formatName", () => {
    it("should format server name with bold styling", () => {
      const result = formatName("brave-tiger");
      expect(result).toContain("brave-tiger");
    });
  });

  describe("formatServerListTable", () => {
    it("should return message when no servers", () => {
      const result = formatServerListTable([]);
      expect(result).toContain("No servers");
    });

    it("should format servers into a table", () => {
      const server: ServerEntry = {
        id: "test-id",
        name: "brave-tiger",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3000,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-brave-tiger",
      };

      const result = formatServerListTable([{ server, status: "online" }]);
      expect(result).toContain("brave-tiger");
      expect(result).toContain("3000");
      expect(result).toContain("online");
      expect(result).toContain("npm start");
    });

    it("should format multiple servers", () => {
      const server1: ServerEntry = {
        id: "test-id-1",
        name: "brave-tiger",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project1",
        port: 3000,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-brave-tiger",
      };

      const server2: ServerEntry = {
        id: "test-id-2",
        name: "calm-panda",
        command: "npm run dev",
        resolvedCommand: "npm run dev",
        cwd: "/project2",
        port: 3001,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-calm-panda",
      };

      const result = formatServerListTable([
        { server: server1, status: "online" },
        { server: server2, status: "stopped" },
      ]);

      expect(result).toContain("brave-tiger");
      expect(result).toContain("calm-panda");
      expect(result).toContain("3000");
      expect(result).toContain("3001");
    });

    it("should truncate long paths", () => {
      const server: ServerEntry = {
        id: "test-id",
        name: "brave-tiger",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/home/user/very/long/path/to/project/that/should/be/truncated",
        port: 3000,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-brave-tiger",
      };

      const result = formatServerListTable([{ server, status: "online" }]);
      expect(result).toContain("...");
    });

    it("should truncate long commands", () => {
      const server: ServerEntry = {
        id: "test-id",
        name: "brave-tiger",
        command: "node scripts/very-long-script-name-that-exceeds-the-limit.js --port {{port}}",
        resolvedCommand: "node scripts/very-long-script-name-that-exceeds-the-limit.js --port 3000",
        cwd: "/project",
        port: 3000,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-brave-tiger",
      };

      const result = formatServerListTable([{ server, status: "online" }]);
      expect(result).toContain("...");
      expect(result).toContain("node scripts/very-long-sc");
    });

    it("should show command column to distinguish servers in same directory", () => {
      const server1: ServerEntry = {
        id: "test-id-1",
        name: "brave-tiger",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3000,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-brave-tiger",
      };

      const server2: ServerEntry = {
        id: "test-id-2",
        name: "calm-panda",
        command: "npm run storybook",
        resolvedCommand: "npm run storybook",
        cwd: "/project",
        port: 3001,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-calm-panda",
      };

      const result = formatServerListTable([
        { server: server1, status: "online" },
        { server: server2, status: "online" },
      ]);

      expect(result).toContain("npm start");
      expect(result).toContain("npm run storybook");
    });
  });

  describe("formatStartResult", () => {
    const baseServer: ServerEntry = {
      id: "test-id",
      name: "brave-tiger",
      command: "npm start",
      resolvedCommand: "npm start",
      cwd: "/project",
      port: 3000,
      protocol: "http",
      hostname: "localhost",
      env: {},
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-brave-tiger",
    };

    it("should format started result", () => {
      const result = formatStartResult({
        action: "started",
        server: baseServer,
        status: "online",
      });

      expect(result).toContain("started");
      expect(result).toContain("brave-tiger");
      expect(result).toContain("3000");
      expect(result).toContain("http://localhost:3000");
    });

    it("should format existing result", () => {
      const result = formatStartResult({
        action: "existing",
        server: baseServer,
        status: "online",
      });

      expect(result).toContain("already exists");
      expect(result).toContain("brave-tiger");
    });

    it("should format restarted result", () => {
      const result = formatStartResult({
        action: "restarted",
        server: baseServer,
        status: "online",
      });

      expect(result).toContain("restarted");
      expect(result).toContain("brave-tiger");
    });
  });

  describe("formatStopResult", () => {
    it("should return message when no servers to stop", () => {
      const result = formatStopResult([]);
      expect(result).toContain("No servers");
    });

    it("should format successful stop", () => {
      const result = formatStopResult([
        { name: "brave-tiger", success: true },
      ]);

      expect(result).toContain("brave-tiger");
      expect(result).toContain("stopped");
    });

    it("should format failed stop", () => {
      const result = formatStopResult([
        { name: "brave-tiger", success: false, message: "Process not found" },
      ]);

      expect(result).toContain("brave-tiger");
      expect(result).toContain("Failed");
      expect(result).toContain("Process not found");
    });

    it("should format multiple stop results", () => {
      const result = formatStopResult([
        { name: "brave-tiger", success: true },
        { name: "calm-panda", success: false, message: "Error" },
      ]);

      expect(result).toContain("brave-tiger");
      expect(result).toContain("calm-panda");
      expect(result).toContain("stopped");
      expect(result).toContain("Failed");
    });
  });

  describe("formatError", () => {
    it("should format error message with red color", () => {
      const result = formatError("Something went wrong");
      expect(result).toContain("Something went wrong");
      expect(result).toContain("Error");
    });
  });

  describe("formatSuccess", () => {
    it("should format success message with green color", () => {
      const result = formatSuccess("Operation completed");
      expect(result).toContain("Operation completed");
    });
  });

  describe("formatInfo", () => {
    it("should format info message with blue color", () => {
      const result = formatInfo("Some information");
      expect(result).toContain("Some information");
    });
  });

  describe("formatWarning", () => {
    it("should format warning message with yellow color", () => {
      const result = formatWarning("Be careful");
      expect(result).toContain("Be careful");
    });
  });

  describe("formatServerInfo", () => {
    const baseInfo: InfoCommandResult = {
      name: "brave-tiger",
      status: "online",
      url: "http://localhost:3000",
      cwd: "/project",
      command: "npm start --port {{port}}",
      resolvedCommand: "npm start --port 3000",
      port: 3000,
      hostname: "localhost",
      protocol: "http",
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-brave-tiger",
    };

    it("should format server info in a box", () => {
      const result = formatServerInfo(baseInfo);
      expect(result).toContain("brave-tiger");
      expect(result).toContain("http://localhost:3000");
      expect(result).toContain("3000");
      expect(result).toContain("online");
    });

    it("should include optional fields when present", () => {
      const info: InfoCommandResult = {
        ...baseInfo,
        pid: 12345,
        uptime: Date.now() - 60000, // 1 minute ago
        restarts: 2,
        memory: 52428800, // 50 MB
        cpu: 2.5,
        tags: ["frontend", "dev"],
        description: "My test server",
        outLogPath: "/tmp/logs/out.log",
        errLogPath: "/tmp/logs/err.log",
        env: { NODE_ENV: "development" },
      };

      const result = formatServerInfo(info);
      expect(result).toContain("12345");
      expect(result).toContain("Restarts");
      expect(result).toContain("50.00 MB");
      expect(result).toContain("2.5%");
      expect(result).toContain("frontend");
      expect(result).toContain("dev");
      expect(result).toContain("My test server");
      expect(result).toContain("/tmp/logs/out.log");
      expect(result).toContain("NODE_ENV=development");
    });

    it("should format memory in different units", () => {
      // Test bytes
      const smallMemory: InfoCommandResult = { ...baseInfo, memory: 512 };
      expect(formatServerInfo(smallMemory)).toContain("512 B");

      // Test KB
      const kbMemory: InfoCommandResult = { ...baseInfo, memory: 5120 };
      expect(formatServerInfo(kbMemory)).toContain("5.00 KB");

      // Test GB
      const gbMemory: InfoCommandResult = { ...baseInfo, memory: 2147483648 };
      expect(formatServerInfo(gbMemory)).toContain("2.00 GB");
    });

    it("should format uptime in different units", () => {
      // Test seconds
      const secondsAgo: InfoCommandResult = { ...baseInfo, uptime: Date.now() - 30000 };
      expect(formatServerInfo(secondsAgo)).toContain("30s");

      // Test minutes
      const minutesAgo: InfoCommandResult = { ...baseInfo, uptime: Date.now() - 180000 };
      expect(formatServerInfo(minutesAgo)).toContain("3m");

      // Test hours
      const hoursAgo: InfoCommandResult = { ...baseInfo, uptime: Date.now() - 7200000 };
      expect(formatServerInfo(hoursAgo)).toContain("2h");

      // Test days
      const daysAgo: InfoCommandResult = { ...baseInfo, uptime: Date.now() - 172800000 };
      expect(formatServerInfo(daysAgo)).toContain("2d");
    });
  });

  describe("formatLogs", () => {
    it("should format logs output", () => {
      const logsResult: LogsCommandResult = {
        name: "brave-tiger",
        status: "online",
        logs: "line 1\nline 2\nline 3",
        lines: 50,
        outLogPath: "/tmp/logs/out.log",
      };

      const result = formatLogs(logsResult);
      expect(result).toContain("brave-tiger");
      expect(result).toContain("online");
      expect(result).toContain("line 1");
      expect(result).toContain("line 2");
      expect(result).toContain("/tmp/logs/out.log");
      expect(result).toContain("50");
    });

    it("should show message when no logs available", () => {
      const logsResult: LogsCommandResult = {
        name: "brave-tiger",
        status: "unknown",
        logs: "",
        lines: 50,
      };

      const result = formatLogs(logsResult);
      expect(result).toContain("brave-tiger");
      expect(result).toContain("no logs available");
    });
  });

  describe("formatRestartResult", () => {
    it("should return message when no servers to restart", () => {
      const result = formatRestartResult([]);
      expect(result).toContain("No servers");
    });

    it("should format successful restart", () => {
      const result = formatRestartResult([
        { name: "brave-tiger", success: true, status: "online" },
      ]);

      expect(result).toContain("brave-tiger");
      expect(result).toContain("restarted");
      expect(result).toContain("online");
    });

    it("should format failed restart", () => {
      const result = formatRestartResult([
        { name: "brave-tiger", success: false, message: "Process not found" },
      ]);

      expect(result).toContain("brave-tiger");
      expect(result).toContain("Failed");
      expect(result).toContain("Process not found");
    });

    it("should format multiple restart results", () => {
      const result = formatRestartResult([
        { name: "brave-tiger", success: true, status: "online" },
        { name: "calm-panda", success: false, message: "Error" },
      ]);

      expect(result).toContain("brave-tiger");
      expect(result).toContain("calm-panda");
      expect(result).toContain("restarted");
      expect(result).toContain("Failed");
    });
  });

  describe("formatRemoveResult", () => {
    it("should return message when no servers to remove", () => {
      const result = formatRemoveResult([]);
      expect(result).toContain("No servers");
    });

    it("should format successful removal", () => {
      const result = formatRemoveResult([
        { name: "brave-tiger", success: true },
      ]);

      expect(result).toContain("brave-tiger");
      expect(result).toContain("removed");
    });

    it("should format cancelled removal", () => {
      const result = formatRemoveResult([
        { name: "brave-tiger", success: false, cancelled: true },
      ]);

      expect(result).toContain("brave-tiger");
      expect(result).toContain("cancelled");
    });

    it("should format failed removal", () => {
      const result = formatRemoveResult([
        { name: "brave-tiger", success: false, message: "Process error" },
      ]);

      expect(result).toContain("brave-tiger");
      expect(result).toContain("Failed");
      expect(result).toContain("Process error");
    });

    it("should format multiple remove results", () => {
      const result = formatRemoveResult([
        { name: "brave-tiger", success: true },
        { name: "calm-panda", success: false, cancelled: true },
        { name: "swift-hawk", success: false, message: "Error" },
      ]);

      expect(result).toContain("brave-tiger");
      expect(result).toContain("removed");
      expect(result).toContain("calm-panda");
      expect(result).toContain("cancelled");
      expect(result).toContain("swift-hawk");
      expect(result).toContain("Failed");
    });
  });

  describe("formatConfigResult", () => {
    it("should format error result", () => {
      const result = formatConfigResult({ error: "Something went wrong" });
      expect(result).toContain("Something went wrong");
      expect(result).toContain("Error");
    });

    it("should format --get result", () => {
      const result = formatConfigResult({ key: "hostname", value: "localhost" });
      expect(result).toContain("hostname");
      expect(result).toContain("localhost");
    });

    it("should format --get result with nested value", () => {
      const result = formatConfigResult({ key: "portRange.min", value: 3000 });
      expect(result).toContain("portRange.min");
      expect(result).toContain("3000");
    });

    it("should format successful --set result", () => {
      const result = formatConfigResult({ updated: true, key: "hostname", value: "myhost.local" });
      expect(result).toContain("hostname");
      expect(result).toContain("myhost.local");
      expect(result).toContain("set to");
    });

    it("should format failed --set result with error", () => {
      const result = formatConfigResult({ updated: false, error: "Invalid value" });
      expect(result).toContain("Invalid value");
      expect(result).toContain("Error");
    });

    it("should format failed --set result without error", () => {
      const result = formatConfigResult({ updated: false });
      expect(result).toContain("Failed");
    });

    it("should format successful --reset result", () => {
      const result = formatConfigResult({ reset: true, config: { hostname: "localhost" } });
      expect(result).toContain("reset to defaults");
    });

    it("should format cancelled --reset result", () => {
      const result = formatConfigResult({ reset: false, cancelled: true });
      expect(result).toContain("cancelled");
    });

    it("should format failed --reset result", () => {
      const result = formatConfigResult({ reset: false });
      expect(result).toContain("Failed");
    });

    it("should format --show result with config", () => {
      const result = formatConfigResult({
        config: {
          version: "1",
          hostname: "localhost",
          protocol: "http",
          portRange: { min: 3000, max: 9999 },
        },
        globalConfigPath: "/home/user/.servherd/config.json",
      });

      expect(result).toContain("Configuration");
      expect(result).toContain("version");
      expect(result).toContain("hostname");
      expect(result).toContain("localhost");
      expect(result).toContain("protocol");
      expect(result).toContain("http");
      expect(result).toContain("portRange.min");
      expect(result).toContain("3000");
      expect(result).toContain("Global config");
      expect(result).toContain("/home/user/.servherd/config.json");
    });

    it("should format --show result with loaded config path", () => {
      const result = formatConfigResult({
        config: { hostname: "localhost" },
        configPath: "/project/.servherdrc.json",
      });

      expect(result).toContain("Loaded from");
      expect(result).toContain("/project/.servherdrc.json");
    });

    it("should format null and undefined values", () => {
      const result = formatConfigResult({ key: "missing", value: null });
      expect(result).toContain("not set");
    });

    it("should flatten nested config values", () => {
      const result = formatConfigResult({
        config: { nested: { key: "value" } },
        globalConfigPath: "/path",
      });
      // Nested objects are flattened to key paths
      expect(result).toContain("nested.key");
      expect(result).toContain("value");
    });

    it("should return empty string when no action specified", () => {
      const result = formatConfigResult({});
      expect(result).toBe("");
    });
  });
});
