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
  removeServer: vi.fn(),
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Mock @inquirer/prompts to prevent interactive prompts
vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

// Import after mocking
const { handleRemoveTool, removeToolName, removeToolDescription, removeToolSchema } =
  await import("../../../../src/mcp/tools/remove.js");

describe("servherd_remove MCP tool", () => {
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
    mockRegistryService.removeServer.mockResolvedValue(undefined);
  });

  it("should have correct tool name", () => {
    expect(removeToolName).toBe("servherd_remove");
  });

  it("should have a description", () => {
    expect(removeToolDescription).toBeDefined();
    expect(removeToolDescription.length).toBeGreaterThan(10);
  });

  it("should require at least one of name, all, or tag", async () => {
    await expect(handleRemoveTool({})).rejects.toThrow("Either name, all, or tag must be provided");
  });

  it("should remove server by name", async () => {
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

    const result = await handleRemoveTool({ name: "brave-tiger" });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].name).toBe("brave-tiger");
    expect(result.summary).toContain("Successfully removed 1 server");
    expect(mockPM2.delete).toHaveBeenCalled();
    expect(mockRegistryService.removeServer).toHaveBeenCalledWith(server.id);
  });

  it("should return error when server not found", async () => {
    mockRegistryService.findByName.mockReturnValue(undefined);

    const result = await handleRemoveTool({ name: "nonexistent" });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].message).toContain("not found");
  });

  it("should remove all servers when all flag is set", async () => {
    const server2 = { ...server, id: "id-2", name: "calm-panda", pm2Name: "servherd-calm-panda" };
    mockRegistryService.listServers.mockReturnValue([server, server2]);

    const result = await handleRemoveTool({ all: true });

    expect(result.results).toHaveLength(2);
    expect(result.summary).toContain("2 servers");
  });

  it("should force remove without confirmation (MCP context)", async () => {
    mockRegistryService.findByName.mockReturnValue(server);
    mockPM2._setProcesses([]);

    const result = await handleRemoveTool({ name: "brave-tiger" });

    // Should not require confirmation in MCP context (force is auto-set)
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
  });

  it("should validate schema correctly", () => {
    const schema = removeToolSchema;

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
