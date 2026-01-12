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
const { handleStopTool, stopToolName, stopToolDescription, stopToolSchema } =
  await import("../../../../src/mcp/tools/stop.js");

describe("servherd_stop MCP tool", () => {
  const mockPM2 = getMockPM2();

  const existingServer: ServerEntry = {
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
    expect(stopToolName).toBe("servherd_stop");
  });

  it("should have a description", () => {
    expect(stopToolDescription).toBeDefined();
    expect(stopToolDescription.length).toBeGreaterThan(10);
  });

  it("should require at least one of name, all, or tag", async () => {
    await expect(handleStopTool({})).rejects.toThrow("Either name, all, or tag must be provided");
  });

  it("should stop server by name", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
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

    const result = await handleStopTool({ name: "brave-tiger" });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].name).toBe("brave-tiger");
    expect(result.summary).toContain("Successfully stopped 1 server");
  });

  it("should return error when server not found", async () => {
    mockRegistryService.findByName.mockReturnValue(undefined);

    const result = await handleStopTool({ name: "nonexistent" });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].message).toContain("not found");
  });

  it("should stop all servers when all flag is set", async () => {
    const server1 = { ...existingServer, name: "server1", pm2Name: "servherd-server1" };
    const server2 = { ...existingServer, name: "server2", pm2Name: "servherd-server2" };
    mockRegistryService.listServers.mockReturnValue([server1, server2]);
    mockPM2._setProcesses([
      {
        pid: 12345,
        name: "servherd-server1",
        pm2_env: {
          status: "online",
          pm_id: 0,
          name: "servherd-server1",
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
        name: "servherd-server2",
        pm2_env: {
          status: "online",
          pm_id: 1,
          name: "servherd-server2",
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

    const result = await handleStopTool({ all: true });

    expect(result.results).toHaveLength(2);
    expect(result.summary).toContain("2 servers");
  });

  it("should validate schema correctly", () => {
    const schema = stopToolSchema;

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
