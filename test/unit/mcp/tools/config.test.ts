import { describe, it, expect, beforeEach, vi } from "vitest";

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

vi.mock("../../../../src/services/config.service.js", () => ({
  ConfigService: vi.fn().mockImplementation(() => mockConfigService),
}));

// Mock @inquirer/prompts to prevent interactive prompts
vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

// Import after mocking
const { handleConfigTool, configToolName, configToolDescription, configToolSchema } =
  await import("../../../../src/mcp/tools/config.js");

describe("servherd_config MCP tool", () => {
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
    mockConfigService.load.mockResolvedValue(defaultConfig);
    mockConfigService.getDefaults.mockReturnValue(defaultConfig);
    mockConfigService.getLoadedConfigPath.mockReturnValue("/home/user/.servherd/config.json");
    mockConfigService.getConfigPath.mockReturnValue("/home/user/.servherd/config.json");
  });

  it("should have correct tool name", () => {
    expect(configToolName).toBe("servherd_config");
  });

  it("should have a description", () => {
    expect(configToolDescription).toBeDefined();
    expect(configToolDescription.length).toBeGreaterThan(10);
  });

  it("should show all configuration by default", async () => {
    const result = await handleConfigTool({});

    expect(result.action).toBe("show");
    expect(result.success).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.message).toContain("Configuration loaded");
  });

  it("should show configuration when show flag is set", async () => {
    const result = await handleConfigTool({ show: true });

    expect(result.action).toBe("show");
    expect(result.success).toBe(true);
    expect(result.config).toEqual(defaultConfig);
  });

  it("should get a specific configuration value", async () => {
    const result = await handleConfigTool({ get: "hostname" });

    expect(result.action).toBe("get");
    expect(result.success).toBe(true);
    expect(result.key).toBe("hostname");
    expect(result.value).toBe("localhost");
  });

  it("should get nested configuration value", async () => {
    const result = await handleConfigTool({ get: "portRange.min" });

    expect(result.action).toBe("get");
    expect(result.success).toBe(true);
    expect(result.key).toBe("portRange.min");
    expect(result.value).toBe(3000);
  });

  it("should return error for invalid config key", async () => {
    const result = await handleConfigTool({ get: "invalidKey" });

    expect(result.action).toBe("get");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown configuration key");
  });

  it("should set configuration value", async () => {
    mockConfigService.set.mockResolvedValue(undefined);

    const result = await handleConfigTool({ set: "hostname", value: "myhost.local" });

    expect(result.action).toBe("set");
    expect(result.success).toBe(true);
    expect(result.key).toBe("hostname");
    expect(result.value).toBe("myhost.local");
  });

  it("should require value when using set", async () => {
    const result = await handleConfigTool({ set: "hostname" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("--value is required");
  });

  it("should reset configuration to defaults", async () => {
    mockConfigService.save.mockResolvedValue(undefined);

    const result = await handleConfigTool({ reset: true });

    expect(result.action).toBe("reset");
    expect(result.success).toBe(true);
    expect(result.message).toContain("reset to defaults");
    expect(mockConfigService.save).toHaveBeenCalledWith(defaultConfig);
  });

  it("should validate schema correctly", () => {
    const schema = configToolSchema;

    // Empty is valid
    expect(schema.safeParse({}).success).toBe(true);

    // show
    expect(schema.safeParse({ show: true }).success).toBe(true);

    // get
    expect(schema.safeParse({ get: "hostname" }).success).toBe(true);

    // set with value
    expect(schema.safeParse({ set: "hostname", value: "myhost" }).success).toBe(true);

    // reset
    expect(schema.safeParse({ reset: true }).success).toBe(true);
  });
});
