import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createServer, Server } from "net";
import { PortService } from "../../src/services/port.service.js";
import type { GlobalConfig } from "../../src/types/config.js";

// Use a unique port range that's less likely to conflict
// Range 9000-9099 is specified in the user's CLAUDE.md
const BASE_PORT = 9000;

const createMockConfig = (portRange: { min: number; max: number }): GlobalConfig => ({
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

describe("port conflict resolution (integration)", () => {
  let testServers: Server[] = [];
  let uniquePortOffset = 0;

  // Each test gets its own port range to avoid conflicts between tests
  function getUniquePortRange(size: number): { min: number; max: number } {
    const min = BASE_PORT + uniquePortOffset;
    const max = min + size - 1;
    uniquePortOffset += size + 5; // Add gap between test ranges
    return { min, max };
  }

  beforeEach(() => {
    // Increment offset to ensure unique range for each test
    uniquePortOffset += 10;
  });

  afterEach(async () => {
    // Clean up all test servers with proper error handling
    const closePromises = testServers.map((server) =>
      new Promise<void>((resolve) => {
        try {
          server.close(() => resolve());
        } catch {
          resolve(); // Resolve anyway if close fails
        }
      }),
    );
    await Promise.all(closePromises);
    testServers = [];
  });

  async function occupyPort(port: number): Promise<Server> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.on("error", (err) => reject(err));
      server.listen(port, () => resolve());
    });
    testServers.push(server);
    return server;
  }

  it("should reassign port when preferred port is taken", async () => {
    const portRange = getUniquePortRange(15);
    const config = createMockConfig(portRange);
    const portService = new PortService(config);

    // Generate a preferred port within the range
    const preferredPort = portService.generatePort("/test/project", "npm start");

    // Make sure the preferred port is actually in our range
    expect(preferredPort).toBeGreaterThanOrEqual(portRange.min);
    expect(preferredPort).toBeLessThanOrEqual(portRange.max);

    // Occupy the preferred port
    await occupyPort(preferredPort);

    // Now assignPort should find a different available port
    const result = await portService.assignPort("/test/project", "npm start");

    expect(result.port).not.toBe(preferredPort);
    expect(result.reassigned).toBe(true);
    expect(result.port).toBeGreaterThanOrEqual(portRange.min);
    expect(result.port).toBeLessThanOrEqual(portRange.max);
  });

  it("should use explicit port when available", async () => {
    const portRange = getUniquePortRange(15);
    const config = createMockConfig(portRange);
    const portService = new PortService(config);

    const explicitPort = portRange.min + 5;
    const result = await portService.assignPort("/test/project", "npm start", explicitPort);

    expect(result.port).toBe(explicitPort);
    expect(result.reassigned).toBe(false);
  });

  it("should reassign explicit port when it is occupied", async () => {
    const portRange = getUniquePortRange(15);
    const config = createMockConfig(portRange);
    const portService = new PortService(config);

    const explicitPort = portRange.min + 5;

    // Occupy the explicit port
    await occupyPort(explicitPort);

    const result = await portService.assignPort("/test/project", "npm start", explicitPort);

    expect(result.port).not.toBe(explicitPort);
    expect(result.reassigned).toBe(true);
  });
});
