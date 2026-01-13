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
const { executeConfig, configAction, runConfigWizard } = await import("../../../../src/cli/commands/config.js");

describe("Config wizard CLI invocation", () => {
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

  describe("wizard invocation", () => {
    it("should run wizard when no options provided (non-CI)", async () => {
      mockInput
        .mockResolvedValueOnce("localhost") // hostname
        .mockResolvedValueOnce("3000")      // port min
        .mockResolvedValueOnce("9999");     // port max
      mockSelect.mockResolvedValue("http");

      // Call configAction with empty options (no explicit option flags)
      await configAction({});

      // Wizard should prompt for inputs
      expect(mockInput).toHaveBeenCalled();
      expect(mockSelect).toHaveBeenCalled();
      expect(mockConfigService.save).toHaveBeenCalled();
    });

    it("should show config when no options in CI mode", async () => {
      mockIsCI.mockReturnValue(true);

      const result = await executeConfig({});

      expect(result.config).toBeDefined();
      expect(result.config.hostname).toBe("custom.local");
    });

    it("should not run wizard when --show is provided", async () => {
      const result = await executeConfig({ show: true });

      expect(mockInput).not.toHaveBeenCalled();
      expect(result.config).toBeDefined();
    });

    it("should not run wizard when --get is provided", async () => {
      const result = await executeConfig({ get: "hostname" });

      expect(mockInput).not.toHaveBeenCalled();
      expect(result.key).toBe("hostname");
    });

    it("should not run wizard when --set is provided", async () => {
      const result = await executeConfig({ set: "hostname", value: "newhost" });

      expect(mockInput).not.toHaveBeenCalled();
      expect(result.updated).toBe(true);
    });

    it("should not run wizard when --reset is provided", async () => {
      mockConfirm.mockResolvedValue(false);
      const result = await executeConfig({ reset: true });

      expect(mockInput).not.toHaveBeenCalled();
      expect(result.cancelled).toBe(true);
    });

    it("should not run wizard when --refresh is provided", async () => {
      mockExecuteRefresh.mockResolvedValue([{ name: "server1", success: true }]);
      const result = await executeConfig({ refresh: "server1" });

      expect(mockInput).not.toHaveBeenCalled();
      expect(result.refreshResults).toBeDefined();
    });

    it("should not run wizard when --refresh-all is provided", async () => {
      mockExecuteRefresh.mockResolvedValue([]);
      const result = await executeConfig({ refreshAll: true });

      expect(mockInput).not.toHaveBeenCalled();
      expect(result.refreshResults).toBeDefined();
    });

    it("should throw error when wizard is called directly in CI mode", async () => {
      mockIsCI.mockReturnValue(true);

      await expect(runConfigWizard()).rejects.toThrow(ServherdError);
      await expect(runConfigWizard()).rejects.toThrow(/Interactive config not available in CI mode/);
    });
  });
});

describe("Config HTTPS path validation", () => {
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
    mockIsCI.mockReturnValue(false);
    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.listServers.mockReturnValue([]);
    mockPathExists.mockResolvedValue(true);
  });

  it("should reject non-existent cert path on set", async () => {
    mockPathExists.mockResolvedValue(false);

    const result = await executeConfig({ set: "httpsCert", value: "/nonexistent/cert.pem" });

    expect(result.updated).toBe(false);
    expect(result.error).toContain("File not found");
    expect(result.error).toContain("/nonexistent/cert.pem");
  });

  it("should reject non-existent key path on set", async () => {
    mockPathExists.mockResolvedValue(false);

    const result = await executeConfig({ set: "httpsKey", value: "/nonexistent/key.pem" });

    expect(result.updated).toBe(false);
    expect(result.error).toContain("File not found");
    expect(result.error).toContain("/nonexistent/key.pem");
  });

  it("should accept existing cert path on set", async () => {
    mockPathExists.mockResolvedValue(true);

    const result = await executeConfig({ set: "httpsCert", value: "/valid/cert.pem" });

    expect(result.updated).toBe(true);
    expect(result.key).toBe("httpsCert");
    expect(result.value).toBe("/valid/cert.pem");
    expect(mockConfigService.set).toHaveBeenCalledWith("httpsCert", "/valid/cert.pem");
  });

  it("should accept existing key path on set", async () => {
    mockPathExists.mockResolvedValue(true);

    const result = await executeConfig({ set: "httpsKey", value: "/valid/key.pem" });

    expect(result.updated).toBe(true);
    expect(result.key).toBe("httpsKey");
    expect(result.value).toBe("/valid/key.pem");
    expect(mockConfigService.set).toHaveBeenCalledWith("httpsKey", "/valid/key.pem");
  });

  it("should allow clearing cert path with empty value", async () => {
    // Empty string should be allowed (to clear the setting)
    const result = await executeConfig({ set: "httpsCert", value: "" });

    // Empty value clears the setting without file validation
    expect(result.updated).toBe(true);
    expect(mockConfigService.set).toHaveBeenCalledWith("httpsCert", "");
  });

  it("should allow clearing key path with empty value", async () => {
    // Empty string should be allowed (to clear the setting)
    const result = await executeConfig({ set: "httpsKey", value: "" });

    // Empty value clears the setting without file validation
    expect(result.updated).toBe(true);
    expect(mockConfigService.set).toHaveBeenCalledWith("httpsKey", "");
  });
});
