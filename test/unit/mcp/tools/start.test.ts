import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2 } from "../../../mocks/pm2.js";
import type { ServerEntry } from "../../../../src/types/registry.js";

// Mock PM2 before other imports
vi.mock("pm2", async () => {
  const { mockPM2Module } = await import("../../../mocks/pm2.js");
  return mockPM2Module;
});

// Mock ConfigService
const mockConfigService = {
  load: vi.fn(),
  get: vi.fn(),
};

// Mock RegistryService
const mockRegistryService = {
  load: vi.fn(),
  addServer: vi.fn(),
  findByCommandHash: vi.fn(),
  findByName: vi.fn(),
  updateServer: vi.fn(),
  listServers: vi.fn(),
  save: vi.fn(),
};

vi.mock("../../../../src/services/config.service.js", () => ({
  ConfigService: vi.fn().mockImplementation(() => mockConfigService),
}));

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Import after mocking
const { handleStartTool, startToolName, startToolDescription, startToolSchema } =
  await import("../../../../src/mcp/tools/start.js");

describe("servherd_start MCP tool", () => {
  const mockPM2 = getMockPM2();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPM2._reset();

    // Setup default config mock
    mockConfigService.load.mockResolvedValue({
      version: "1",
      hostname: "localhost",
      protocol: "http",
      portRange: { min: 3000, max: 9999 },
      tempDir: "/tmp/servherd",
      pm2: { logDir: "/tmp/servherd/logs", pidDir: "/tmp/servherd/pids" },
    });
    mockConfigService.get.mockReturnValue("localhost");

    // Setup default registry mock
    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.findByCommandHash.mockReturnValue(undefined);
    mockRegistryService.findByName.mockReturnValue(undefined);
    mockRegistryService.listServers.mockReturnValue([]);
  });

  it("should have correct tool name", () => {
    expect(startToolName).toBe("servherd_start");
  });

  it("should have a description", () => {
    expect(startToolDescription).toBeDefined();
    expect(startToolDescription.length).toBeGreaterThan(10);
  });

  it("should have command as a required field in schema", () => {
    const schema = startToolSchema;
    // Validate that command is required by trying to parse without it
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should validate schema with command", () => {
    const schema = startToolSchema;
    const result = schema.safeParse({ command: "npm start" });
    expect(result.success).toBe(true);
  });

  it("should start a new server and return structured result", async () => {
    const newServer: ServerEntry = {
      id: "test-id",
      name: "brave-tiger",
      command: "npm start --port {{port}}",
      resolvedCommand: "npm start --port 3456",
      cwd: "/project",
      port: 3456,
      protocol: "http",
      hostname: "localhost",
      env: {},
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-brave-tiger",
    };

    mockRegistryService.addServer.mockResolvedValue(newServer);

    const result = await handleStartTool({
      command: "npm start --port {{port}}",
      cwd: "/project",
    });

    expect(result.action).toBe("started");
    expect(result.name).toBe("brave-tiger");
    expect(result.port).toBe(3456);
    expect(result.url).toBe("http://localhost:3456");
    expect(result.status).toBe("online");
    expect(result.message).toContain("started");
  });

  it("should return existing action when server is already running", async () => {
    const existingServer: ServerEntry = {
      id: "existing-id",
      name: "calm-panda",
      command: "npm start",
      resolvedCommand: "npm start",
      cwd: "/project",
      port: 3456,
      protocol: "http",
      hostname: "localhost",
      env: {},
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-calm-panda",
    };

    mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
    mockPM2._setProcesses([
      {
        pid: 12345,
        name: "servherd-calm-panda",
        pm2_env: {
          status: "online",
          pm_id: 0,
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

    const result = await handleStartTool({
      command: "npm start",
      cwd: "/project",
    });

    expect(result.action).toBe("existing");
    expect(result.name).toBe("calm-panda");
    expect(result.message).toContain("already running");
  });

  it("should accept optional parameters", async () => {
    const schema = startToolSchema;
    const result = schema.safeParse({
      command: "npm start",
      cwd: "/path/to/project",
      name: "my-server",
      tags: ["frontend", "dev"],
      description: "My development server",
      env: { DEBUG: "true" },
    });

    expect(result.success).toBe(true);
  });
});
