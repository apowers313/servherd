import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2, createMockProcess } from "../../../mocks/pm2.js";
import type { ServerEntry } from "../../../../src/types/registry.js";

// Mock PM2 before other imports
vi.mock("pm2", async () => {
  const { mockPM2Module } = await import("../../../mocks/pm2.js");
  return mockPM2Module;
});

// Mock fs/promises for log reading
const mockReadFile = vi.fn();
vi.mock("fs/promises", () => ({
  readFile: mockReadFile,
}));

// Mock fs-extra for pathExists
vi.mock("fs-extra/esm", () => ({
  pathExists: vi.fn().mockResolvedValue(true),
  readJson: vi.fn(),
  ensureDir: vi.fn(),
  writeJson: vi.fn(),
}));

// Mock RegistryService
const mockRegistryService = {
  load: vi.fn(),
  findByName: vi.fn(),
  listServers: vi.fn(),
  save: vi.fn(),
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Import after mocking
const { executeLogs, executeFlush } = await import("../../../../src/cli/commands/logs.js");

describe("logs command", () => {
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
    mockReadFile.mockResolvedValue("log line 1\nlog line 2\nlog line 3");
  });

  describe("executeLogs", () => {
    it("should retrieve server logs", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2._setProcesses([
        createMockProcess({
          name: existingServer.pm2Name,
          pm2_env: {
            status: "online",
            pm_id: 0,
            name: existingServer.pm2Name,
            pm_uptime: Date.now(),
            created_at: Date.now(),
            restart_time: 0,
            unstable_restarts: 0,
            pm_cwd: "/project",
            pm_exec_path: "npm",
            exec_mode: "fork",
            node_args: [],
            pm_out_log_path: "/tmp/servherd/logs/out.log",
            pm_err_log_path: "/tmp/servherd/logs/err.log",
            pm_pid_path: "/tmp/servherd/pids/pid",
            env: {},
          },
        }),
      ]);

      const result = await executeLogs({ name: "brave-tiger", lines: 50 });

      expect(result.logs).toContain("log line 1");
      expect(result.logs).toContain("log line 2");
      expect(result.name).toBe("brave-tiger");
      expect(result.outLogPath).toBe("/tmp/servherd/logs/out.log");
    });

    it("should throw when server not found", async () => {
      mockRegistryService.findByName.mockReturnValue(undefined);

      await expect(executeLogs({ name: "nonexistent" })).rejects.toThrow("Server \"nonexistent\" not found");
    });

    it("should respect lines parameter", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2._setProcesses([
        createMockProcess({
          name: existingServer.pm2Name,
          pm2_env: {
            status: "online",
            pm_id: 0,
            name: existingServer.pm2Name,
            pm_uptime: Date.now(),
            created_at: Date.now(),
            restart_time: 0,
            unstable_restarts: 0,
            pm_cwd: "/project",
            pm_exec_path: "npm",
            exec_mode: "fork",
            node_args: [],
            pm_out_log_path: "/tmp/servherd/logs/out.log",
            pm_err_log_path: "/tmp/servherd/logs/err.log",
            pm_pid_path: "/tmp/servherd/pids/pid",
            env: {},
          },
        }),
      ]);

      const result = await executeLogs({ name: "brave-tiger", lines: 10 });

      expect(result.lines).toBe(10);
    });

    it("should include error logs when error flag is set", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2._setProcesses([
        createMockProcess({
          name: existingServer.pm2Name,
          pm2_env: {
            status: "online",
            pm_id: 0,
            name: existingServer.pm2Name,
            pm_uptime: Date.now(),
            created_at: Date.now(),
            restart_time: 0,
            unstable_restarts: 0,
            pm_cwd: "/project",
            pm_exec_path: "npm",
            exec_mode: "fork",
            node_args: [],
            pm_out_log_path: "/tmp/servherd/logs/out.log",
            pm_err_log_path: "/tmp/servherd/logs/err.log",
            pm_pid_path: "/tmp/servherd/pids/pid",
            env: {},
          },
        }),
      ]);

      const result = await executeLogs({ name: "brave-tiger", error: true });

      expect(result.errLogPath).toBe("/tmp/servherd/logs/err.log");
    });

    it("should return unknown status when process not in PM2", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2._setProcesses([]);

      const result = await executeLogs({ name: "brave-tiger" });

      expect(result.status).toBe("unknown");
    });

    it("should use default lines when not specified", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      const result = await executeLogs({ name: "brave-tiger" });

      expect(result.lines).toBe(50); // Default value
    });

    it("should throw when name is not provided", async () => {
      await expect(executeLogs({})).rejects.toThrow("Server name is required");
    });

    // Regression test: --lines should return exactly N lines, not N-1
    // Bug: when log file ends with newline, split("\n") creates an empty string
    // as the last element, causing slice(-N) to include it and return N-1 actual lines
    it("should return exactly N lines when file ends with newline", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      // Simulate a log file that ends with a newline (common case)
      mockReadFile.mockResolvedValue("line 1\nline 2\nline 3\nline 4\nline 5\n");
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      const result = await executeLogs({ name: "brave-tiger", lines: 3 });

      // Should return exactly 3 lines, not 2
      const logLines = result.logs.split("\n").filter((line) => line.length > 0);
      expect(logLines).toHaveLength(3);
      expect(logLines).toEqual(["line 3", "line 4", "line 5"]);
    });
  });

  describe("--head option", () => {
    it("should return first N lines when head is specified", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockReadFile.mockResolvedValue("line 1\nline 2\nline 3\nline 4\nline 5");
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      const result = await executeLogs({ name: "brave-tiger", head: 2 });

      expect(result.logs).toBe("line 1\nline 2");
      expect(result.lines).toBe(2);
    });

    it("should handle head larger than file content", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockReadFile.mockResolvedValue("line 1\nline 2");
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      const result = await executeLogs({ name: "brave-tiger", head: 100 });

      expect(result.logs).toBe("line 1\nline 2");
    });
  });

  describe("--since option", () => {
    it("should filter logs by relative time", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);

      // Create logs with PM2 timestamp format: "timestamp: message"
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
      const recentTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
      mockReadFile.mockResolvedValue(
        `${oldTime}: old log\n${recentTime}: recent log 1\n${recentTime}: recent log 2`,
      );
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      const result = await executeLogs({ name: "brave-tiger", since: "1h" });

      // Should not include the old log
      expect(result.logs).not.toContain("old log");
      expect(result.logs).toContain("recent log");
    });

    it("should include lines without timestamps", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);

      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      mockReadFile.mockResolvedValue(
        `${oldTime}: old log\nno timestamp line\n`,
      );
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      const result = await executeLogs({ name: "brave-tiger", since: "1h" });

      // Lines without timestamps should be included
      expect(result.logs).toContain("no timestamp line");
    });

    // Regression test: PM2 timestamps should be parsed correctly
    it("should correctly filter PM2 timestamps", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);

      // Create logs with PM2 timestamp format
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
      const recentTime = new Date(Date.now() - 10 * 1000).toISOString(); // 10 seconds ago
      mockReadFile.mockResolvedValue(
        `${oldTime}: Health check: OK (uptime: 100s)\n${recentTime}: Health check: OK (uptime: 800s)`,
      );
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      const result = await executeLogs({ name: "brave-tiger", since: "30s" });

      // Should filter out the old log (2 hours ago) and keep only the recent one (10 seconds ago)
      expect(result.logs).not.toContain("uptime: 100s");
      expect(result.logs).toContain("uptime: 800s");
    });
  });

  describe("executeFlush", () => {
    it("should flush logs for specified server", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      const result = await executeFlush({ name: "brave-tiger" });

      expect(result.flushed).toBe(true);
      expect(result.name).toBe("brave-tiger");
      expect(result.message).toContain("brave-tiger");
      expect(mockPM2.flush).toHaveBeenCalledWith(existingServer.pm2Name, expect.any(Function));
    });

    it("should flush all logs with --all flag", async () => {
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      const result = await executeFlush({ all: true });

      expect(result.flushed).toBe(true);
      expect(result.all).toBe(true);
      expect(result.message).toContain("all servers");
      expect(mockPM2.flush).toHaveBeenCalledWith("all", expect.any(Function));
    });

    it("should throw when neither name nor --all is provided", async () => {
      await expect(executeFlush({})).rejects.toThrow("Server name is required");
    });

    it("should throw when server not found", async () => {
      mockRegistryService.findByName.mockReturnValue(undefined);

      await expect(executeFlush({ name: "nonexistent" })).rejects.toThrow("Server \"nonexistent\" not found");
    });
  });
});
