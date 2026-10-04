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
  findByCwdAndName: vi.fn(),
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
const { executeStart } = await import("../../../../src/cli/commands/start.js");

function server(overrides: Partial<ServerEntry> = {}): ServerEntry {
  return {
    id: "test-id",
    name: "brave-tiger",
    command: "node server.js",
    resolvedCommand: "node server.js",
    cwd: "/project",
    port: 3456,
    protocol: "http",
    hostname: "localhost",
    env: {},
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-brave-tiger",
    ...overrides,
  };
}

function pm2Process(status: "online" | "stopped") {
  return {
    pid: 12345,
    name: "servherd-brave-tiger",
    pm2_env: {
      status,
      pm_id: 0,
      name: "servherd-brave-tiger",
      pm_uptime: Date.now(),
      created_at: Date.now(),
      restart_time: 0,
      unstable_restarts: 0,
      pm_cwd: "/project",
      pm_exec_path: "node",
      exec_mode: "fork" as const,
      node_args: [],
      pm_out_log_path: "",
      pm_err_log_path: "",
      pm_pid_path: "",
      env: {},
    },
  };
}

describe("start command autorestart", () => {
  const mockPM2 = getMockPM2();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPM2._reset();
    mockConfigService.load.mockResolvedValue({
      version: "1",
      hostname: "localhost",
      protocol: "http",
      portRange: { min: 3000, max: 9999 },
      tempDir: "/tmp/servherd",
      pm2: { logDir: "/tmp/servherd/logs", pidDir: "/tmp/servherd/pids" },
    });
    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.findByCwdAndName.mockReturnValue(undefined);
    mockRegistryService.findByCommandHash.mockReturnValue(undefined);
    mockRegistryService.listServers.mockReturnValue([]);
  });

  it("records and applies autorestart for a new server", async () => {
    mockRegistryService.addServer.mockResolvedValue(server({ autorestart: true }));

    const result = await executeStart({ command: "node server.js", cwd: "/project", name: "brave-tiger", autorestart: true });

    expect(result.action).toBe("started");
    expect(mockRegistryService.addServer).toHaveBeenCalledWith(expect.objectContaining({ autorestart: true }));
    expect(mockPM2.start).toHaveBeenCalledWith(
      expect.objectContaining({ autorestart: true, exp_backoff_restart_delay: 100 }),
      expect.any(Function),
    );
  });

  it("leaves autorestart off for a new server by default", async () => {
    mockRegistryService.addServer.mockResolvedValue(server());

    await executeStart({ command: "node server.js", cwd: "/project", name: "brave-tiger" });

    expect(mockPM2.start).toHaveBeenCalledWith(expect.objectContaining({ autorestart: false }), expect.any(Function));
  });

  it("re-creates a running server when autorestart is turned on", async () => {
    mockRegistryService.findByCwdAndName.mockReturnValue(server());
    mockPM2._setProcesses([pm2Process("online")]);

    const result = await executeStart({ command: "node server.js", cwd: "/project", name: "brave-tiger", autorestart: true });

    expect(result.action).toBe("restarted");
    expect(result.autorestartChanged).toBe(true);
    expect(result.server.autorestart).toBe(true);
    expect(mockRegistryService.updateServer).toHaveBeenCalledWith("test-id", expect.objectContaining({ autorestart: true }));
    expect(mockPM2.delete).toHaveBeenCalledWith("servherd-brave-tiger", expect.any(Function));
    expect(mockPM2.start).toHaveBeenCalledWith(expect.objectContaining({ autorestart: true }), expect.any(Function));
  });

  it("re-creates a running server when autorestart is turned off", async () => {
    mockRegistryService.findByCwdAndName.mockReturnValue(server({ autorestart: true }));
    mockPM2._setProcesses([pm2Process("online")]);

    const result = await executeStart({ command: "node server.js", cwd: "/project", name: "brave-tiger", autorestart: false });

    expect(result.autorestartChanged).toBe(true);
    expect(mockPM2.start).toHaveBeenCalledWith(expect.objectContaining({ autorestart: false }), expect.any(Function));
  });

  it("keeps a running server's setting when the option is omitted", async () => {
    mockRegistryService.findByCwdAndName.mockReturnValue(server({ autorestart: true }));
    mockPM2._setProcesses([pm2Process("online")]);

    const result = await executeStart({ command: "node server.js", cwd: "/project", name: "brave-tiger" });

    expect(result.action).toBe("existing");
    expect(mockPM2.start).not.toHaveBeenCalled();
  });

  it("restores autorestart when pm2 no longer has the process", async () => {
    mockRegistryService.findByCwdAndName.mockReturnValue(server({ autorestart: true }));

    const result = await executeStart({ command: "node server.js", cwd: "/project", name: "brave-tiger" });

    expect(result.action).toBe("restarted");
    expect(mockPM2.start).toHaveBeenCalledWith(
      expect.objectContaining({ autorestart: true, exp_backoff_restart_delay: 100 }),
      expect.any(Function),
    );
  });

  it("applies a requested autorestart change during a config drift refresh", async () => {
    mockRegistryService.findByCwdAndName.mockReturnValue(server({
      command: "node server.js --host {{hostname}}",
      usedConfigKeys: ["hostname"],
      configSnapshot: { hostname: "old-host" },
    }));
    mockPM2._setProcesses([pm2Process("online")]);

    const result = await executeStart({
      command: "node server.js --host {{hostname}}", cwd: "/project", name: "brave-tiger", autorestart: true,
    });

    expect(result.action).toBe("refreshed");
    expect(result.server.autorestart).toBe(true);
    expect(mockPM2.start).toHaveBeenCalledWith(expect.objectContaining({ autorestart: true }), expect.any(Function));
  });
});
