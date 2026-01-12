import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2, createMockProcess } from "../../../mocks/pm2.js";
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
  save: vi.fn(),
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Import after mocking
const { executeInfo } = await import("../../../../src/cli/commands/info.js");

describe("info command", () => {
  const mockPM2 = getMockPM2();

  const existingServer: ServerEntry = {
    id: "test-id",
    name: "brave-tiger",
    command: "npm start --port {{port}}",
    resolvedCommand: "npm start --port 3456",
    cwd: "/project",
    port: 3456,
    protocol: "http",
    hostname: "localhost",
    env: { NODE_ENV: "development" },
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-brave-tiger",
    tags: ["frontend", "dev"],
    description: "My test server",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPM2._reset();

    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.findByName.mockReturnValue(undefined);
  });

  it("should display detailed server information", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    mockPM2._setProcesses([
      createMockProcess({
        name: existingServer.pm2Name,
        pm2_env: {
          status: "online",
          pm_id: 0,
          name: existingServer.pm2Name,
          pm_uptime: Date.now() - 60000, // 1 minute ago
          created_at: Date.now() - 120000, // 2 minutes ago
          restart_time: 2,
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
        monit: {
          memory: 50000000, // ~50MB
          cpu: 1.5,
        },
      }),
    ]);

    const result = await executeInfo({ name: "brave-tiger" });

    expect(result.name).toBe("brave-tiger");
    expect(result.status).toBe("online");
    expect(result.url).toBe("http://localhost:3456");
    expect(result.cwd).toBe("/project");
    expect(result.command).toBe("npm start --port {{port}}");
    expect(result.resolvedCommand).toBe("npm start --port 3456");
    expect(result.port).toBe(3456);
    expect(result.tags).toEqual(["frontend", "dev"]);
    expect(result.description).toBe("My test server");
    expect(result.restarts).toBe(2);
  });

  it("should throw when server not found", async () => {
    mockRegistryService.findByName.mockReturnValue(undefined);

    await expect(executeInfo({ name: "nonexistent" })).rejects.toThrow("Server \"nonexistent\" not found");
  });

  it("should include pid when process is running", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    mockPM2._setProcesses([
      createMockProcess({
        pid: 12345,
        name: existingServer.pm2Name,
      }),
    ]);

    const result = await executeInfo({ name: "brave-tiger" });

    expect(result.pid).toBe(12345);
  });

  it("should show stopped status when process is not running", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    mockPM2._setProcesses([
      createMockProcess({
        name: existingServer.pm2Name,
        pm2_env: {
          status: "stopped",
          pm_id: 0,
          name: existingServer.pm2Name,
          pm_uptime: 0,
          created_at: Date.now() - 120000,
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

    const result = await executeInfo({ name: "brave-tiger" });

    expect(result.status).toBe("stopped");
  });

  it("should include memory and cpu usage when available", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    mockPM2._setProcesses([
      createMockProcess({
        name: existingServer.pm2Name,
        monit: {
          memory: 52428800, // 50 MB
          cpu: 2.5,
        },
      }),
    ]);

    const result = await executeInfo({ name: "brave-tiger" });

    expect(result.memory).toBe(52428800);
    expect(result.cpu).toBe(2.5);
  });

  it("should show unknown status when process not in PM2", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    // No processes in PM2
    mockPM2._setProcesses([]);

    const result = await executeInfo({ name: "brave-tiger" });

    expect(result.status).toBe("unknown");
    expect(result.pid).toBeUndefined();
  });

  it("should include environment variables", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

    const result = await executeInfo({ name: "brave-tiger" });

    expect(result.env).toEqual({ NODE_ENV: "development" });
  });
});
