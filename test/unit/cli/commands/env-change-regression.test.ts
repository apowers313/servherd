/**
 * Integration tests for environment variable change detection in servherd start command.
 *
 * These tests verify that when a server is already running and the user calls
 * `servherd start` with different environment variables (-e flag), the server
 * is properly restarted with the new environment configuration.
 *
 * This is a regression test for the issue where env var changes were ignored
 * when a server was already running.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2 } from "../../../mocks/pm2.js";
import type { ServerEntry } from "../../../../src/types/registry.js";

// Mock PM2 before other imports
vi.mock("pm2", async () => {
  const { mockPM2Module } = await import("../../../mocks/pm2.js");
  return mockPM2Module;
});

// Mock ConfigService
const mockConfigService = {
  load: vi.fn(),
  get: vi.fn(),
};

// Mock RegistryService
const mockRegistryService = {
  load: vi.fn(),
  addServer: vi.fn(),
  findByCommandHash: vi.fn(),
  findByCwdAndName: vi.fn(),
  findByName: vi.fn(),
  updateServer: vi.fn(),
  listServers: vi.fn(),
  save: vi.fn(),
};

vi.mock("../../../../src/services/config.service.js", () => ({
  ConfigService: vi.fn().mockImplementation(() => mockConfigService),
}));

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Import after mocking
const { executeStart } = await import("../../../../src/cli/commands/start.js");

describe("Environment Variable Change Detection (Regression)", () => {
  const mockPM2 = getMockPM2();

  const defaultConfig = {
    version: "1",
    hostname: "localhost",
    protocol: "http",
    portRange: { min: 3000, max: 9999 },
    tempDir: "/tmp/servherd",
    pm2: { logDir: "/tmp/servherd/logs", pidDir: "/tmp/servherd/pids" },
  };

  /**
   * Helper to create a mock existing server entry
   */
  function createExistingServer(overrides: Partial<ServerEntry> = {}): ServerEntry {
    return {
      id: "existing-server-id",
      name: "test-server",
      command: "npm start",
      resolvedCommand: "npm start",
      cwd: "/project",
      port: 3456,
      protocol: "http",
      hostname: "localhost",
      env: {},
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-test-server",
      ...overrides,
    };
  }

  /**
   * Helper to set up PM2 mock with online process
   */
  function setServerOnline(pm2Name: string) {
    mockPM2._setProcesses([
      {
        pid: 12345,
        name: pm2Name,
        pm2_env: {
          status: "online",
          pm_id: 0,
          name: pm2Name,
          pm_uptime: Date.now(),
          created_at: Date.now(),
          restart_time: 0,
          unstable_restarts: 0,
          pm_cwd: "/project",
          pm_exec_path: "npm",
          exec_mode: "fork",
          node_args: [],
          pm_out_log_path: "",
          pm_err_log_path: "",
          pm_pid_path: "",
          env: {},
        },
      },
    ]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockPM2._reset();

    mockConfigService.load.mockResolvedValue(defaultConfig);
    mockConfigService.get.mockReturnValue("localhost");

    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.findByCwdAndName.mockReturnValue(undefined);
    mockRegistryService.findByCommandHash.mockReturnValue(undefined);
    mockRegistryService.findByName.mockReturnValue(undefined);
    mockRegistryService.listServers.mockReturnValue([]);
  });

  describe("Scenario: Server running with no env vars, user adds env vars", () => {
    it("should restart the server and apply new environment variables", async () => {
      // Setup: Server running with no env vars
      const existingServer = createExistingServer({ env: {} });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      // Action: User starts same command with new env vars
      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { API_URL: "http://api.example.com", DEBUG: "true" },
      });

      // Assertions
      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
      expect(result.server.env).toEqual({
        API_URL: "http://api.example.com",
        DEBUG: "true",
      });

      // Verify server was deleted and restarted (not just restarted)
      expect(mockPM2.delete).toHaveBeenCalledWith(existingServer.pm2Name, expect.any(Function));
      expect(mockPM2.start).toHaveBeenCalled();

      // Verify registry was updated with new env (and other fields for config tracking)
      expect(mockRegistryService.updateServer).toHaveBeenCalledWith(existingServer.id,
        expect.objectContaining({
          env: { API_URL: "http://api.example.com", DEBUG: "true" },
        }),
      );
    });
  });

  describe("Scenario: Server running with env vars, user changes values", () => {
    it("should restart when a single env var value changes", async () => {
      const existingServer = createExistingServer({
        env: { API_URL: "http://localhost:3000" },
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { API_URL: "http://localhost:4000" }, // Different port
      });

      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
      expect(result.server.env).toEqual({ API_URL: "http://localhost:4000" });
    });

    it("should restart when multiple env var values change", async () => {
      const existingServer = createExistingServer({
        env: {
          API_URL: "http://localhost:3000",
          DEBUG: "false",
          LOG_LEVEL: "info",
        },
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: {
          API_URL: "http://localhost:4000",
          DEBUG: "true",
          LOG_LEVEL: "debug",
        },
      });

      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
    });

    it("should restart when only one of multiple env vars changes", async () => {
      const existingServer = createExistingServer({
        env: {
          API_URL: "http://localhost:3000",
          DEBUG: "false",
        },
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: {
          API_URL: "http://localhost:3000", // Same
          DEBUG: "true", // Changed
        },
      });

      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
    });
  });

  describe("Scenario: Server running with env vars, user removes env vars", () => {
    it("should restart when all env vars are removed", async () => {
      const existingServer = createExistingServer({
        env: { API_URL: "http://localhost:3000", DEBUG: "true" },
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      // User starts without any -e flags
      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        // No env specified
      });

      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
      expect(result.server.env).toEqual({});
    });

    it("should restart when some env vars are removed", async () => {
      const existingServer = createExistingServer({
        env: {
          API_URL: "http://localhost:3000",
          DEBUG: "true",
          LOG_LEVEL: "info",
        },
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      // User only specifies one env var (others implicitly removed)
      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { API_URL: "http://localhost:3000" },
      });

      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
      expect(result.server.env).toEqual({ API_URL: "http://localhost:3000" });
    });
  });

  describe("Scenario: Server running with env vars, user adds new env vars", () => {
    it("should restart when new env vars are added to existing ones", async () => {
      const existingServer = createExistingServer({
        env: { API_URL: "http://localhost:3000" },
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: {
          API_URL: "http://localhost:3000", // Same
          NEW_VAR: "new-value", // Added
        },
      });

      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
    });
  });

  describe("Scenario: Server running with env vars, user provides identical env vars", () => {
    it("should NOT restart when env vars are exactly the same", async () => {
      const existingServer = createExistingServer({
        env: { API_URL: "http://localhost:3000", DEBUG: "true" },
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { API_URL: "http://localhost:3000", DEBUG: "true" }, // Identical
      });

      expect(result.action).toBe("existing");
      expect(result.envChanged).toBeUndefined();
      expect(mockPM2.delete).not.toHaveBeenCalled();
      expect(mockPM2.start).not.toHaveBeenCalled();
    });

    it("should NOT restart when both old and new have no env vars", async () => {
      const existingServer = createExistingServer({ env: {} });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        // No env
      });

      expect(result.action).toBe("existing");
      expect(result.envChanged).toBeUndefined();
    });

    it("should NOT restart when env vars are same but in different order", async () => {
      // This tests that key ordering doesn't affect comparison
      const existingServer = createExistingServer({
        env: { A: "1", B: "2", C: "3" },
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { C: "3", A: "1", B: "2" }, // Same values, different order
      });

      expect(result.action).toBe("existing");
      expect(result.envChanged).toBeUndefined();
    });
  });

  describe("Scenario: Server stopped, user provides different env vars", () => {
    it("should restart stopped server even with different env vars", async () => {
      const existingServer = createExistingServer({
        env: { OLD_VAR: "old-value" },
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);

      // Server is stopped, not online
      mockPM2._setProcesses([
        {
          pid: 0,
          name: existingServer.pm2Name,
          pm2_env: {
            status: "stopped",
            pm_id: 0,
            name: existingServer.pm2Name,
            pm_uptime: 0,
            created_at: Date.now(),
            restart_time: 0,
            unstable_restarts: 0,
            pm_cwd: "/project",
            pm_exec_path: "npm",
            exec_mode: "fork",
            node_args: [],
            pm_out_log_path: "",
            pm_err_log_path: "",
            pm_pid_path: "",
            env: {},
          },
        },
      ]);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { NEW_VAR: "new-value" },
      });

      // Should restart (env changed path takes precedence)
      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
    });
  });

  describe("Scenario: Environment variables with template substitution", () => {
    it("should compare resolved env values (after template substitution)", async () => {
      // Server was started with resolved template values
      const existingServer = createExistingServer({
        env: { BASE_URL: "http://localhost:3456" }, // Already resolved
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      // User provides same template that resolves to same value
      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { BASE_URL: "{{url}}" }, // Will resolve to http://localhost:3456
      });

      // Should recognize as same and not restart
      expect(result.action).toBe("existing");
    });

    it("should detect change in template-resolved values", async () => {
      const existingServer = createExistingServer({
        env: { PORT_VAR: "3456" },
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      // User provides different literal value
      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { PORT_VAR: "9999" },
      });

      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty string values correctly", async () => {
      const existingServer = createExistingServer({
        env: { EMPTY_VAR: "" },
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { EMPTY_VAR: "now-has-value" },
      });

      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
    });

    it("should handle special characters in env values", async () => {
      const existingServer = createExistingServer({
        env: { SPECIAL: "value=with=equals&and&ampersands" },
      });
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      // Same special characters - should not restart
      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { SPECIAL: "value=with=equals&and&ampersands" },
      });

      expect(result.action).toBe("existing");
    });

    it("should handle undefined existing env (legacy servers)", async () => {
      // Some legacy servers might have undefined env instead of {}
      const existingServer = createExistingServer();
      // @ts-expect-error - Testing undefined edge case
      existingServer.env = undefined;

      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      setServerOnline(existingServer.pm2Name);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { NEW_VAR: "value" },
      });

      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
    });
  });
});
