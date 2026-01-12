import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RegistryService } from "../../../src/services/registry.service.js";
import type { ServerEntry, AddServerOptions } from "../../../src/types/registry.js";
import * as path from "path";
import * as os from "os";

// Mock fs-extra/esm module
vi.mock("fs-extra/esm", () => ({
  pathExists: vi.fn(),
  readJson: vi.fn(),
  ensureDir: vi.fn(),
  writeJson: vi.fn(),
}));

// Mock names utility
vi.mock("../../../src/utils/names.js", () => ({
  generateName: vi.fn(() => "brave-tiger"),
}));

// Import mocked modules
import { pathExists, readJson, ensureDir, writeJson } from "fs-extra/esm";
import { generateName } from "../../../src/utils/names.js";

describe("RegistryService", () => {
  const testRegistryDir = path.join(os.homedir(), ".servherd");
  const testRegistryPath = path.join(testRegistryDir, "registry.json");

  const existingServer: ServerEntry = {
    id: "uuid-123",
    name: "brave-tiger",
    command: "npm start --port {{port}}",
    resolvedCommand: "npm start --port 3000",
    cwd: "/home/user/project",
    port: 3000,
    protocol: "http",
    hostname: "localhost",
    env: {},
    createdAt: "2024-01-01T00:00:00.000Z",
    pm2Name: "servherd-brave-tiger",
  };

  const validRegistry = {
    version: "1",
    servers: [existingServer],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset name generator counter for predictable names
    let nameCounter = 0;
    vi.mocked(generateName).mockImplementation(() => {
      const names = ["brave-tiger", "calm-panda", "swift-fox", "gentle-bear"];
      return names[nameCounter++ % names.length];
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("load", () => {
    it("should load registry from file when exists", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(validRegistry as never);

      const service = new RegistryService();
      const registry = await service.load();

      expect(registry.servers).toHaveLength(1);
      expect(registry.servers[0].name).toBe("brave-tiger");
    });

    it("should return empty registry when file missing", async () => {
      vi.mocked(pathExists).mockResolvedValue(false as never);

      const service = new RegistryService();
      const registry = await service.load();

      expect(registry.servers).toHaveLength(0);
      expect(registry.version).toBe("1");
    });

    it("should handle invalid registry file", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockRejectedValue(new Error("Invalid JSON"));

      const service = new RegistryService();
      const registry = await service.load();

      expect(registry.servers).toHaveLength(0);
    });
  });

  describe("save", () => {
    it("should persist registry to file", async () => {
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);
      vi.mocked(pathExists).mockResolvedValue(false as never);

      const service = new RegistryService();
      await service.load();
      await service.save();

      expect(writeJson).toHaveBeenCalledWith(
        testRegistryPath,
        expect.objectContaining({ version: "1", servers: [] }),
        { spaces: 2 },
      );
    });

    it("should create directory if not exists", async () => {
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);
      vi.mocked(pathExists).mockResolvedValue(false as never);

      const service = new RegistryService();
      await service.load();
      await service.save();

      expect(ensureDir).toHaveBeenCalledWith(testRegistryDir);
    });
  });

  describe("addServer", () => {
    it("should add a new server entry", async () => {
      vi.mocked(pathExists).mockResolvedValue(false as never);
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);

      const service = new RegistryService();
      await service.load();

      const options: AddServerOptions = {
        command: "npm start",
        cwd: "/project",
        port: 3000,
      };

      const entry = await service.addServer(options);

      expect(entry.id).toBeDefined();
      expect(entry.name).toMatch(/^[a-z]+-[a-z]+$/);
      expect(entry.pm2Name).toBe(`servherd-${entry.name}`);
    });

    it("should generate unique human-readable names", async () => {
      vi.mocked(pathExists).mockResolvedValue(false as never);
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);

      const service = new RegistryService();
      await service.load();

      const entry1 = await service.addServer({ command: "a", cwd: "/a", port: 3000 });
      const entry2 = await service.addServer({ command: "b", cwd: "/b", port: 3001 });

      expect(entry1.name).not.toBe(entry2.name);
    });

    it("should use provided name if specified", async () => {
      vi.mocked(pathExists).mockResolvedValue(false as never);
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);

      const service = new RegistryService();
      await service.load();

      const options: AddServerOptions = {
        command: "npm start",
        cwd: "/project",
        port: 3000,
        name: "custom-name",
      };

      const entry = await service.addServer(options);

      expect(entry.name).toBe("custom-name");
    });

    it("should set default protocol and hostname", async () => {
      vi.mocked(pathExists).mockResolvedValue(false as never);
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);

      const service = new RegistryService();
      await service.load();

      const entry = await service.addServer({
        command: "npm start",
        cwd: "/project",
        port: 3000,
      });

      expect(entry.protocol).toBe("http");
      expect(entry.hostname).toBe("localhost");
    });

    it("should use custom protocol and hostname if provided", async () => {
      vi.mocked(pathExists).mockResolvedValue(false as never);
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);

      const service = new RegistryService();
      await service.load();

      const entry = await service.addServer({
        command: "npm start",
        cwd: "/project",
        port: 3000,
        protocol: "https",
        hostname: "myhost.local",
      });

      expect(entry.protocol).toBe("https");
      expect(entry.hostname).toBe("myhost.local");
    });

    it("should store tags and description", async () => {
      vi.mocked(pathExists).mockResolvedValue(false as never);
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);

      const service = new RegistryService();
      await service.load();

      const entry = await service.addServer({
        command: "npm start",
        cwd: "/project",
        port: 3000,
        tags: ["frontend", "dev"],
        description: "Development server",
      });

      expect(entry.tags).toEqual(["frontend", "dev"]);
      expect(entry.description).toBe("Development server");
    });
  });

  describe("findServer", () => {
    it("should find server by name", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(validRegistry as never);

      const service = new RegistryService();
      await service.load();

      const found = service.findByName("brave-tiger");
      expect(found).toBeDefined();
      expect(found?.name).toBe("brave-tiger");
    });

    it("should find server by id", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(validRegistry as never);

      const service = new RegistryService();
      await service.load();

      const found = service.findById("uuid-123");
      expect(found).toBeDefined();
      expect(found?.id).toBe("uuid-123");
    });

    it("should find server by cwd and command hash", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(validRegistry as never);

      const service = new RegistryService();
      await service.load();

      const found = service.findByCommandHash("/home/user/project", "npm start --port {{port}}");
      expect(found).toBeDefined();
      expect(found?.command).toBe("npm start --port {{port}}");
    });

    it("should return undefined when not found by name", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(validRegistry as never);

      const service = new RegistryService();
      await service.load();

      expect(service.findByName("nonexistent")).toBeUndefined();
    });

    it("should return undefined when not found by id", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(validRegistry as never);

      const service = new RegistryService();
      await service.load();

      expect(service.findById("nonexistent-id")).toBeUndefined();
    });

    it("should return undefined when not found by command hash", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(validRegistry as never);

      const service = new RegistryService();
      await service.load();

      expect(service.findByCommandHash("/different/path", "different command")).toBeUndefined();
    });
  });

  describe("updateServer", () => {
    it("should update existing server entry", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(validRegistry as never);
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);

      const service = new RegistryService();
      await service.load();

      await service.updateServer("uuid-123", { port: 3001 });

      const updated = service.findById("uuid-123");
      expect(updated?.port).toBe(3001);
    });

    it("should throw when updating non-existent server", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(validRegistry as never);

      const service = new RegistryService();
      await service.load();

      await expect(service.updateServer("nonexistent", { port: 3001 })).rejects.toThrow();
    });
  });

  describe("removeServer", () => {
    it("should remove server from registry", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(validRegistry as never);
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);

      const service = new RegistryService();
      await service.load();

      await service.removeServer("uuid-123");

      expect(service.findById("uuid-123")).toBeUndefined();
    });

    it("should throw when removing non-existent server", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(validRegistry as never);

      const service = new RegistryService();
      await service.load();

      await expect(service.removeServer("nonexistent")).rejects.toThrow();
    });
  });

  describe("listServers", () => {
    const multiServerRegistry = {
      version: "1",
      servers: [
        { ...existingServer, tags: ["frontend"] },
        {
          ...existingServer,
          id: "uuid-456",
          name: "calm-panda",
          cwd: "/home/user/other",
          tags: ["backend"],
          pm2Name: "servherd-calm-panda",
        },
      ],
    };

    it("should list all servers without filter", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(multiServerRegistry as never);

      const service = new RegistryService();
      await service.load();

      const servers = service.listServers();
      expect(servers).toHaveLength(2);
    });

    it("should filter by tag", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(multiServerRegistry as never);

      const service = new RegistryService();
      await service.load();

      const servers = service.listServers({ tag: "frontend" });
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe("brave-tiger");
    });

    it("should filter by cwd", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(multiServerRegistry as never);

      const service = new RegistryService();
      await service.load();

      const servers = service.listServers({ cwd: "/home/user/other" });
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe("calm-panda");
    });

    it("should return empty array when no matches", async () => {
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(multiServerRegistry as never);

      const service = new RegistryService();
      await service.load();

      const servers = service.listServers({ tag: "nonexistent" });
      expect(servers).toHaveLength(0);
    });

    it("should filter by command pattern with glob", async () => {
      const commandRegistry = {
        version: "1",
        servers: [
          { ...existingServer, id: "1", name: "storybook-server", command: "npx storybook dev -p 6006" },
          { ...existingServer, id: "2", name: "vite-server", command: "npx vite --port 3000" },
          { ...existingServer, id: "3", name: "next-server", command: "npx next dev -p 3001" },
        ],
      };
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(commandRegistry as never);

      const service = new RegistryService();
      await service.load();

      const servers = service.listServers({ cmd: "*storybook*" });
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe("storybook-server");
    });

    it("should filter by command pattern matching multiple servers", async () => {
      const commandRegistry = {
        version: "1",
        servers: [
          { ...existingServer, id: "1", name: "storybook-server", command: "npx storybook dev -p 6006" },
          { ...existingServer, id: "2", name: "vite-server", command: "npx vite --port 3000" },
          { ...existingServer, id: "3", name: "next-server", command: "npx next dev -p 3001" },
        ],
      };
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(commandRegistry as never);

      const service = new RegistryService();
      await service.load();

      const servers = service.listServers({ cmd: "npx *" });
      expect(servers).toHaveLength(3);
    });

    it("should filter by command pattern with brace expansion", async () => {
      const commandRegistry = {
        version: "1",
        servers: [
          { ...existingServer, id: "1", name: "storybook-server", command: "npx storybook dev -p 6006" },
          { ...existingServer, id: "2", name: "vite-server", command: "npx vite --port 3000" },
          { ...existingServer, id: "3", name: "next-server", command: "npx next dev -p 3001" },
        ],
      };
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(commandRegistry as never);

      const service = new RegistryService();
      await service.load();

      const servers = service.listServers({ cmd: "*{vite,storybook}*" });
      expect(servers).toHaveLength(2);
      expect(servers.map((s) => s.name).sort()).toEqual(["storybook-server", "vite-server"]);
    });

    it("should return empty array when command pattern matches nothing", async () => {
      const commandRegistry = {
        version: "1",
        servers: [
          { ...existingServer, id: "1", name: "vite-server", command: "npx vite --port 3000" },
        ],
      };
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(commandRegistry as never);

      const service = new RegistryService();
      await service.load();

      const servers = service.listServers({ cmd: "*webpack*" });
      expect(servers).toHaveLength(0);
    });

    it("should combine cmd filter with other filters", async () => {
      const commandRegistry = {
        version: "1",
        servers: [
          { ...existingServer, id: "1", name: "storybook-1", command: "npx storybook dev", tags: ["frontend"] },
          { ...existingServer, id: "2", name: "storybook-2", command: "npx storybook dev", tags: ["backend"] },
          { ...existingServer, id: "3", name: "vite-server", command: "npx vite", tags: ["frontend"] },
        ],
      };
      vi.mocked(pathExists).mockResolvedValue(true as never);
      vi.mocked(readJson).mockResolvedValue(commandRegistry as never);

      const service = new RegistryService();
      await service.load();

      const servers = service.listServers({ cmd: "*storybook*", tag: "frontend" });
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe("storybook-1");
    });
  });

  describe("getRegistryPath", () => {
    it("should return the registry file path", () => {
      const service = new RegistryService();
      const registryPath = service.getRegistryPath();

      expect(registryPath).toBe(testRegistryPath);
    });
  });
});
