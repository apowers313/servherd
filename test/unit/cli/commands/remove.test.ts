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
  removeServer: vi.fn(),
  save: vi.fn(),
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Mock @inquirer/prompts
const mockConfirm = vi.fn();
vi.mock("@inquirer/prompts", () => ({
  confirm: mockConfirm,
}));

// Mock CI detector to allow confirmation prompts in tests
vi.mock("../../../../src/utils/ci-detector.js", () => ({
  CIDetector: {
    isCI: () => false,
  },
}));

// Import after mocking
const { executeRemove } = await import("../../../../src/cli/commands/remove.js");

describe("remove command", () => {
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
    mockRegistryService.removeServer.mockResolvedValue(undefined);
    mockConfirm.mockResolvedValue(true);
  });

  it("should remove server from registry after stopping", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);

    const results = await executeRemove({ name: "brave-tiger", force: true });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].name).toBe("brave-tiger");
    expect(mockPM2.delete).toHaveBeenCalledWith("servherd-brave-tiger", expect.any(Function));
    expect(mockRegistryService.removeServer).toHaveBeenCalledWith("test-id");
  });

  it("should prompt for confirmation without --force", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    mockPM2._setProcesses([createMockProcess({ name: existingServer.pm2Name })]);
    mockConfirm.mockResolvedValue(true);

    const results = await executeRemove({ name: "brave-tiger" });

    expect(mockConfirm).toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  it("should not remove when confirmation is declined", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    mockConfirm.mockResolvedValue(false);

    const results = await executeRemove({ name: "brave-tiger" });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].cancelled).toBe(true);
    expect(mockRegistryService.removeServer).not.toHaveBeenCalled();
  });

  it("should return error when server not found", async () => {
    mockRegistryService.findByName.mockReturnValue(undefined);

    const results = await executeRemove({ name: "nonexistent", force: true });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain("not found");
  });

  it("should remove all servers with --all flag", async () => {
    const server1 = { ...existingServer, id: "id-1", name: "server-1", pm2Name: "servherd-server-1" };
    const server2 = { ...existingServer, id: "id-2", name: "server-2", pm2Name: "servherd-server-2" };

    mockRegistryService.listServers.mockReturnValue([server1, server2]);
    mockPM2._setProcesses([
      createMockProcess({ name: server1.pm2Name }),
      createMockProcess({ name: server2.pm2Name }),
    ]);

    const results = await executeRemove({ all: true, force: true });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
    expect(mockPM2.delete).toHaveBeenCalledTimes(2);
    expect(mockRegistryService.removeServer).toHaveBeenCalledTimes(2);
  });

  it("should return empty results when no servers and --all flag", async () => {
    mockRegistryService.listServers.mockReturnValue([]);

    const results = await executeRemove({ all: true, force: true });

    expect(results).toHaveLength(0);
  });

  it("should handle PM2 delete errors gracefully", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);

    // Make PM2 delete fail
    mockPM2.delete.mockImplementationOnce(
      (name: string, callback: (err?: Error) => void) => {
        callback(new Error("PM2 delete error"));
      },
    );

    const results = await executeRemove({ name: "brave-tiger", force: true });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain("PM2 delete error");
    // Registry should not be modified if PM2 delete failed
    expect(mockRegistryService.removeServer).not.toHaveBeenCalled();
  });

  it("should still remove from registry if process not found in PM2", async () => {
    mockRegistryService.findByName.mockReturnValue(existingServer);
    // No processes in PM2
    mockPM2._setProcesses([]);

    // PM2 returns error when process not found
    mockPM2.delete.mockImplementationOnce(
      (name: string, callback: (err?: Error) => void) => {
        callback(new Error("Process not found"));
      },
    );

    const results = await executeRemove({ name: "brave-tiger", force: true });

    // Should succeed because we still remove from registry
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(mockRegistryService.removeServer).toHaveBeenCalledWith("test-id");
  });

  it("should remove servers by tag", async () => {
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

    const results = await executeRemove({ tag: "frontend", force: true });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(mockRegistryService.removeServer).toHaveBeenCalled();
  });

  it("should prompt for confirmation with --all flag without --force", async () => {
    const server1 = { ...existingServer, id: "id-1", name: "server-1", pm2Name: "servherd-server-1" };

    mockRegistryService.listServers.mockReturnValue([server1]);
    mockPM2._setProcesses([createMockProcess({ name: server1.pm2Name })]);
    mockConfirm.mockResolvedValue(true);

    await executeRemove({ all: true });

    expect(mockConfirm).toHaveBeenCalled();
  });
});
