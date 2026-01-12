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
  findByName: vi.fn(),
  listServers: vi.fn(),
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Import after mocking
const { handleRestartTool, restartToolName, restartToolDescription, restartToolSchema } =
  await import("../../../../src/mcp/tools/restart.js");

describe("servherd_restart MCP tool", () => {
  const mockPM2 = getMockPM2();

  const server: ServerEntry = {
    id: "test-id",
    name: "brave-tiger",
    command: "npm start",
    resolvedCommand: "npm start",
    cwd: "/project",
    port: 3456,
    protocol: "http",
    hostname: "localhost",
    env: {},
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-brave-tiger",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPM2._reset();
    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.findByName.mockReturnValue(undefined);
    mockRegistryService.listServers.mockReturnValue([]);
  });

  it("should have correct tool name", () => {
    expect(restartToolName).toBe("servherd_restart");
  });

  it("should have a description", () => {
    expect(restartToolDescription).toBeDefined();
    expect(restartToolDescription.length).toBeGreaterThan(10);
  });

  it("should require at least one of name, all, or tag", async () => {
    await expect(handleRestartTool({})).rejects.toThrow("Either name, all, or tag must be provided");
  });

  it("should restart server by name", async () => {
    mockRegistryService.findByName.mockReturnValue(server);
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

    const result = await handleRestartTool({ name: "brave-tiger" });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].name).toBe("brave-tiger");
    expect(result.summary).toContain("Successfully restarted 1 server");
    expect(mockPM2.restart).toHaveBeenCalled();
  });

  it("should throw when server not found", async () => {
    mockRegistryService.findByName.mockReturnValue(undefined);

    await expect(handleRestartTool({ name: "nonexistent" }))
      .rejects.toThrow("Server \"nonexistent\" not found");
  });

  it("should restart all servers when all flag is set", async () => {
    const server2 = { ...server, name: "calm-panda", pm2Name: "servherd-calm-panda" };
    mockRegistryService.listServers.mockReturnValue([server, server2]);
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
      {
        pid: 12346,
        name: "servherd-calm-panda",
        pm2_env: {
          status: "online",
          pm_id: 1,
          name: "servherd-calm-panda",
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

    const result = await handleRestartTool({ all: true });

    expect(result.results).toHaveLength(2);
    expect(result.summary).toContain("2 servers");
  });

  it("should validate schema correctly", () => {
    const schema = restartToolSchema;

    // All empty should be valid (validation happens in handler)
    expect(schema.safeParse({}).success).toBe(true);

    // name only
    expect(schema.safeParse({ name: "test" }).success).toBe(true);

    // all only
    expect(schema.safeParse({ all: true }).success).toBe(true);

    // tag only
    expect(schema.safeParse({ tag: "frontend" }).success).toBe(true);
  });
});
