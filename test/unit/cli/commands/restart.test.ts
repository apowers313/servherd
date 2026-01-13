import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2, createMockProcess } from "../../../mocks/pm2.js";
import type { ServerEntry } from "../../../../src/types/registry.js";
import type { GlobalConfig } from "../../../../src/types/config.js";

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
  findByCwdAndName: vi.fn(),
  listServers: vi.fn(),
  save: vi.fn(),
  updateServer: vi.fn(),
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Mock ConfigService
const mockConfig: GlobalConfig = {
  hostname: "localhost",
  protocol: "http",
  portRange: { min: 3000, max: 3999 },
  refreshOnChange: "manual",
};

const mockConfigService = {
  load: vi.fn().mockResolvedValue(mockConfig),
  save: vi.fn(),
};

vi.mock("../../../../src/services/config.service.js", () => ({
  ConfigService: vi.fn().mockImplementation(() => mockConfigService),
}));

// Import after mocking
const { executeRestart, restartAction } = await import("../../../../src/cli/commands/restart.js");

describe("restart command", () => {
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
  });

  it("should restart server by name", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

    const result = await executeRestart({ name: "brave-tiger" });

    expect(result.success).toBe(true);
    expect(result.name).toBe("brave-tiger");
    expect(mockPM2.restart).toHaveBeenCalledWith("servherd-brave-tiger", expect.any(Function));
  });

  it("should throw when server not found", async () => {
    mockRegistryService.findByName.mockReturnValue(undefined);

    await expect(executeRestart({ name: "nonexistent" })).rejects.toThrow("Server \"nonexistent\" not found");
  });

  it("should handle PM2 restart errors gracefully", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);

    // Make PM2 restart fail
    mockPM2.restart.mockImplementationOnce(
      (name: string, callback: (err?: Error) => void) => {
        callback(new Error("PM2 restart error"));
      },
    );

    const result = await executeRestart({ name: "brave-tiger" });

    expect(result.success).toBe(false);
    expect(result.message).toContain("PM2 restart error");
  });

  it("should restart all servers when --all flag is used", async () => {
    const server1 = { ...existingServer, name: "server-1", pm2Name: "servherd-server-1" };
    const server2 = { ...existingServer, id: "test-id-2", name: "server-2", pm2Name: "servherd-server-2" };

    mockRegistryService.listServers.mockReturnValue([server1, server2]);
    mockPM2._setProcesses([
      createMockProcess({ name: server1.pm2Name }),
      createMockProcess({ name: server2.pm2Name }),
    ]);

    const results = await executeRestart({ all: true });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
    expect(mockPM2.restart).toHaveBeenCalledTimes(2);
  });

  it("should return empty results when no servers and --all flag", async () => {
    mockRegistryService.listServers.mockReturnValue([]);

    const results = await executeRestart({ all: true });

    expect(results).toHaveLength(0);
  });

  it("should return status after successful restart", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

    const result = await executeRestart({ name: "brave-tiger" });

    expect(result.status).toBe("online");
  });

  it("should restart servers by tag", async () => {
    const taggedServer = {
      ...existingServer,
      tags: ["frontend"],
    };

    mockRegistryService.listServers.mockImplementation((filter) => {
      if (filter?.tag === "frontend") {
        return [taggedServer];
      }
      return [];
    });

    mockPM2._setProcesses([createMockProcess({ name: taggedServer.pm2Name })]);

    const results = await executeRestart({ tag: "frontend" });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  it("should throw when no options provided", async () => {
    await expect(executeRestart({})).rejects.toThrow(
      "Either --name, --all, or --tag must be specified",
    );
  });

  describe("config refresh on restart", () => {
    const serverWithTemplate: ServerEntry = {
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
      usedConfigKeys: ["hostname"],
      configSnapshot: { hostname: "localhost" },
    };

    it("should restart normally when refreshOnChange is manual", async () => {
      mockConfigService.load.mockResolvedValue({
        ...mockConfig,
        refreshOnChange: "manual",
      });
      mockRegistryService.findByName.mockReturnValue(serverWithTemplate);
      mockPM2._setProcesses([createMockProcess({ name: serverWithTemplate.pm2Name })]);

      const result = await executeRestart({ name: "brave-tiger" });

      expect(result.success).toBe(true);
      expect(result.configRefreshed).toBeFalsy();
      expect(mockPM2.restart).toHaveBeenCalled();
    });

    it("should refresh config when refreshOnChange is on-start and drift detected", async () => {
      const serverWithDrift: ServerEntry = {
        ...serverWithTemplate,
        usedConfigKeys: ["hostname"],
        configSnapshot: { hostname: "old-hostname" },
      };

      mockConfigService.load.mockResolvedValue({
        ...mockConfig,
        refreshOnChange: "on-start",
        hostname: "new-hostname",
      });
      mockRegistryService.findByName.mockReturnValue(serverWithDrift);
      mockRegistryService.findById.mockReturnValue(serverWithDrift);
      mockRegistryService.updateServer.mockResolvedValue(undefined);
      mockPM2._setProcesses([createMockProcess({ name: serverWithDrift.pm2Name })]);

      const result = await executeRestart({ name: "brave-tiger" });

      expect(result.success).toBe(true);
      expect(result.configRefreshed).toBe(true);
      expect(mockRegistryService.updateServer).toHaveBeenCalled();
    });

    it("should restart normally when on-start mode but no drift", async () => {
      mockConfigService.load.mockResolvedValue({
        ...mockConfig,
        refreshOnChange: "on-start",
      });
      mockRegistryService.findByName.mockReturnValue(serverWithTemplate);
      mockPM2._setProcesses([createMockProcess({ name: serverWithTemplate.pm2Name })]);

      const result = await executeRestart({ name: "brave-tiger" });

      expect(result.success).toBe(true);
      expect(result.configRefreshed).toBeFalsy();
      expect(mockPM2.restart).toHaveBeenCalled();
    });
  });

  describe("restartAction CLI handler", () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let originalExitCode: number | undefined;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      originalExitCode = process.exitCode;
      process.exitCode = undefined;
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      process.exitCode = originalExitCode;
    });

    it("should show error when no name, --all, or --tag provided", async () => {
      await restartAction(undefined, {});

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("should show JSON error when no options and --json flag", async () => {
      await restartAction(undefined, { json: true });

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(JSON.parse(output)).toHaveProperty("error");
      expect(process.exitCode).toBe(1);
    });

    it("should output formatted result on success", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      await restartAction("brave-tiger", {});

      expect(consoleSpy).toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });

    it("should output JSON result when --json flag is set", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      await restartAction("brave-tiger", { json: true });

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toHaveProperty("results");
    });

    it("should handle errors with JSON output", async () => {
      mockRegistryService.findByName.mockReturnValue(undefined);

      await restartAction("nonexistent", { json: true });

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(JSON.parse(output)).toHaveProperty("error");
      expect(process.exitCode).toBe(1);
    });

    it("should handle errors with text output", async () => {
      mockRegistryService.findByName.mockReturnValue(undefined);

      await restartAction("nonexistent", {});

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });
});
