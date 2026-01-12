import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DEFAULT_CONFIG, type GlobalConfig } from "../../../src/types/config.js";
import * as path from "path";
import * as os from "os";

// Use vi.hoisted to ensure mock is created before module loading
const { mockExplorer } = vi.hoisted(() => {
  return {
    mockExplorer: {
      load: vi.fn(),
      search: vi.fn(),
      clearCaches: vi.fn(),
    },
  };
});

// Mock cosmiconfig - return the same mock explorer every time
vi.mock("cosmiconfig", () => ({
  cosmiconfig: () => mockExplorer,
}));

// Mock fs-extra/esm module
vi.mock("fs-extra/esm", () => ({
  ensureDir: vi.fn(),
  writeJson: vi.fn(),
}));

// Import after mocks are set up
import { ConfigService } from "../../../src/services/config.service.js";
import { ensureDir, writeJson } from "fs-extra/esm";

describe("ConfigService", () => {
  const testConfigDir = path.join(os.homedir(), ".servherd");
  const testConfigPath = path.join(testConfigDir, "config.json");

  const validConfig: GlobalConfig = {
    version: "1",
    hostname: "localhost",
    protocol: "http",
    portRange: { min: 3000, max: 9999 },
    tempDir: "/tmp/servherd",
    pm2: {
      logDir: "/tmp/servherd/logs",
      pidDir: "/tmp/servherd/pids",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.SERVHERD_HOSTNAME;
    delete process.env.SERVHERD_PROTOCOL;
    delete process.env.SERVHERD_PORT_MIN;
    delete process.env.SERVHERD_PORT_MAX;
    delete process.env.SERVHERD_TEMP_DIR;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("load", () => {
    it("should load config from global file when exists", async () => {
      mockExplorer.load.mockResolvedValue({ config: validConfig, filepath: testConfigPath });
      mockExplorer.search.mockResolvedValue(null);

      const service = new ConfigService();
      const config = await service.load();

      expect(config.hostname).toBe("localhost");
      expect(mockExplorer.load).toHaveBeenCalledWith(testConfigPath);
    });

    it("should return defaults when no config file exists", async () => {
      mockExplorer.load.mockRejectedValue(new Error("ENOENT"));
      mockExplorer.search.mockResolvedValue(null);

      const service = new ConfigService();
      const config = await service.load();

      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it("should merge project config over global config", async () => {
      mockExplorer.load.mockResolvedValue({
        config: { ...validConfig, hostname: "global.local" },
        filepath: testConfigPath,
      });
      mockExplorer.search.mockResolvedValue({
        config: { hostname: "project.local" },
        filepath: "/project/.servherdrc",
      });

      const service = new ConfigService();
      const config = await service.load();

      expect(config.hostname).toBe("project.local");
    });

    it("should merge environment variable overrides over file config", async () => {
      process.env.SERVHERD_HOSTNAME = "env.local";
      mockExplorer.load.mockResolvedValue({ config: validConfig, filepath: testConfigPath });
      mockExplorer.search.mockResolvedValue(null);

      const service = new ConfigService();
      const config = await service.load();

      expect(config.hostname).toBe("env.local");
    });

    it("should override protocol from environment", async () => {
      process.env.SERVHERD_PROTOCOL = "https";
      mockExplorer.load.mockResolvedValue({ config: validConfig, filepath: testConfigPath });
      mockExplorer.search.mockResolvedValue(null);

      const service = new ConfigService();
      const config = await service.load();

      expect(config.protocol).toBe("https");
    });

    it("should override port range from environment", async () => {
      process.env.SERVHERD_PORT_MIN = "5000";
      process.env.SERVHERD_PORT_MAX = "6000";
      mockExplorer.load.mockResolvedValue({ config: validConfig, filepath: testConfigPath });
      mockExplorer.search.mockResolvedValue(null);

      const service = new ConfigService();
      const config = await service.load();

      expect(config.portRange.min).toBe(5000);
      expect(config.portRange.max).toBe(6000);
    });

    it("should handle invalid global config file gracefully", async () => {
      mockExplorer.load.mockResolvedValue({
        config: { invalid: "config" },
        filepath: testConfigPath,
      });
      mockExplorer.search.mockResolvedValue(null);

      const service = new ConfigService();
      const config = await service.load();

      // Should return defaults when global config is invalid
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it("should handle unknown properties in project config gracefully", async () => {
      mockExplorer.load.mockRejectedValue(new Error("ENOENT"));
      mockExplorer.search.mockResolvedValue({
        config: { invalid: "config", hostname: "custom.local" },
        filepath: "/project/.servherdrc",
      });

      const service = new ConfigService();
      const config = await service.load();

      // Should merge valid properties, unknown properties are passed through
      expect(config.hostname).toBe("custom.local");
      // Other defaults should be preserved
      expect(config.protocol).toBe("http");
    });

    it("should support partial project configs", async () => {
      mockExplorer.load.mockRejectedValue(new Error("ENOENT"));
      mockExplorer.search.mockResolvedValue({
        config: { hostname: "partial.local" },
        filepath: "/project/.servherdrc",
      });

      const service = new ConfigService();
      const config = await service.load();

      expect(config.hostname).toBe("partial.local");
      // Other values should be defaults
      expect(config.protocol).toBe("http");
      expect(config.portRange).toEqual({ min: 3000, max: 9999 });
    });

    it("should merge nested portRange from partial config", async () => {
      mockExplorer.load.mockRejectedValue(new Error("ENOENT"));
      mockExplorer.search.mockResolvedValue({
        config: { portRange: { min: 4000 } },
        filepath: "/project/.servherdrc",
      });

      const service = new ConfigService();
      const config = await service.load();

      expect(config.portRange.min).toBe(4000);
      expect(config.portRange.max).toBe(9999); // Default max preserved
    });

    it("should search from specified directory", async () => {
      mockExplorer.load.mockRejectedValue(new Error("ENOENT"));
      mockExplorer.search.mockResolvedValue(null);

      const service = new ConfigService();
      await service.load("/custom/search/path");

      expect(mockExplorer.search).toHaveBeenCalledWith("/custom/search/path");
    });
  });

  describe("save", () => {
    it("should persist config to global file", async () => {
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);

      const service = new ConfigService();
      await service.save(validConfig);

      expect(writeJson).toHaveBeenCalledWith(
        testConfigPath,
        validConfig,
        { spaces: 2 },
      );
    });

    it("should create directory if not exists", async () => {
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);

      const service = new ConfigService();
      await service.save(validConfig);

      expect(ensureDir).toHaveBeenCalledWith(testConfigDir);
    });
  });

  describe("get/set", () => {
    it("should get config values", async () => {
      mockExplorer.load.mockResolvedValue({ config: validConfig, filepath: testConfigPath });
      mockExplorer.search.mockResolvedValue(null);

      const service = new ConfigService();
      await service.load();

      expect(service.get("hostname")).toBe("localhost");
      expect(service.get("portRange")).toEqual({ min: 3000, max: 9999 });
    });

    it("should get nested config values via portRange", async () => {
      mockExplorer.load.mockResolvedValue({ config: validConfig, filepath: testConfigPath });
      mockExplorer.search.mockResolvedValue(null);

      const service = new ConfigService();
      await service.load();

      const portRange = service.get("portRange");
      expect(portRange.min).toBe(3000);
    });

    it("should set and persist config values", async () => {
      mockExplorer.load.mockResolvedValue({ config: validConfig, filepath: testConfigPath });
      mockExplorer.search.mockResolvedValue(null);
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);

      const service = new ConfigService();
      await service.load();
      await service.set("hostname", "new.local");

      expect(service.get("hostname")).toBe("new.local");
      expect(writeJson).toHaveBeenCalled();
    });

    it("should set portRange values", async () => {
      mockExplorer.load.mockResolvedValue({ config: validConfig, filepath: testConfigPath });
      mockExplorer.search.mockResolvedValue(null);
      vi.mocked(ensureDir).mockResolvedValue(undefined as never);
      vi.mocked(writeJson).mockResolvedValue(undefined as never);

      const service = new ConfigService();
      await service.load();
      await service.set("portRange", { min: 4000, max: 5000 });

      expect(service.get("portRange")).toEqual({ min: 4000, max: 5000 });
    });
  });

  describe("getDefaults", () => {
    it("should return default configuration", () => {
      const service = new ConfigService();
      const defaults = service.getDefaults();

      expect(defaults).toEqual(DEFAULT_CONFIG);
    });
  });

  describe("getConfigPath", () => {
    it("should return the global config file path", () => {
      const service = new ConfigService();
      const configPath = service.getConfigPath();

      expect(configPath).toBe(testConfigPath);
    });
  });

  describe("getLoadedConfigPath", () => {
    it("should return null before loading", () => {
      const service = new ConfigService();
      expect(service.getLoadedConfigPath()).toBeNull();
    });

    it("should return project config path when loaded", async () => {
      mockExplorer.load.mockRejectedValue(new Error("ENOENT"));
      mockExplorer.search.mockResolvedValue({
        config: { hostname: "project.local" },
        filepath: "/project/.servherdrc",
      });

      const service = new ConfigService();
      await service.load();

      expect(service.getLoadedConfigPath()).toBe("/project/.servherdrc");
    });
  });

  describe("getSupportedConfigFiles", () => {
    it("should return list of supported config file names", () => {
      const service = new ConfigService();
      const files = service.getSupportedConfigFiles();

      expect(files).toContain(".servherdrc");
      expect(files).toContain(".servherdrc.json");
      expect(files).toContain(".servherdrc.yaml");
      expect(files).toContain("servherd.config.js");
      expect(files.some(f => f.includes("package.json"))).toBe(true);
    });
  });

  describe("clearCache", () => {
    it("should clear cosmiconfig cache", () => {
      const service = new ConfigService();
      service.clearCache();

      expect(mockExplorer.clearCaches).toHaveBeenCalled();
    });
  });

  describe("HTTPS configuration", () => {
    it("should save httpsCert and httpsKey paths", async () => {
      const configWithHttps = {
        ...validConfig,
        httpsCert: "/path/to/cert.pem",
        httpsKey: "/path/to/key.pem",
      };

      mockExplorer.load.mockResolvedValue({ config: configWithHttps, filepath: testConfigPath });
      mockExplorer.search.mockResolvedValue(null);

      const service = new ConfigService();
      const config = await service.load();

      expect(config.httpsCert).toBe("/path/to/cert.pem");
      expect(config.httpsKey).toBe("/path/to/key.pem");
    });

    it("should have undefined httpsCert and httpsKey by default", async () => {
      mockExplorer.load.mockRejectedValue(new Error("ENOENT"));
      mockExplorer.search.mockResolvedValue(null);

      const service = new ConfigService();
      const config = await service.load();

      expect(config.httpsCert).toBeUndefined();
      expect(config.httpsKey).toBeUndefined();
    });

    it("should override httpsCert and httpsKey from environment", async () => {
      process.env.SERVHERD_HTTPS_CERT = "/env/cert.pem";
      process.env.SERVHERD_HTTPS_KEY = "/env/key.pem";
      mockExplorer.load.mockResolvedValue({ config: validConfig, filepath: testConfigPath });
      mockExplorer.search.mockResolvedValue(null);

      const service = new ConfigService();
      const config = await service.load();

      expect(config.httpsCert).toBe("/env/cert.pem");
      expect(config.httpsKey).toBe("/env/key.pem");

      delete process.env.SERVHERD_HTTPS_CERT;
      delete process.env.SERVHERD_HTTPS_KEY;
    });

    it("should merge partial HTTPS config from project", async () => {
      mockExplorer.load.mockRejectedValue(new Error("ENOENT"));
      mockExplorer.search.mockResolvedValue({
        config: { httpsCert: "/project/cert.pem" },
        filepath: "/project/.servherdrc",
      });

      const service = new ConfigService();
      const config = await service.load();

      expect(config.httpsCert).toBe("/project/cert.pem");
      expect(config.httpsKey).toBeUndefined();
    });
  });
});
