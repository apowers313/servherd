import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../../../src/types/config.js";
import { ServherdError } from "../../../../src/types/errors.js";

// Mock ConfigService
const mockConfigService = {
  load: vi.fn(),
  save: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  getDefaults: vi.fn(),
  getConfigPath: vi.fn(),
  getLoadedConfigPath: vi.fn(),
};

vi.mock("../../../../src/services/config.service.js", () => ({
  ConfigService: vi.fn().mockImplementation(() => mockConfigService),
}));

// Mock RegistryService (needed for refresh functionality)
const mockRegistryService = {
  load: vi.fn(),
  listServers: vi.fn(),
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Mock executeRefresh
const mockExecuteRefresh = vi.fn();
vi.mock("../../../../src/cli/commands/refresh.js", () => ({
  executeRefresh: (...args: unknown[]) => mockExecuteRefresh(...args),
}));

// Mock @inquirer/prompts
const mockConfirm = vi.fn();
const mockInput = vi.fn();
const mockSelect = vi.fn();
vi.mock("@inquirer/prompts", () => ({
  confirm: mockConfirm,
  input: mockInput,
  select: mockSelect,
}));

// Mock CIDetector
const mockIsCI = vi.fn();
vi.mock("../../../../src/utils/ci-detector.js", () => ({
  CIDetector: {
    isCI: () => mockIsCI(),
  },
}));

// Mock pathExists for HTTPS path validation
const mockPathExists = vi.fn();
vi.mock("fs-extra/esm", () => ({
  pathExists: (...args: unknown[]) => mockPathExists(...args),
}));

// Import after mocking
const { executeConfig, runConfigWizard } = await import("../../../../src/cli/commands/config.js");

describe("config command", () => {
  const loadedConfig = {
    ...DEFAULT_CONFIG,
    hostname: "custom.local",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfigService.load.mockResolvedValue(loadedConfig);
    mockConfigService.getDefaults.mockReturnValue(DEFAULT_CONFIG);
    mockConfigService.getConfigPath.mockReturnValue("/home/user/.servherd/config.json");
    mockConfigService.getLoadedConfigPath.mockReturnValue(null);
    mockConfigService.get.mockImplementation((key) => loadedConfig[key as keyof typeof loadedConfig]);
    mockConfigService.set.mockResolvedValue(undefined);
    mockConfigService.save.mockResolvedValue(undefined);
    mockConfirm.mockResolvedValue(true);
    mockIsCI.mockReturnValue(false);
    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.listServers.mockReturnValue([]);
    mockExecuteRefresh.mockResolvedValue([]);
    mockPathExists.mockResolvedValue(true);
  });

  describe("--show", () => {
    it("should display current configuration", async () => {
      const result = await executeConfig({ show: true });

      expect(result.config).toBeDefined();
      expect(result.config.hostname).toBe("custom.local");
      expect(result.config.protocol).toBe("http");
      expect(result.config.portRange).toEqual({ min: 3000, max: 9999 });
    });

    it("should include config file path in result", async () => {
      mockConfigService.getLoadedConfigPath.mockReturnValue("/project/.servherdrc.json");

      const result = await executeConfig({ show: true });

      expect(result.configPath).toBe("/project/.servherdrc.json");
    });

    it("should show global config path when no project config loaded", async () => {
      mockConfigService.getLoadedConfigPath.mockReturnValue(null);
      mockConfigService.getConfigPath.mockReturnValue("/home/user/.servherd/config.json");

      const result = await executeConfig({ show: true });

      expect(result.globalConfigPath).toBe("/home/user/.servherd/config.json");
    });
  });

  describe("--set", () => {
    it("should set hostname configuration value", async () => {
      const result = await executeConfig({ set: "hostname", value: "myhost.local" });

      expect(mockConfigService.set).toHaveBeenCalledWith("hostname", "myhost.local");
      expect(result.updated).toBe(true);
      expect(result.key).toBe("hostname");
      expect(result.value).toBe("myhost.local");
    });

    it("should set protocol configuration value", async () => {
      const result = await executeConfig({ set: "protocol", value: "https" });

      expect(mockConfigService.set).toHaveBeenCalledWith("protocol", "https");
      expect(result.updated).toBe(true);
    });

    it("should set portRange.min configuration value", async () => {
      const result = await executeConfig({ set: "portRange.min", value: "4000" });

      expect(mockConfigService.load).toHaveBeenCalled();
      // Should call save with updated config
      expect(mockConfigService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          portRange: expect.objectContaining({ min: 4000 }),
        }),
      );
      expect(result.updated).toBe(true);
    });

    it("should set portRange.max configuration value", async () => {
      const result = await executeConfig({ set: "portRange.max", value: "5000" });

      expect(mockConfigService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          portRange: expect.objectContaining({ max: 5000 }),
        }),
      );
      expect(result.updated).toBe(true);
    });

    it("should return error for invalid key", async () => {
      const result = await executeConfig({ set: "invalidKey", value: "test" });

      expect(result.updated).toBe(false);
      expect(result.error).toContain("Unknown configuration key");
    });

    it("should return error for invalid protocol value", async () => {
      const result = await executeConfig({ set: "protocol", value: "ftp" });

      expect(result.updated).toBe(false);
      expect(result.error).toContain("Invalid protocol");
    });

    it("should return error for invalid port value", async () => {
      const result = await executeConfig({ set: "portRange.min", value: "not-a-number" });

      expect(result.updated).toBe(false);
      expect(result.error).toContain("Invalid port value");
    });

    it("should return error when --value is missing", async () => {
      const result = await executeConfig({ set: "hostname" });

      expect(result.updated).toBe(false);
      expect(result.error).toContain("--value is required");
    });
  });

  describe("--reset", () => {
    it("should reset to defaults with --force", async () => {
      const result = await executeConfig({ reset: true, force: true });

      expect(mockConfigService.save).toHaveBeenCalledWith(DEFAULT_CONFIG);
      expect(result.reset).toBe(true);
    });

    it("should prompt for confirmation without --force", async () => {
      mockConfirm.mockResolvedValue(true);

      await executeConfig({ reset: true });

      expect(mockConfirm).toHaveBeenCalled();
      expect(mockConfigService.save).toHaveBeenCalledWith(DEFAULT_CONFIG);
    });

    it("should not reset when confirmation is declined", async () => {
      mockConfirm.mockResolvedValue(false);

      const result = await executeConfig({ reset: true });

      expect(result.reset).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(mockConfigService.save).not.toHaveBeenCalled();
    });
  });

  describe("--get", () => {
    it("should get a specific configuration value", async () => {
      mockConfigService.get.mockReturnValue("custom.local");

      const result = await executeConfig({ get: "hostname" });

      expect(result.key).toBe("hostname");
      expect(result.value).toBe("custom.local");
    });

    it("should get nested configuration values", async () => {
      const result = await executeConfig({ get: "portRange.min" });

      expect(result.key).toBe("portRange.min");
      expect(result.value).toBe(3000);
    });

    it("should return error for unknown key", async () => {
      const result = await executeConfig({ get: "unknownKey" });

      expect(result.error).toContain("Unknown configuration key");
    });
  });

  describe("HTTPS configuration", () => {
    it("should set httpsCert configuration value", async () => {
      const result = await executeConfig({ set: "httpsCert", value: "/path/to/cert.pem" });

      expect(mockConfigService.set).toHaveBeenCalledWith("httpsCert", "/path/to/cert.pem");
      expect(result.updated).toBe(true);
      expect(result.key).toBe("httpsCert");
      expect(result.value).toBe("/path/to/cert.pem");
    });

    it("should set httpsKey configuration value", async () => {
      const result = await executeConfig({ set: "httpsKey", value: "/path/to/key.pem" });

      expect(mockConfigService.set).toHaveBeenCalledWith("httpsKey", "/path/to/key.pem");
      expect(result.updated).toBe(true);
      expect(result.key).toBe("httpsKey");
      expect(result.value).toBe("/path/to/key.pem");
    });

    it("should get httpsCert configuration value", async () => {
      mockConfigService.load.mockResolvedValue({
        ...DEFAULT_CONFIG,
        httpsCert: "/path/to/cert.pem",
      });

      const result = await executeConfig({ get: "httpsCert" });

      expect(result.key).toBe("httpsCert");
      expect(result.value).toBe("/path/to/cert.pem");
    });

    it("should get httpsKey configuration value", async () => {
      mockConfigService.load.mockResolvedValue({
        ...DEFAULT_CONFIG,
        httpsKey: "/path/to/key.pem",
      });

      const result = await executeConfig({ get: "httpsKey" });

      expect(result.key).toBe("httpsKey");
      expect(result.value).toBe("/path/to/key.pem");
    });
  });

  describe("interactive config wizard", () => {
    it("should prompt for hostname", async () => {
      mockInput.mockResolvedValue("custom-host");
      mockSelect.mockResolvedValue("http");

      await runConfigWizard();

      expect(mockInput).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("hostname") }),
      );
    });

    it("should prompt for protocol", async () => {
      mockInput.mockResolvedValue("localhost");
      mockSelect.mockResolvedValue("http");

      await runConfigWizard();

      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("protocol") }),
      );
    });

    it("should prompt for port range", async () => {
      mockInput
        .mockResolvedValueOnce("localhost") // hostname
        .mockResolvedValueOnce("3000")      // port min
        .mockResolvedValueOnce("9999");     // port max
      mockSelect.mockResolvedValue("http");

      await runConfigWizard();

      // Should have been called for hostname, portRange.min, and portRange.max
      expect(mockInput).toHaveBeenCalledTimes(3);
    });

    it("should save configuration after wizard completion", async () => {
      mockInput
        .mockResolvedValueOnce("my-host")
        .mockResolvedValueOnce("4000")
        .mockResolvedValueOnce("8000");
      mockSelect.mockResolvedValue("http");

      await runConfigWizard();

      expect(mockConfigService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: "my-host",
          protocol: "http",
          portRange: expect.objectContaining({
            min: 4000,
            max: 8000,
          }),
        }),
      );
    });

    it("should throw error in CI mode", async () => {
      mockIsCI.mockReturnValue(true);

      await expect(runConfigWizard()).rejects.toThrow(ServherdError);
      await expect(runConfigWizard()).rejects.toThrow(/Interactive config not available in CI mode/);
    });

    it("should prompt for HTTPS cert and key when protocol is https", async () => {
      mockInput
        .mockResolvedValueOnce("localhost")     // hostname
        .mockResolvedValueOnce("/path/cert.pem") // httpsCert
        .mockResolvedValueOnce("/path/key.pem")  // httpsKey
        .mockResolvedValueOnce("3000")           // port min
        .mockResolvedValueOnce("9999");          // port max
      mockSelect.mockResolvedValue("https");

      await runConfigWizard();

      expect(mockConfigService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: "https",
          httpsCert: "/path/cert.pem",
          httpsKey: "/path/key.pem",
        }),
      );
    });
  });

  describe("--refresh", () => {
    it("should call executeRefresh with name when --refresh is provided", async () => {
      mockExecuteRefresh.mockResolvedValue([
        {
          name: "my-server",
          success: true,
          status: "online",
          message: "Refreshed",
          driftDetails: "hostname: \"localhost\" → \"dev.local\"",
        },
      ]);

      const result = await executeConfig({ refresh: "my-server" });

      expect(mockExecuteRefresh).toHaveBeenCalledWith({
        name: "my-server",
        all: undefined,
        tag: undefined,
        dryRun: undefined,
      });
      expect(result.refreshResults).toHaveLength(1);
      expect(result.refreshResults[0].name).toBe("my-server");
      expect(result.refreshResults[0].success).toBe(true);
    });

    it("should return no drift message when server has no drift", async () => {
      mockExecuteRefresh.mockResolvedValue([
        {
          name: "",
          success: true,
          skipped: true,
          message: "No servers have config drift",
        },
      ]);

      const result = await executeConfig({ refresh: "my-server" });

      expect(result.refreshResults).toHaveLength(1);
      expect(result.refreshResults[0].skipped).toBe(true);
    });
  });

  describe("--refresh-all", () => {
    it("should call executeRefresh with all flag when --refresh-all is provided", async () => {
      mockExecuteRefresh.mockResolvedValue([
        {
          name: "server1",
          success: true,
          status: "online",
        },
        {
          name: "server2",
          success: true,
          status: "online",
        },
      ]);

      const result = await executeConfig({ refreshAll: true });

      expect(mockExecuteRefresh).toHaveBeenCalledWith({
        name: undefined,
        all: true,
        tag: undefined,
        dryRun: undefined,
      });
      expect(result.refreshResults).toHaveLength(2);
    });

    it("should support tag filter with --refresh-all", async () => {
      mockExecuteRefresh.mockResolvedValue([
        {
          name: "frontend-server",
          success: true,
          status: "online",
        },
      ]);

      const result = await executeConfig({ refreshAll: true, tag: "frontend" });

      expect(mockExecuteRefresh).toHaveBeenCalledWith({
        name: undefined,
        all: true,
        tag: "frontend",
        dryRun: undefined,
      });
      expect(result.refreshResults).toHaveLength(1);
    });

    it("should support dry-run mode with --refresh-all", async () => {
      mockExecuteRefresh.mockResolvedValue([
        {
          name: "server1",
          success: true,
          skipped: true,
          message: "Would refresh (dry-run mode)",
          driftDetails: "hostname: \"localhost\" → \"dev.local\"",
        },
      ]);

      const result = await executeConfig({ refreshAll: true, dryRun: true });

      expect(mockExecuteRefresh).toHaveBeenCalledWith({
        name: undefined,
        all: true,
        tag: undefined,
        dryRun: true,
      });
      expect(result.refreshResults[0].skipped).toBe(true);
      expect(result.dryRun).toBe(true);
    });

    it("should return no drift message when no servers have drift", async () => {
      mockExecuteRefresh.mockResolvedValue([
        {
          name: "",
          success: true,
          skipped: true,
          message: "No servers have config drift",
        },
      ]);

      const result = await executeConfig({ refreshAll: true });

      expect(result.refreshResults).toHaveLength(1);
      expect(result.refreshResults[0].message).toContain("No servers have config drift");
    });
  });

  describe("--add (custom variables)", () => {
    it("should add a custom variable", async () => {
      mockConfigService.load.mockResolvedValue({ ...DEFAULT_CONFIG, variables: {} });

      const result = await executeConfig({ add: "my-token", value: "secret123" });

      expect(mockConfigService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { "my-token": "secret123" },
        }),
      );
      expect(result.addedVar).toBe(true);
      expect(result.varName).toBe("my-token");
      expect(result.varValue).toBe("secret123");
    });

    it("should update an existing custom variable", async () => {
      mockConfigService.load.mockResolvedValue({
        ...DEFAULT_CONFIG,
        variables: { "my-token": "old-value" },
      });

      const result = await executeConfig({ add: "my-token", value: "new-value" });

      expect(mockConfigService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { "my-token": "new-value" },
        }),
      );
      expect(result.addedVar).toBe(true);
    });

    it("should return error when --value is missing", async () => {
      const result = await executeConfig({ add: "my-token" });

      expect(result.addedVar).toBe(false);
      expect(result.error).toContain("--value is required");
    });

    it("should reject reserved variable name 'port'", async () => {
      const result = await executeConfig({ add: "port", value: "8080" });

      expect(result.addedVar).toBe(false);
      expect(result.error).toContain("reserved variable name");
    });

    it("should reject reserved variable name 'hostname'", async () => {
      const result = await executeConfig({ add: "hostname", value: "test" });

      expect(result.addedVar).toBe(false);
      expect(result.error).toContain("reserved variable name");
    });

    it("should reject reserved variable name 'url'", async () => {
      const result = await executeConfig({ add: "url", value: "test" });

      expect(result.addedVar).toBe(false);
      expect(result.error).toContain("reserved variable name");
    });

    it("should reject reserved variable name 'https-cert'", async () => {
      const result = await executeConfig({ add: "https-cert", value: "/path" });

      expect(result.addedVar).toBe(false);
      expect(result.error).toContain("reserved variable name");
    });

    it("should reject reserved variable name 'https-key'", async () => {
      const result = await executeConfig({ add: "https-key", value: "/path" });

      expect(result.addedVar).toBe(false);
      expect(result.error).toContain("reserved variable name");
    });

    it("should reject invalid variable name with special characters", async () => {
      const result = await executeConfig({ add: "my@token", value: "test" });

      expect(result.addedVar).toBe(false);
      expect(result.error).toContain("Invalid variable name");
    });

    it("should allow variable names with hyphens", async () => {
      mockConfigService.load.mockResolvedValue({ ...DEFAULT_CONFIG, variables: {} });

      const result = await executeConfig({ add: "my-api-token", value: "secret" });

      expect(result.addedVar).toBe(true);
      expect(result.varName).toBe("my-api-token");
    });

    it("should allow variable names with underscores", async () => {
      mockConfigService.load.mockResolvedValue({ ...DEFAULT_CONFIG, variables: {} });

      const result = await executeConfig({ add: "my_api_token", value: "secret" });

      expect(result.addedVar).toBe(true);
      expect(result.varName).toBe("my_api_token");
    });

    it("should allow empty string values", async () => {
      mockConfigService.load.mockResolvedValue({ ...DEFAULT_CONFIG, variables: {} });

      const result = await executeConfig({ add: "empty-var", value: "" });

      expect(result.addedVar).toBe(true);
      expect(result.varValue).toBe("");
    });
  });

  describe("--remove (custom variables)", () => {
    it("should remove an existing custom variable", async () => {
      mockConfigService.load.mockResolvedValue({
        ...DEFAULT_CONFIG,
        variables: { "my-token": "secret", "other-var": "value" },
      });

      const result = await executeConfig({ remove: "my-token" });

      expect(mockConfigService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { "other-var": "value" },
        }),
      );
      expect(result.removedVar).toBe(true);
      expect(result.varName).toBe("my-token");
    });

    it("should return error when variable does not exist", async () => {
      mockConfigService.load.mockResolvedValue({
        ...DEFAULT_CONFIG,
        variables: {},
      });

      const result = await executeConfig({ remove: "nonexistent" });

      expect(result.removedVar).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should return error when variables section is empty", async () => {
      mockConfigService.load.mockResolvedValue({
        ...DEFAULT_CONFIG,
        variables: undefined,
      });

      const result = await executeConfig({ remove: "any-var" });

      expect(result.removedVar).toBe(false);
      expect(result.error).toContain("does not exist");
    });
  });

  describe("--list-vars (custom variables)", () => {
    it("should list all custom variables", async () => {
      mockConfigService.load.mockResolvedValue({
        ...DEFAULT_CONFIG,
        variables: {
          "my-token": "secret123",
          "api-key": "abc456",
        },
      });

      const result = await executeConfig({ listVars: true });

      expect(result.variables).toEqual({
        "my-token": "secret123",
        "api-key": "abc456",
      });
    });

    it("should return empty object when no variables defined", async () => {
      mockConfigService.load.mockResolvedValue({
        ...DEFAULT_CONFIG,
        variables: {},
      });

      const result = await executeConfig({ listVars: true });

      expect(result.variables).toEqual({});
    });

    it("should return empty object when variables section is undefined", async () => {
      mockConfigService.load.mockResolvedValue({
        ...DEFAULT_CONFIG,
        variables: undefined,
      });

      const result = await executeConfig({ listVars: true });

      expect(result.variables).toEqual({});
    });
  });

  describe("refreshOnChange configuration", () => {
    it("should set refreshOnChange to manual", async () => {
      const result = await executeConfig({ set: "refreshOnChange", value: "manual" });

      expect(mockConfigService.set).toHaveBeenCalledWith("refreshOnChange", "manual");
      expect(result.updated).toBe(true);
    });

    it("should set refreshOnChange to prompt", async () => {
      const result = await executeConfig({ set: "refreshOnChange", value: "prompt" });

      expect(mockConfigService.set).toHaveBeenCalledWith("refreshOnChange", "prompt");
      expect(result.updated).toBe(true);
    });

    it("should set refreshOnChange to auto", async () => {
      const result = await executeConfig({ set: "refreshOnChange", value: "auto" });

      expect(mockConfigService.set).toHaveBeenCalledWith("refreshOnChange", "auto");
      expect(result.updated).toBe(true);
    });

    it("should set refreshOnChange to on-start", async () => {
      const result = await executeConfig({ set: "refreshOnChange", value: "on-start" });

      expect(mockConfigService.set).toHaveBeenCalledWith("refreshOnChange", "on-start");
      expect(result.updated).toBe(true);
    });

    it("should reject invalid refreshOnChange value", async () => {
      const result = await executeConfig({ set: "refreshOnChange", value: "invalid" });

      expect(result.updated).toBe(false);
      expect(result.error).toContain("Invalid refreshOnChange value");
    });
  });
});
