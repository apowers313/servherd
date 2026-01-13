import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PortService } from "../../../src/services/port.service.js";
import type { GlobalConfig } from "../../../src/types/config.js";

// Mock fs-extra/esm module
vi.mock("fs-extra/esm", () => ({
  pathExists: vi.fn(),
  readJson: vi.fn(),
  writeJson: vi.fn(),
  ensureDir: vi.fn(),
}));

// Import mocked modules
import { pathExists, readJson, writeJson, ensureDir } from "fs-extra/esm";

const createMockConfig = (portRange = { min: 3000, max: 9999 }): GlobalConfig => ({
  version: "1",
  hostname: "localhost",
  protocol: "http",
  portRange,
  tempDir: "/tmp/servherd",
  pm2: {
    logDir: "/tmp/servherd/logs",
    pidDir: "/tmp/servherd/pids",
  },
});

describe("PortService CI port persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  it("should persist CI used ports to file", async () => {
    const config = createMockConfig({ min: 9080, max: 9090 });
    const portService = new PortService(config);

    vi.mocked(pathExists).mockResolvedValue(false as never);
    vi.mocked(ensureDir).mockResolvedValue(undefined as never);
    vi.mocked(writeJson).mockResolvedValue(undefined as never);

    // Mock port availability
    vi.spyOn(portService, "isPortAvailable").mockResolvedValue(true);

    // Assign a port in CI mode
    const result = await portService.assignPort("/test", "npm start", undefined, true);
    portService.trackUsedPort(result.port);

    // Save CI ports
    await portService.saveCiUsedPorts();

    expect(writeJson).toHaveBeenCalledWith(
      expect.stringContaining("ci-ports.json"),
      expect.objectContaining({
        ports: expect.arrayContaining([result.port]),
        timestamp: expect.any(Number),
      }),
    );
  });

  it("should load CI ports from file on init", async () => {
    const config = createMockConfig({ min: 9080, max: 9090 });

    // Setup mock to return existing CI ports
    const existingPorts = { ports: [9080, 9081], timestamp: Date.now() };
    vi.mocked(pathExists).mockResolvedValue(true as never);
    vi.mocked(readJson).mockResolvedValue(existingPorts as never);

    const portService = new PortService(config);
    await portService.loadCiUsedPorts();

    // The loaded ports should be tracked
    expect(portService.getCiUsedPorts()).toContain(9080);
    expect(portService.getCiUsedPorts()).toContain(9081);
  });

  it("should clean up stale CI port entries", async () => {
    const config = createMockConfig({ min: 9080, max: 9090 });

    // Set current time
    const now = Date.now();
    vi.setSystemTime(now);

    // Setup mock to return stale CI ports (older than 1 hour)
    const staleTimestamp = now - (3600000 + 1000); // 1 hour + 1 second ago
    const stalePortsData = { ports: [9080, 9081], timestamp: staleTimestamp };
    vi.mocked(pathExists).mockResolvedValue(true as never);
    vi.mocked(readJson).mockResolvedValue(stalePortsData as never);

    const portService = new PortService(config);
    await portService.loadCiUsedPorts();

    // Stale entries should be ignored
    expect(portService.getCiUsedPorts()).not.toContain(9080);
    expect(portService.getCiUsedPorts()).not.toContain(9081);
    expect(portService.getCiUsedPorts().size).toBe(0);
  });

  it("should keep fresh CI port entries", async () => {
    const config = createMockConfig({ min: 9080, max: 9090 });

    // Set current time
    const now = Date.now();
    vi.setSystemTime(now);

    // Setup mock to return fresh CI ports (less than 1 hour old)
    const freshTimestamp = now - 1800000; // 30 minutes ago
    const freshPortsData = { ports: [9080, 9081], timestamp: freshTimestamp };
    vi.mocked(pathExists).mockResolvedValue(true as never);
    vi.mocked(readJson).mockResolvedValue(freshPortsData as never);

    const portService = new PortService(config);
    await portService.loadCiUsedPorts();

    // Fresh entries should be kept
    expect(portService.getCiUsedPorts()).toContain(9080);
    expect(portService.getCiUsedPorts()).toContain(9081);
  });

  it("should handle missing CI ports file gracefully", async () => {
    const config = createMockConfig({ min: 9080, max: 9090 });

    vi.mocked(pathExists).mockResolvedValue(false as never);

    const portService = new PortService(config);
    await portService.loadCiUsedPorts();

    // Should have empty set when file doesn't exist
    expect(portService.getCiUsedPorts().size).toBe(0);
  });

  it("should handle corrupted CI ports file gracefully", async () => {
    const config = createMockConfig({ min: 9080, max: 9090 });

    vi.mocked(pathExists).mockResolvedValue(true as never);
    vi.mocked(readJson).mockRejectedValue(new Error("Invalid JSON"));

    const portService = new PortService(config);
    await portService.loadCiUsedPorts();

    // Should have empty set when file is corrupted
    expect(portService.getCiUsedPorts().size).toBe(0);
  });

  it("should skip used ports from CI file during sequential allocation", async () => {
    const config = createMockConfig({ min: 9080, max: 9090 });

    // Set current time
    const now = Date.now();
    vi.setSystemTime(now);

    // Setup mock to return fresh CI ports
    const freshPortsData = { ports: [9080], timestamp: now - 60000 }; // 1 minute ago
    vi.mocked(pathExists).mockResolvedValue(true as never);
    vi.mocked(readJson).mockResolvedValue(freshPortsData as never);
    vi.mocked(ensureDir).mockResolvedValue(undefined as never);
    vi.mocked(writeJson).mockResolvedValue(undefined as never);

    const portService = new PortService(config);
    await portService.loadCiUsedPorts();

    // Mock all ports as available from system perspective
    vi.spyOn(portService, "isPortAvailable").mockResolvedValue(true);

    // Assign port in CI mode - should skip 9080 since it's in the CI file
    const result = await portService.assignPort("/test", "npm start", undefined, true);

    expect(result.port).toBe(9081); // Should skip 9080
    expect(result.reassigned).toBe(true); // Skipped a port
  });
});
