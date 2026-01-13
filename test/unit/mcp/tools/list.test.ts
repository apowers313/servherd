import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2 } from "../../../mocks/pm2.js";
import type { ServerEntry } from "../../../../src/types/registry.js";

// Mock PM2 before other imports
vi.mock("pm2", async () => {
  const { mockPM2Module } = await import("../../../mocks/pm2.js");
  return mockPM2Module;
});

// Mock RegistryService
const mockRegistryService = {
  load: vi.fn(),
  listServers: vi.fn(),
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Import after mocking
const { handleListTool, listToolName, listToolDescription, listToolSchema } =
  await import("../../../../src/mcp/tools/list.js");

describe("servherd_list MCP tool", () => {
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
    mockRegistryService.listServers.mockReturnValue([]);
  });

  it("should have correct tool name", () => {
    expect(listToolName).toBe("servherd_list");
  });

  it("should have a description", () => {
    expect(listToolDescription).toBeDefined();
    expect(listToolDescription.length).toBeGreaterThan(10);
  });

  it("should return empty list when no servers exist", async () => {
    mockRegistryService.listServers.mockReturnValue([]);

    const result = await handleListTool({});

    expect(result.servers).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.summary).toBe("No servers found");
  });

  it("should return server list as JSON", async () => {
    mockRegistryService.listServers.mockReturnValue([server1, server2]);
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
          pm_out_log_path: "",
          pm_err_log_path: "",
          pm_pid_path: "",
          env: {},
        },
      },
      {
        pid: 12346,
        name: "servherd-calm-panda",
        pm2_env: {
          status: "stopped",
          pm_id: 1,
          name: "servherd-calm-panda",
          pm_uptime: Date.now(),
          created_at: Date.now(),
          restart_time: 0,
          unstable_restarts: 0,
          pm_cwd: "/project2",
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

    const result = await handleListTool({});

    expect(result.servers).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.summary).toContain("2 servers");
    expect(result.summary).toContain("1 running");

    // Check server info structure
    const firstServer = result.servers.find((s) => s.name === "brave-tiger");
    expect(firstServer).toBeDefined();
    expect(firstServer?.status).toBe("online");
    expect(firstServer?.port).toBe(3000);
    expect(firstServer?.url).toBe("http://localhost:3000");
    expect(firstServer?.cwd).toBe("/project1");
  });

  it("should pass filter options", async () => {
    mockRegistryService.listServers.mockReturnValue([server1]);
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
          pm_out_log_path: "",
          pm_err_log_path: "",
          pm_pid_path: "",
          env: {},
        },
      },
    ]);

    await handleListTool({ running: true, tag: "frontend" });

    expect(mockRegistryService.listServers).toHaveBeenCalledWith({
      tag: "frontend",
      cwd: undefined,
      cmd: undefined,
    });
  });

  it("should validate schema correctly", () => {
    const schema = listToolSchema;

    // Empty is valid
    expect(schema.safeParse({}).success).toBe(true);

    // All options
    expect(schema.safeParse({
      running: true,
      tag: "frontend",
      cwd: "/project",
    }).success).toBe(true);

    // With cmd pattern
    expect(schema.safeParse({
      cmd: "*storybook*",
    }).success).toBe(true);
  });

  it("should pass cmd filter to registry service", async () => {
    mockRegistryService.listServers.mockReturnValue([]);

    await handleListTool({ cmd: "*storybook*" });

    expect(mockRegistryService.listServers).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: "*storybook*" }),
    );
  });

  it("should combine cmd filter with other filters", async () => {
    mockRegistryService.listServers.mockReturnValue([server1]);
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
          pm_out_log_path: "",
          pm_err_log_path: "",
          pm_pid_path: "",
          env: {},
        },
      },
    ]);

    await handleListTool({ cmd: "*npm*", tag: "frontend", cwd: "/project1" });

    expect(mockRegistryService.listServers).toHaveBeenCalledWith({
      tag: "frontend",
      cwd: "/project1",
      cmd: "*npm*",
    });
  });

  describe("stopped filter", () => {
    it("should filter to only stopped servers when stopped=true", async () => {
      mockRegistryService.listServers.mockReturnValue([server1, server2]);
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
            pm_out_log_path: "",
            pm_err_log_path: "",
            pm_pid_path: "",
            env: {},
          },
        },
        {
          pid: 12346,
          name: "servherd-calm-panda",
          pm2_env: {
            status: "stopped",
            pm_id: 1,
            name: "servherd-calm-panda",
            pm_uptime: Date.now(),
            created_at: Date.now(),
            restart_time: 0,
            unstable_restarts: 0,
            pm_cwd: "/project2",
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

      const result = await handleListTool({ stopped: true });

      expect(result.servers).toHaveLength(1);
      expect(result.servers[0].status).toBe("stopped");
      expect(result.servers[0].name).toBe("calm-panda");
    });

    it("should validate stopped option in schema", () => {
      const schema = listToolSchema;
      expect(schema.safeParse({ stopped: true }).success).toBe(true);
      expect(schema.safeParse({ stopped: false }).success).toBe(true);
    });

    it("should not allow both running and stopped filters", async () => {
      await expect(handleListTool({ running: true, stopped: true }))
        .rejects.toThrow("Cannot specify both --running and --stopped");
    });
  });
});
