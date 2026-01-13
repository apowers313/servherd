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
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Import after mocking
const { handleLogsTool, logsToolName, logsToolDescription, logsToolSchema } =
  await import("../../../../src/mcp/tools/logs.js");

describe("servherd_logs MCP tool", () => {
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
  });

  it("should have correct tool name", () => {
    expect(logsToolName).toBe("servherd_logs");
  });

  it("should have a description", () => {
    expect(logsToolDescription).toBeDefined();
    expect(logsToolDescription.length).toBeGreaterThan(10);
  });

  it("should allow empty parameters for flush all", () => {
    const schema = logsToolSchema;
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should validate schema with name", () => {
    const schema = logsToolSchema;
    const result = schema.safeParse({ name: "brave-tiger" });
    expect(result.success).toBe(true);
  });

  it("should accept optional lines and error parameters", () => {
    const schema = logsToolSchema;
    const result = schema.safeParse({
      name: "brave-tiger",
      lines: 100,
      error: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept since, head, flush, and all parameters", () => {
    const schema = logsToolSchema;
    const result = schema.safeParse({
      name: "brave-tiger",
      since: "1h",
      head: 10,
    });
    expect(result.success).toBe(true);

    const flushResult = schema.safeParse({
      flush: true,
      all: true,
    });
    expect(flushResult.success).toBe(true);
  });

  it("should throw when server not found", async () => {
    mockRegistryService.findByName.mockReturnValue(undefined);

    await expect(handleLogsTool({ name: "nonexistent" }))
      .rejects.toThrow("Server \"nonexistent\" not found");
  });

  it("should return logs with metadata", async () => {
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
          pm_out_log_path: "/logs/out.log",
          pm_err_log_path: "/logs/err.log",
          pm_pid_path: "",
          env: {},
        },
      },
    ]);

    const result = await handleLogsTool({ name: "brave-tiger" });

    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("logs");
    if ("logs" in result) {
      expect(result.name).toBe("brave-tiger");
      expect(result.status).toBe("online");
      expect(result.logs).toContain("log line");
      expect(result.lineCount).toBeGreaterThan(0);
      expect(result.logType).toBe("output");
      expect(result.logPath).toBe("/logs/out.log");
    }
  });

  it("should return error logs when error flag is set", async () => {
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
          pm_out_log_path: "/logs/out.log",
          pm_err_log_path: "/logs/err.log",
          pm_pid_path: "",
          env: {},
        },
      },
    ]);

    const result = await handleLogsTool({ name: "brave-tiger", error: true });

    if ("logType" in result) {
      expect(result.logType).toBe("error");
      expect(result.logPath).toBe("/logs/err.log");
    }
  });

  describe("flush functionality", () => {
    it("should flush logs for a specific server", async () => {
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
            pm_out_log_path: "/logs/out.log",
            pm_err_log_path: "/logs/err.log",
            pm_pid_path: "",
            env: {},
          },
        },
      ]);

      const result = await handleLogsTool({ name: "brave-tiger", flush: true });

      expect(result).toHaveProperty("flushed");
      if ("flushed" in result) {
        expect(result.flushed).toBe(true);
        expect(result.name).toBe("brave-tiger");
        expect(result.message).toContain("brave-tiger");
      }
    });

    it("should flush all logs", async () => {
      const result = await handleLogsTool({ flush: true, all: true });

      expect(result).toHaveProperty("flushed");
      if ("flushed" in result) {
        expect(result.flushed).toBe(true);
        expect(result.all).toBe(true);
        expect(result.message).toContain("servherd-managed servers");
      }
    });
  });
});
