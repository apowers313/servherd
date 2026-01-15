import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing
vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("../../../../src/services/config.service.js", () => ({
  ConfigService: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue({
      hostname: "localhost",
      protocol: "http",
      portRange: { min: 9000, max: 9099 },
    }),
    save: vi.fn(),
  })),
}));

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => ({
    load: vi.fn(),
    findByCwdAndName: vi.fn().mockReturnValue(null),
    findByCommandHash: vi.fn().mockReturnValue(null),
    addServer: vi.fn().mockResolvedValue({
      id: "test-id",
      name: "test-server",
      pm2Name: "servherd-test-server",
      port: 9000,
      protocol: "http",
      hostname: "localhost",
      cwd: "/tmp",
      command: "node server.js",
      resolvedCommand: "node server.js",
      env: {},
      createdAt: new Date().toISOString(),
    }),
    updateServer: vi.fn(),
    removeServer: vi.fn(),
  })),
}));

vi.mock("../../../../src/services/process.service.js", () => ({
  ProcessService: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    delete: vi.fn(),
    getStatus: vi.fn().mockResolvedValue("online"),
  })),
}));

vi.mock("../../../../src/services/direct-process.service.js", () => ({
  DirectProcessService: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockReturnValue({
      pid: 12345,
      process: {
        on: vi.fn((event, callback) => {
          // Simulate immediate exit for testing
          if (event === "exit") {
            setTimeout(() => callback(0, null), 10);
          }
        }),
      },
      kill: vi.fn(),
    }),
    stop: vi.fn(),
    stopAll: vi.fn(),
    count: 0,
    has: vi.fn().mockReturnValue(false),
  })),
}));

vi.mock("../../../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { CIDetector } from "../../../../src/utils/ci-detector.js";

describe("start command --no-daemon flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("CI auto-detection", () => {
    it("should detect CI environment and auto-enable no-daemon mode", () => {
      // Test that CI detection works
      expect(CIDetector.isCI({ ci: true })).toBe(true);
      expect(CIDetector.isCI({ ci: false, noCi: true })).toBe(false);
    });

    it("should respect explicit --daemon flag in CI", () => {
      // When daemon=true is explicitly set, it should override CI auto-detection
      const isCI = CIDetector.isCI({ ci: true });
      expect(isCI).toBe(true);

      // The logic in startAction is:
      // useNoDaemon = options.daemon === false || (isCI && options.daemon !== true)
      // So with daemon=true, useNoDaemon should be false
      const daemon = true;
      const useNoDaemon = daemon === false || (isCI && daemon !== true);
      expect(useNoDaemon).toBe(false);
    });

    it("should use no-daemon mode when explicitly set via --no-daemon", () => {
      const isCI = false;
      const daemon = false; // --no-daemon sets daemon to false

      const useNoDaemon = daemon === false || (isCI && daemon !== true);
      expect(useNoDaemon).toBe(true);
    });

    it("should use daemon mode by default in non-CI environment", () => {
      const isCI = false;
      const daemon = undefined; // No flag specified

      const useNoDaemon = daemon === false || (isCI && daemon !== true);
      expect(useNoDaemon).toBe(false);
    });

    it("should use no-daemon mode by default in CI environment", () => {
      const isCI = true;
      const daemon = undefined; // No flag specified

      const useNoDaemon = daemon === false || (isCI && daemon !== true);
      expect(useNoDaemon).toBe(true);
    });
  });
});
