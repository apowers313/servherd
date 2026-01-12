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
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Import after mocking
const { handleInfoTool, infoToolName, infoToolDescription, infoToolSchema } =
  await import("../../../../src/mcp/tools/info.js");

describe("servherd_info MCP tool", () => {
  const mockPM2 = getMockPM2();

  const server: ServerEntry = {
    id: "test-id",
    name: "brave-tiger",
    command: "npm start --port {{port}}",
    resolvedCommand: "npm start --port 3456",
    cwd: "/project",
    port: 3456,
    protocol: "http",
    hostname: "localhost",
    env: { DEBUG: "true" },
    tags: ["frontend"],
    description: "Test server",
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-brave-tiger",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPM2._reset();
    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.findByName.mockReturnValue(undefined);
  });

  it("should have correct tool name", () => {
    expect(infoToolName).toBe("servherd_info");
  });

  it("should have a description", () => {
    expect(infoToolDescription).toBeDefined();
    expect(infoToolDescription.length).toBeGreaterThan(10);
  });

  it("should require name parameter", () => {
    const schema = infoToolSchema;
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should validate schema with name", () => {
    const schema = infoToolSchema;
    const result = schema.safeParse({ name: "brave-tiger" });
    expect(result.success).toBe(true);
  });

  it("should throw when server not found", async () => {
    mockRegistryService.findByName.mockReturnValue(undefined);

    await expect(handleInfoTool({ name: "nonexistent" }))
      .rejects.toThrow("Server \"nonexistent\" not found");
  });

  it("should return detailed server information", async () => {
    mockRegistryService.findByName.mockReturnValue(server);
    const uptime = Date.now() - 60000; // Started 1 minute ago
    mockPM2._setProcesses([
      {
        pid: 12345,
        name: "servherd-brave-tiger",
        pm2_env: {
          status: "online",
          pm_id: 0,
          name: "servherd-brave-tiger",
          pm_uptime: uptime,
          created_at: Date.now(),
          restart_time: 2,
          unstable_restarts: 0,
          pm_cwd: "/project",
          pm_exec_path: "npm",
          exec_mode: "fork",
          node_args: [],
          pm_out_log_path: "/logs/out.log",
          pm_err_log_path: "/logs/err.log",
          pm_pid_path: "",
          env: {},
        },
        monit: {
          memory: 50 * 1024 * 1024, // 50 MB
          cpu: 5,
        },
      },
    ]);

    const result = await handleInfoTool({ name: "brave-tiger" });

    expect(result.name).toBe("brave-tiger");
    expect(result.status).toBe("online");
    expect(result.url).toBe("http://localhost:3456");
    expect(result.cwd).toBe("/project");
    expect(result.command).toBe("npm start --port {{port}}");
    expect(result.resolvedCommand).toBe("npm start --port 3456");
    expect(result.port).toBe(3456);
    expect(result.hostname).toBe("localhost");
    expect(result.protocol).toBe("http");
    expect(result.pid).toBe(12345);
    expect(result.uptime).toBe(uptime);
    expect(result.uptimeFormatted).toBeDefined();
    expect(result.restarts).toBe(2);
    expect(result.memory).toBe(50 * 1024 * 1024);
    expect(result.memoryFormatted).toContain("MB");
    expect(result.cpu).toBe(5);
    expect(result.tags).toEqual(["frontend"]);
    expect(result.description).toBe("Test server");
    expect(result.pm2Name).toBe("servherd-brave-tiger");
    expect(result.outLogPath).toBe("/logs/out.log");
    expect(result.errLogPath).toBe("/logs/err.log");
  });

  it("should handle server with no process in PM2", async () => {
    mockRegistryService.findByName.mockReturnValue(server);
    mockPM2._setProcesses([]);

    const result = await handleInfoTool({ name: "brave-tiger" });

    expect(result.name).toBe("brave-tiger");
    expect(result.status).toBe("unknown");
    expect(result.pid).toBeUndefined();
    expect(result.uptime).toBeUndefined();
  });
});
