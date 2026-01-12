import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2 } from "../../../mocks/pm2.js";
import type { ServerEntry } from "../../../../src/types/registry.js";
import { DEFAULT_CONFIG } from "../../../../src/types/config.js";

// Mock PM2 before other imports
vi.mock("pm2", async () => {
  const { mockPM2Module } = await import("../../../mocks/pm2.js");
  return mockPM2Module;
});

// Mock RegistryService
const mockRegistryService = {
  load: vi.fn(),
  findByName: vi.fn(),
  findById: vi.fn(),
  listServers: vi.fn(),
  updateServer: vi.fn(),
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Mock ConfigService
const mockConfigService = {
  load: vi.fn(),
};

vi.mock("../../../../src/services/config.service.js", () => ({
  ConfigService: vi.fn().mockImplementation(() => mockConfigService),
}));

// Import after mocking
const { handleRefreshTool, refreshToolName, refreshToolDescription, refreshToolSchema } =
  await import("../../../../src/mcp/tools/refresh.js");

describe("servherd_refresh MCP tool", () => {
  const mockPM2 = getMockPM2();

  const serverWithDrift: ServerEntry = {
    id: "test-id",
    name: "brave-tiger",
    command: "npm start --host {{hostname}}",
    resolvedCommand: "npm start --host localhost",
    cwd: "/project",
    port: 3456,
    protocol: "http",
    hostname: "localhost",
    env: {},
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-brave-tiger",
    usedConfigKeys: ["hostname"],
    configSnapshot: {
      hostname: "localhost",
    },
  };

  const serverWithoutDrift: ServerEntry = {
    id: "test-id-2",
    name: "calm-panda",
    command: "npm start --port {{port}}",
    resolvedCommand: "npm start --port 4567",
    cwd: "/project2",
    port: 4567,
    protocol: "http",
    hostname: "localhost",
    env: {},
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-calm-panda",
    usedConfigKeys: [],
    configSnapshot: {},
  };

  const configWithChangedHostname = {
    ...DEFAULT_CONFIG,
    hostname: "dev.local", // Changed from "localhost"
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPM2._reset();
    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.findByName.mockReturnValue(undefined);
    mockRegistryService.findById.mockReturnValue(undefined);
    mockRegistryService.listServers.mockReturnValue([]);
    mockRegistryService.updateServer.mockResolvedValue(undefined);
    mockConfigService.load.mockResolvedValue(configWithChangedHostname);
  });

  it("should have correct tool name", () => {
    expect(refreshToolName).toBe("servherd_refresh");
  });

  it("should have a description", () => {
    expect(refreshToolDescription).toBeDefined();
    expect(refreshToolDescription.length).toBeGreaterThan(10);
  });

  it("should return no drift message when no servers have drift", async () => {
    mockRegistryService.listServers.mockReturnValue([serverWithoutDrift]);

    const result = await handleRefreshTool({ all: true });

    expect(result.results).toHaveLength(0);
    expect(result.summary).toContain("No servers have config drift");
  });

  it("should detect servers with config drift", async () => {
    mockRegistryService.listServers.mockReturnValue([serverWithDrift]);
    mockRegistryService.findById.mockReturnValue(serverWithDrift);
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

    const result = await handleRefreshTool({ all: true });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].name).toBe("brave-tiger");
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].driftDetails).toContain("hostname");
  });

  it("should refresh a specific server by name", async () => {
    mockRegistryService.findByName.mockReturnValue(serverWithDrift);
    mockRegistryService.findById.mockReturnValue(serverWithDrift);
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

    const result = await handleRefreshTool({ name: "brave-tiger" });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].name).toBe("brave-tiger");
    expect(result.results[0].success).toBe(true);
    expect(mockRegistryService.updateServer).toHaveBeenCalled();
  });

  it("should throw when server not found", async () => {
    mockRegistryService.findByName.mockReturnValue(undefined);

    await expect(handleRefreshTool({ name: "nonexistent" }))
      .rejects.toThrow("Server \"nonexistent\" not found");
  });

  it("should support dry-run mode", async () => {
    mockRegistryService.listServers.mockReturnValue([serverWithDrift]);

    const result = await handleRefreshTool({ all: true, dryRun: true });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].skipped).toBe(true);
    expect(result.results[0].message).toContain("dry-run");
    expect(result.summary).toContain("Dry run");
    // Should not actually restart
    expect(mockPM2.delete).not.toHaveBeenCalled();
    expect(mockPM2.start).not.toHaveBeenCalled();
  });

  it("should filter by tag", async () => {
    const taggedServer = { ...serverWithDrift, tags: ["frontend"] };
    mockRegistryService.listServers.mockReturnValue([taggedServer]);
    mockRegistryService.findById.mockReturnValue(taggedServer);
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

    const result = await handleRefreshTool({ tag: "frontend" });

    expect(result.results).toHaveLength(1);
    expect(mockRegistryService.listServers).toHaveBeenCalledWith({ tag: "frontend" });
  });

  it("should validate schema correctly", () => {
    const schema = refreshToolSchema;

    // All empty should be valid (no validation in schema)
    expect(schema.safeParse({}).success).toBe(true);

    // name only
    expect(schema.safeParse({ name: "test" }).success).toBe(true);

    // all only
    expect(schema.safeParse({ all: true }).success).toBe(true);

    // tag only
    expect(schema.safeParse({ tag: "frontend" }).success).toBe(true);

    // dryRun
    expect(schema.safeParse({ all: true, dryRun: true }).success).toBe(true);
  });

  it("should handle multiple servers with drift", async () => {
    const server2 = {
      ...serverWithDrift,
      id: "test-id-2",
      name: "swift-fox",
      pm2Name: "servherd-swift-fox",
    };
    mockRegistryService.listServers.mockReturnValue([serverWithDrift, server2]);
    mockRegistryService.findById
      .mockReturnValueOnce(serverWithDrift)
      .mockReturnValueOnce(server2);
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
        name: "servherd-swift-fox",
        pm2_env: {
          status: "online",
          pm_id: 1,
          name: "servherd-swift-fox",
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

    const result = await handleRefreshTool({ all: true });

    expect(result.results).toHaveLength(2);
    expect(result.summary).toContain("2 servers");
  });
});
