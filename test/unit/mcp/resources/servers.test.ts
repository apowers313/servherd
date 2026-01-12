import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2 } from "../../../mocks/pm2.js";
import type { ServerEntry } from "../../../../src/types/registry.js";

// Mock PM2 before other imports
vi.mock("pm2", async () => {
  const { mockPM2Module } = await import("../../../mocks/pm2.js");
  return mockPM2Module;
});

// Mock fs-extra
vi.mock("fs-extra/esm", () => ({
  pathExists: vi.fn().mockResolvedValue(true),
}));

// Mock fs/promises
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue("log line 1\nlog line 2\nlog line 3"),
}));

// Mock RegistryService
const mockRegistryService = {
  load: vi.fn(),
  findByName: vi.fn(),
  listServers: vi.fn(),
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Import after mocking
const { listServerResources, readServerResource } =
  await import("../../../../src/mcp/resources/servers.js");

describe("MCP Server Resources", () => {
  const mockPM2 = getMockPM2();

  const server1: ServerEntry = {
    id: "id-1",
    name: "brave-tiger",
    command: "npm start",
    resolvedCommand: "npm start",
    cwd: "/project1",
    port: 3000,
    protocol: "http",
    hostname: "localhost",
    env: {},
    tags: ["frontend"],
    description: "Frontend server",
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-brave-tiger",
  };

  const server2: ServerEntry = {
    id: "id-2",
    name: "calm-panda",
    command: "npm run dev",
    resolvedCommand: "npm run dev",
    cwd: "/project2",
    port: 3001,
    protocol: "http",
    hostname: "localhost",
    env: {},
    tags: ["backend"],
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-calm-panda",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPM2._reset();
    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.findByName.mockReturnValue(undefined);
    mockRegistryService.listServers.mockReturnValue([]);
  });

  describe("listServerResources", () => {
    it("should return empty list when no servers exist", async () => {
      mockRegistryService.listServers.mockReturnValue([]);

      const resources = await listServerResources();

      expect(resources).toHaveLength(0);
    });

    it("should return server resources for each server", async () => {
      mockRegistryService.listServers.mockReturnValue([server1, server2]);

      const resources = await listServerResources();

      // Should have 2 resources per server (details + logs)
      expect(resources).toHaveLength(4);

      // Check server detail resources
      const serverResources = resources.filter((r) => !r.uri.endsWith("/logs"));
      expect(serverResources).toHaveLength(2);
      expect(serverResources.map((r) => r.uri)).toContain("servherd://servers/brave-tiger");
      expect(serverResources.map((r) => r.uri)).toContain("servherd://servers/calm-panda");

      // Check logs resources
      const logResources = resources.filter((r) => r.uri.endsWith("/logs"));
      expect(logResources).toHaveLength(2);
      expect(logResources.map((r) => r.uri)).toContain("servherd://servers/brave-tiger/logs");
      expect(logResources.map((r) => r.uri)).toContain("servherd://servers/calm-panda/logs");
    });

    it("should include server description in resource", async () => {
      mockRegistryService.listServers.mockReturnValue([server1]);

      const resources = await listServerResources();

      const serverResource = resources.find((r) => r.uri === "servherd://servers/brave-tiger");
      expect(serverResource?.description).toBe("Frontend server");
    });

    it("should use cwd as fallback description", async () => {
      const serverWithoutDesc = { ...server1, description: undefined };
      mockRegistryService.listServers.mockReturnValue([serverWithoutDesc]);

      const resources = await listServerResources();

      const serverResource = resources.find((r) => r.uri === "servherd://servers/brave-tiger");
      expect(serverResource?.description).toContain("/project1");
    });
  });

  describe("readServerResource", () => {
    it("should throw for invalid URI format", async () => {
      await expect(readServerResource("invalid://uri"))
        .rejects.toThrow("Invalid resource URI");
    });

    it("should read server details", async () => {
      mockRegistryService.findByName.mockReturnValue(server1);
      mockPM2._setProcesses([
        {
          pid: 12345,
          name: "servherd-brave-tiger",
          pm2_env: {
            status: "online",
            pm_id: 0,
            name: "servherd-brave-tiger",
            pm_uptime: Date.now(),
            created_at: Date.now(),
            restart_time: 0,
            unstable_restarts: 0,
            pm_cwd: "/project1",
            pm_exec_path: "npm",
            exec_mode: "fork",
            node_args: [],
            pm_out_log_path: "/logs/out.log",
            pm_err_log_path: "/logs/err.log",
            pm_pid_path: "",
            env: {},
          },
          monit: {
            memory: 50 * 1024 * 1024,
            cpu: 5,
          },
        },
      ]);

      const content = await readServerResource("servherd://servers/brave-tiger");
      const parsed = JSON.parse(content);

      expect(parsed.name).toBe("brave-tiger");
      expect(parsed.status).toBe("online");
      expect(parsed.port).toBe(3000);
      expect(parsed.url).toBe("http://localhost:3000");
      expect(parsed.cwd).toBe("/project1");
      expect(parsed.pid).toBe(12345);
      expect(parsed.memory).toBe(50 * 1024 * 1024);
    });

    it("should throw when server not found", async () => {
      mockRegistryService.findByName.mockReturnValue(undefined);

      await expect(readServerResource("servherd://servers/nonexistent"))
        .rejects.toThrow("Server \"nonexistent\" not found");
    });

    it("should read server logs", async () => {
      mockRegistryService.findByName.mockReturnValue(server1);
      mockPM2._setProcesses([
        {
          pid: 12345,
          name: "servherd-brave-tiger",
          pm2_env: {
            status: "online",
            pm_id: 0,
            name: "servherd-brave-tiger",
            pm_uptime: Date.now(),
            created_at: Date.now(),
            restart_time: 0,
            unstable_restarts: 0,
            pm_cwd: "/project1",
            pm_exec_path: "npm",
            exec_mode: "fork",
            node_args: [],
            pm_out_log_path: "/logs/out.log",
            pm_err_log_path: "/logs/err.log",
            pm_pid_path: "",
            env: {},
          },
        },
      ]);

      const content = await readServerResource("servherd://servers/brave-tiger/logs");

      expect(content).toContain("log line");
    });

    it("should handle server with no process in PM2", async () => {
      mockRegistryService.findByName.mockReturnValue(server1);
      mockPM2._setProcesses([]);

      const content = await readServerResource("servherd://servers/brave-tiger");
      const parsed = JSON.parse(content);

      expect(parsed.name).toBe("brave-tiger");
      expect(parsed.status).toBe("unknown");
      expect(parsed.pid).toBeUndefined();
    });
  });
});
