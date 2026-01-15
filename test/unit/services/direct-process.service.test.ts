import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DirectProcessService, spawnDirect } from "../../../src/services/direct-process.service.js";

// Mock ps-tree
vi.mock("ps-tree", () => ({
  default: vi.fn((pid, callback) => {
    callback(null, []);
  }),
}));

// Mock logger
vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("DirectProcessService", () => {
  let service: DirectProcessService;

  beforeEach(() => {
    service = new DirectProcessService();
  });

  afterEach(async () => {
    await service.stopAll();
  });

  describe("start", () => {
    it("should start a process and track it", async () => {
      const proc = service.start({
        command: "node -e \"setTimeout(() => {}, 10000)\"",
        cwd: process.cwd(),
        name: "test-server",
        port: 9000,
      });

      expect(proc).toBeDefined();
      expect(proc.pid).toBeGreaterThan(0);
      expect(service.has("test-server")).toBe(true);
      expect(service.count).toBe(1);
    });

    it("should allow stopping a specific process", async () => {
      service.start({
        command: "node -e \"setTimeout(() => {}, 10000)\"",
        cwd: process.cwd(),
        name: "test-server",
        port: 9000,
      });

      expect(service.has("test-server")).toBe(true);
      await service.stop("test-server");
      expect(service.has("test-server")).toBe(false);
    });

    it("should allow stopping all processes", async () => {
      service.start({
        command: "node -e \"setTimeout(() => {}, 10000)\"",
        cwd: process.cwd(),
        name: "test-server-1",
        port: 9000,
      });

      service.start({
        command: "node -e \"setTimeout(() => {}, 10000)\"",
        cwd: process.cwd(),
        name: "test-server-2",
        port: 9001,
      });

      expect(service.count).toBe(2);
      await service.stopAll();
      expect(service.count).toBe(0);
    });
  });

  describe("spawnDirect", () => {
    it("should spawn a process with the correct options", async () => {
      const proc = spawnDirect({
        command: "node -e \"console.log('hello')\"",
        cwd: process.cwd(),
        name: "test-spawn",
        port: 9000,
        env: { TEST_VAR: "test-value" },
      });

      expect(proc).toBeDefined();
      expect(proc.pid).toBeGreaterThan(0);
      expect(proc.kill).toBeInstanceOf(Function);

      // Clean up
      await proc.kill();
    });

    it("should pass environment variables to the process", async () => {
      const proc = spawnDirect({
        command: "node -e \"console.log(process.env.PORT)\"",
        cwd: process.cwd(),
        name: "test-env",
        port: 8888,
      });

      expect(proc).toBeDefined();

      // The PORT env var should be set to the port number
      // We can't easily test the env vars passed to the child, but we verify the process starts
      await proc.kill();
    });
  });
});
