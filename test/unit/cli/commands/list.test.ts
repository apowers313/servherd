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
  listServers: vi.fn(),
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Import after mocking
const { executeList } = await import("../../../../src/cli/commands/list.js");

describe("list command", () => {
  const mockPM2 = getMockPM2();

  const server1: ServerEntry = {
    id: "test-id-1",
    name: "brave-tiger",
    command: "npm start",
    resolvedCommand: "npm start",
    cwd: "/project1",
    port: 3000,
    protocol: "http",
    hostname: "localhost",
    env: {},
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-brave-tiger",
    tags: ["frontend"],
  };

  const server2: ServerEntry = {
    id: "test-id-2",
    name: "calm-panda",
    command: "npm run dev",
    resolvedCommand: "npm run dev",
    cwd: "/project2",
    port: 3001,
    protocol: "http",
    hostname: "localhost",
    env: {},
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-calm-panda",
    tags: ["backend"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPM2._reset();

    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.listServers.mockReturnValue([]);
  });

  it("should list all servers", async () => {
    mockRegistryService.listServers.mockReturnValue([server1, server2]);
    mockPM2._setProcesses([
      createMockProcess({ name: server1.pm2Name }),
      createMockProcess({ name: server2.pm2Name }),
    ]);

    const result = await executeList({});

    expect(result.servers).toHaveLength(2);
    expect(result.servers.map((s) => s.server.name)).toContain("brave-tiger");
    expect(result.servers.map((s) => s.server.name)).toContain("calm-panda");
  });

  it("should return empty array when no servers", async () => {
    mockRegistryService.listServers.mockReturnValue([]);

    const result = await executeList({});

    expect(result.servers).toHaveLength(0);
  });

  it("should filter by running status", async () => {
    mockRegistryService.listServers.mockReturnValue([server1, server2]);

    // Create processes with different statuses
    const onlineProcess = createMockProcess({ name: server1.pm2Name });
    const stoppedProcess = createMockProcess({ name: server2.pm2Name });
    stoppedProcess.pm2_env.status = "stopped";

    mockPM2._setProcesses([onlineProcess, stoppedProcess]);

    const result = await executeList({ running: true });

    expect(result.servers).toHaveLength(1);
    expect(result.servers[0].server.name).toBe("brave-tiger");
    expect(result.servers[0].status).toBe("online");
  });

  it("should include server status from PM2", async () => {
    mockRegistryService.listServers.mockReturnValue([server1]);
    mockPM2._setProcesses([
      createMockProcess({ name: server1.pm2Name }),
    ]);

    const result = await executeList({});

    expect(result.servers).toHaveLength(1);
    expect(result.servers[0].status).toBe("online");
  });

  it("should show unknown status when process not in PM2", async () => {
    mockRegistryService.listServers.mockReturnValue([server1]);
    // No PM2 processes set

    const result = await executeList({});

    expect(result.servers).toHaveLength(1);
    expect(result.servers[0].status).toBe("unknown");
  });

  it("should filter by tag", async () => {
    mockRegistryService.listServers.mockImplementation((filter) => {
      if (filter?.tag === "frontend") {
        return [server1];
      }
      return [server1, server2];
    });

    mockPM2._setProcesses([
      createMockProcess({ name: server1.pm2Name }),
    ]);

    const result = await executeList({ tag: "frontend" });

    expect(result.servers).toHaveLength(1);
    expect(result.servers[0].server.name).toBe("brave-tiger");
  });

  it("should filter by cwd", async () => {
    mockRegistryService.listServers.mockImplementation((filter) => {
      if (filter?.cwd === "/project1") {
        return [server1];
      }
      return [server1, server2];
    });

    mockPM2._setProcesses([
      createMockProcess({ name: server1.pm2Name }),
    ]);

    const result = await executeList({ cwd: "/project1" });

    expect(result.servers).toHaveLength(1);
    expect(result.servers[0].server.name).toBe("brave-tiger");
  });

  describe("--stopped option", () => {
    it("should filter to only stopped servers", async () => {
      mockRegistryService.listServers.mockReturnValue([server1, server2]);

      // Create processes with different statuses
      const onlineProcess = createMockProcess({ name: server1.pm2Name });
      const stoppedProcess = createMockProcess({ name: server2.pm2Name });
      stoppedProcess.pm2_env.status = "stopped";

      mockPM2._setProcesses([onlineProcess, stoppedProcess]);

      const result = await executeList({ stopped: true });

      expect(result.servers).toHaveLength(1);
      expect(result.servers[0].server.name).toBe("calm-panda");
      expect(result.servers[0].status).toBe("stopped");
    });

    it("should return empty array when no stopped servers", async () => {
      mockRegistryService.listServers.mockReturnValue([server1, server2]);

      // Both processes are online
      mockPM2._setProcesses([
        createMockProcess({ name: server1.pm2Name }),
        createMockProcess({ name: server2.pm2Name }),
      ]);

      const result = await executeList({ stopped: true });

      expect(result.servers).toHaveLength(0);
    });

    it("should throw error when both running and stopped are specified", async () => {
      await expect(
        executeList({ running: true, stopped: true }),
      ).rejects.toThrow("Cannot specify both --running and --stopped");
    });
  });

  describe("--cmd option", () => {
    const storybookServer: ServerEntry = {
      id: "test-id-3",
      name: "storybook-dev",
      command: "npx storybook dev -p 6006",
      resolvedCommand: "npx storybook dev -p 6006",
      cwd: "/project1",
      port: 6006,
      protocol: "http",
      hostname: "localhost",
      env: {},
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-storybook-dev",
      tags: ["frontend"],
    };

    const viteServer: ServerEntry = {
      id: "test-id-4",
      name: "vite-dev",
      command: "npx vite --port 3000",
      resolvedCommand: "npx vite --port 3000",
      cwd: "/project2",
      port: 3000,
      protocol: "http",
      hostname: "localhost",
      env: {},
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-vite-dev",
      tags: ["frontend"],
    };

    it("should filter by command pattern", async () => {
      mockRegistryService.listServers.mockImplementation((filter) => {
        if (filter?.cmd === "*storybook*") {
          return [storybookServer];
        }
        return [storybookServer, viteServer];
      });

      mockPM2._setProcesses([
        createMockProcess({ name: storybookServer.pm2Name }),
      ]);

      const result = await executeList({ cmd: "*storybook*" });

      expect(result.servers).toHaveLength(1);
      expect(result.servers[0].server.name).toBe("storybook-dev");
    });

    it("should pass cmd filter to registry service", async () => {
      mockRegistryService.listServers.mockReturnValue([]);

      await executeList({ cmd: "*vite*" });

      expect(mockRegistryService.listServers).toHaveBeenCalledWith(
        expect.objectContaining({ cmd: "*vite*" }),
      );
    });

    it("should combine cmd with other filters", async () => {
      mockRegistryService.listServers.mockImplementation((filter) => {
        if (filter?.cmd === "*storybook*" && filter?.tag === "frontend") {
          return [storybookServer];
        }
        return [storybookServer, viteServer];
      });

      mockPM2._setProcesses([
        createMockProcess({ name: storybookServer.pm2Name }),
      ]);

      const result = await executeList({ cmd: "*storybook*", tag: "frontend" });

      expect(mockRegistryService.listServers).toHaveBeenCalledWith(
        expect.objectContaining({ cmd: "*storybook*", tag: "frontend" }),
      );
      expect(result.servers).toHaveLength(1);
    });
  });
});
