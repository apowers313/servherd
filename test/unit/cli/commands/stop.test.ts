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
const { executeStop, stopAction } = await import("../../../../src/cli/commands/stop.js");

describe("stop command", () => {
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
    mockRegistryService.listServers.mockReturnValue([]);
    mockRegistryService.findByName.mockReturnValue(undefined);
  });

  it("should stop server by name", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

    const results = await executeStop({ name: "brave-tiger" });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].name).toBe("brave-tiger");
    expect(mockPM2.stop).toHaveBeenCalledWith("servherd-brave-tiger", expect.any(Function));
  });

  it("should return error when server not found", async () => {
    mockRegistryService.findByName.mockReturnValue(undefined);

    const results = await executeStop({ name: "nonexistent" });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain("not found");
  });

  it("should stop all servers when --all flag is used", async () => {
    const server1 = { ...existingServer, name: "server-1", pm2Name: "servherd-server-1" };
    const server2 = { ...existingServer, id: "test-id-2", name: "server-2", pm2Name: "servherd-server-2" };

    mockRegistryService.listServers.mockReturnValue([server1, server2]);
    mockPM2._setProcesses([
      createMockProcess({ name: server1.pm2Name }),
      createMockProcess({ name: server2.pm2Name }),
    ]);

    const results = await executeStop({ all: true });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
    expect(mockPM2.stop).toHaveBeenCalledTimes(2);
  });

  it("should return empty results when no servers and --all flag", async () => {
    mockRegistryService.listServers.mockReturnValue([]);

    const results = await executeStop({ all: true });

    expect(results).toHaveLength(0);
  });

  it("should handle PM2 stop errors gracefully", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);

    // Make PM2 stop fail
    mockPM2.stop.mockImplementationOnce(
      (name: string, callback: (err?: Error) => void) => {
        callback(new Error("PM2 error"));
      },
    );

    const results = await executeStop({ name: "brave-tiger" });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain("PM2 error");
  });

  it("should stop servers by tag", async () => {
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

    const results = await executeStop({ tag: "frontend" });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  describe("--force option", () => {
    it("should send SIGKILL when --force is specified", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      const results = await executeStop({ name: "brave-tiger", force: true });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      // Verify the kill option was passed to PM2 instead of stop
      expect(mockPM2.delete).toHaveBeenCalledWith("servherd-brave-tiger", expect.any(Function));
    });

    it("should use stop when --force is not specified", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      const results = await executeStop({ name: "brave-tiger", force: false });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(mockPM2.stop).toHaveBeenCalled();
      expect(mockPM2.delete).not.toHaveBeenCalled();
    });

    it("should force stop all servers with --all --force", async () => {
      const server1 = { ...existingServer, name: "server-1", pm2Name: "servherd-server-1" };
      const server2 = { ...existingServer, id: "test-id-2", name: "server-2", pm2Name: "servherd-server-2" };

      mockRegistryService.listServers.mockReturnValue([server1, server2]);
      mockPM2._setProcesses([
        createMockProcess({ name: server1.pm2Name }),
        createMockProcess({ name: server2.pm2Name }),
      ]);

      const results = await executeStop({ all: true, force: true });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
      expect(mockPM2.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe("stopAction CLI handler", () => {
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
      await stopAction(undefined, {});

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Provide a server name"));
      expect(process.exitCode).toBe(1);
    });

    it("should show JSON error when no options and --json flag", async () => {
      await stopAction(undefined, { json: true });

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(JSON.parse(output)).toHaveProperty("error");
      expect(process.exitCode).toBe(1);
    });

    it("should output formatted result on success", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      await stopAction("brave-tiger", {});

      expect(consoleSpy).toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });

    it("should output JSON result when --json flag is set", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

      await stopAction("brave-tiger", { json: true });

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toHaveProperty("results");
    });

    it("should set exitCode when any stop fails", async () => {
      mockRegistryService.findByName.mockReturnValue(existingServer);
      mockPM2.stop.mockImplementationOnce(
        (_name: string, callback: (err?: Error) => void) => {
          callback(new Error("PM2 error"));
        },
      );

      await stopAction("brave-tiger", {});

      expect(process.exitCode).toBe(1);
    });
  });
});
