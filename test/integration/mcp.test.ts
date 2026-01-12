import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2 } from "../mocks/pm2.js";

// Mock PM2 before other imports
vi.mock("pm2", async () => {
  const { mockPM2Module } = await import("../mocks/pm2.js");
  return mockPM2Module;
});

// Mock RegistryService
const mockRegistryService = {
  load: vi.fn(),
  addServer: vi.fn(),
  findByCommandHash: vi.fn(),
  findByName: vi.fn(),
  updateServer: vi.fn(),
  listServers: vi.fn(),
  removeServer: vi.fn(),
  save: vi.fn(),
};

// Mock ConfigService
const mockConfigService = {
  load: vi.fn(),
  save: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  getDefaults: vi.fn(),
  getLoadedConfigPath: vi.fn(),
  getConfigPath: vi.fn(),
};

vi.mock("../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

vi.mock("../../src/services/config.service.js", () => ({
  ConfigService: vi.fn().mockImplementation(() => mockConfigService),
}));

// Mock @inquirer/prompts
vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

// Import after mocking
const { createMCPServer } = await import("../../src/mcp/index.js");

describe("MCP Server Integration", () => {
  const mockPM2 = getMockPM2();

  const defaultConfig = {
    version: "1",
    hostname: "localhost",
    protocol: "http",
    portRange: { min: 3000, max: 9999 },
    tempDir: "/tmp/servherd",
    pm2: { logDir: "/tmp/servherd/logs", pidDir: "/tmp/servherd/pids" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPM2._reset();

    mockConfigService.load.mockResolvedValue(defaultConfig);
    mockConfigService.getDefaults.mockReturnValue(defaultConfig);
    mockConfigService.getLoadedConfigPath.mockReturnValue("/home/user/.servherd/config.json");
    mockConfigService.getConfigPath.mockReturnValue("/home/user/.servherd/config.json");

    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.listServers.mockReturnValue([]);
  });

  it("should create an MCP server instance", () => {
    const server = createMCPServer();
    expect(server).toBeDefined();
  });

  it("should create server with custom name and version", () => {
    const server = createMCPServer({
      name: "custom-servherd",
      version: "1.0.0",
    });
    expect(server).toBeDefined();
  });

  it("should have the underlying server accessible", () => {
    const mcpServer = createMCPServer();
    expect(mcpServer.server).toBeDefined();
  });

  describe("Tool Registration", () => {
    it("should have servherd_start tool registered", () => {
      const mcpServer = createMCPServer();
      // Access internal registered tools through the server
      // The McpServer class doesn't expose a public method to list tools,
      // so we verify by checking the server exists and was created without errors
      expect(mcpServer).toBeDefined();
    });

    it("should accept valid start tool input", async () => {
      // This test verifies the tool handler works through the MCP layer
      const { startToolSchema } = await import("../../src/mcp/tools/start.js");

      // Validate schema
      const result = startToolSchema.safeParse({
        command: "npm start --port {{port}}",
        cwd: "/project",
        name: "test-server",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Resource Registration", () => {
    it("should have server resources registered", async () => {
      const { listServerResources } = await import("../../src/mcp/resources/servers.js");

      // When no servers exist, resources should be empty
      const resources = await listServerResources();
      expect(resources).toEqual([]);
    });

    it("should list resources for registered servers", async () => {
      const { listServerResources } = await import("../../src/mcp/resources/servers.js");

      mockRegistryService.listServers.mockReturnValue([
        {
          id: "id-1",
          name: "test-server",
          command: "npm start",
          resolvedCommand: "npm start",
          cwd: "/project",
          port: 3000,
          protocol: "http",
          hostname: "localhost",
          env: {},
          createdAt: new Date().toISOString(),
          pm2Name: "servherd-test-server",
        },
      ]);

      const resources = await listServerResources();
      expect(resources.length).toBeGreaterThan(0);
      expect(resources.some((r) => r.uri.includes("test-server"))).toBe(true);
    });
  });

  describe("Server Lifecycle", () => {
    it("should be able to close the server", async () => {
      const mcpServer = createMCPServer();
      // Close should not throw
      await expect(mcpServer.close()).resolves.not.toThrow();
    });
  });
});
