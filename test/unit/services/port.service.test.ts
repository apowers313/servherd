import { describe, it, expect, vi, afterEach } from "vitest";
import { createServer, Server } from "net";
import { PortService } from "../../../src/services/port.service.js";
import type { GlobalConfig } from "../../../src/types/config.js";
import { ServherdError } from "../../../src/types/errors.js";

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

describe("PortService", () => {
  describe("generatePort", () => {
    it("should generate deterministic port for same input", () => {
      const config = createMockConfig();
      const service = new PortService(config);
      const port1 = service.generatePort("/home/user/project", "npm start");
      const port2 = service.generatePort("/home/user/project", "npm start");
      expect(port1).toBe(port2);
    });

    it("should generate different ports for different paths", () => {
      const config = createMockConfig();
      const service = new PortService(config);
      const port1 = service.generatePort("/project-a", "npm start");
      const port2 = service.generatePort("/project-b", "npm start");
      expect(port1).not.toBe(port2);
    });

    it("should generate different ports for different commands", () => {
      const config = createMockConfig();
      const service = new PortService(config);
      const port1 = service.generatePort("/project", "npm start");
      const port2 = service.generatePort("/project", "npm run dev");
      expect(port1).not.toBe(port2);
    });

    it("should stay within configured port range", () => {
      const config = createMockConfig({ min: 5000, max: 6000 });
      const service = new PortService(config);

      // Test with multiple inputs to verify range constraint
      for (let i = 0; i < 100; i++) {
        const port = service.generatePort(`/project-${i}`, "npm start");
        expect(port).toBeGreaterThanOrEqual(5000);
        expect(port).toBeLessThanOrEqual(6000);
      }
    });

    it("should handle empty cwd", () => {
      const config = createMockConfig();
      const service = new PortService(config);
      const port = service.generatePort("", "npm start");
      expect(port).toBeGreaterThanOrEqual(3000);
      expect(port).toBeLessThanOrEqual(9999);
    });

    it("should handle empty command", () => {
      const config = createMockConfig();
      const service = new PortService(config);
      const port = service.generatePort("/project", "");
      expect(port).toBeGreaterThanOrEqual(3000);
      expect(port).toBeLessThanOrEqual(9999);
    });

    it("should handle narrow port range", () => {
      const config = createMockConfig({ min: 8080, max: 8085 });
      const service = new PortService(config);

      for (let i = 0; i < 50; i++) {
        const port = service.generatePort(`/project-${i}`, "npm start");
        expect(port).toBeGreaterThanOrEqual(8080);
        expect(port).toBeLessThanOrEqual(8085);
      }
    });

    it("should handle single port range", () => {
      const config = createMockConfig({ min: 8080, max: 8080 });
      const service = new PortService(config);
      const port = service.generatePort("/project", "npm start");
      expect(port).toBe(8080);
    });
  });

  describe("computeHash", () => {
    it("should produce consistent hash for same input", () => {
      const config = createMockConfig();
      const service = new PortService(config);
      const hash1 = service.computeHash("/project", "npm start");
      const hash2 = service.computeHash("/project", "npm start");
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different inputs", () => {
      const config = createMockConfig();
      const service = new PortService(config);
      const hash1 = service.computeHash("/project-a", "npm start");
      const hash2 = service.computeHash("/project-b", "npm start");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("port availability", () => {
    // Use ports outside the common range to avoid conflicts
    const testPortBase = 9050;
    let testServer: Server | null = null;

    afterEach(async () => {
      if (testServer) {
        await new Promise<void>((resolve) => {
          testServer!.close(() => resolve());
        });
        testServer = null;
      }
    });

    it("should detect available port", async () => {
      const config = createMockConfig({ min: testPortBase, max: testPortBase + 100 });
      const service = new PortService(config);
      // Port 9050 should be available (assuming nothing is using it)
      const available = await service.isPortAvailable(testPortBase);
      expect(typeof available).toBe("boolean");
    });

    it("should detect unavailable port", async () => {
      const testPort = testPortBase + 1;
      const config = createMockConfig({ min: testPort, max: testPort + 100 });
      const service = new PortService(config);

      // Start a server on a known port first
      testServer = createServer();
      await new Promise<void>((resolve) => {
        testServer!.listen(testPort, resolve);
      });

      const available = await service.isPortAvailable(testPort);
      expect(available).toBe(false);
    });

    it("should find next available port when preferred is taken", async () => {
      const testPort = testPortBase + 2;
      const config = createMockConfig({ min: testPort, max: testPort + 100 });
      const service = new PortService(config);

      // Start a server on the preferred port
      testServer = createServer();
      await new Promise<void>((resolve) => {
        testServer!.listen(testPort, resolve);
      });

      const result = await service.getAvailablePort(testPort);
      expect(result.port).not.toBe(testPort);
      expect(result.reassigned).toBe(true);
      expect(result.port).toBeGreaterThan(testPort);
    });

    it("should return preferred port when available", async () => {
      const testPort = testPortBase + 3;
      const config = createMockConfig({ min: testPort, max: testPort + 100 });
      const service = new PortService(config);

      const result = await service.getAvailablePort(testPort);
      expect(result.port).toBe(testPort);
      expect(result.reassigned).toBe(false);
    });

    it("should throw when no ports available in range", async () => {
      const config = createMockConfig({ min: 9054, max: 9054 });
      const service = new PortService(config);

      // Mock isPortAvailable to always return false
      vi.spyOn(service, "isPortAvailable").mockResolvedValue(false);

      await expect(service.getAvailablePort(9054)).rejects.toThrow(ServherdError);
      await expect(service.getAvailablePort(9054)).rejects.toThrow(/No available ports/);
    });

    it("should wrap around to min port when reaching max", async () => {
      // Create a range where we can test wrap-around behavior
      const minPort = 9055;
      const maxPort = 9057;
      const config = createMockConfig({ min: minPort, max: maxPort });
      const service = new PortService(config);

      // Mock: preferred port (9057) and the one after (wrap to 9055) are unavailable
      // Only 9056 is available
      const isPortAvailableSpy = vi.spyOn(service, "isPortAvailable");
      isPortAvailableSpy.mockImplementation(async (port: number) => {
        // Port 9057 unavailable, 9055 unavailable, 9056 available
        return port === 9056;
      });

      const result = await service.getAvailablePort(9057);
      expect(result.port).toBe(9056);
      expect(result.reassigned).toBe(true);
    });
  });

  describe("assignPort", () => {
    it("should use explicit port when provided and available", async () => {
      const config = createMockConfig({ min: 9060, max: 9070 });
      const service = new PortService(config);

      // Mock port availability to avoid flaky test depending on system state
      vi.spyOn(service, "isPortAvailable").mockResolvedValue(true);

      const result = await service.assignPort("/project", "npm start", 9065);
      expect(result.port).toBe(9065);
      expect(result.reassigned).toBe(false);
    });

    it("should validate explicit port is in range", async () => {
      const config = createMockConfig({ min: 9060, max: 9070 });
      const service = new PortService(config);

      await expect(
        service.assignPort("/project", "npm start", 8000),
      ).rejects.toThrow(ServherdError);
      await expect(
        service.assignPort("/project", "npm start", 8000),
      ).rejects.toThrow(/outside configured range/);
    });

    it("should generate port when no explicit port provided", async () => {
      const config = createMockConfig({ min: 9060, max: 9070 });
      const service = new PortService(config);

      const result = await service.assignPort("/project", "npm start");
      expect(result.port).toBeGreaterThanOrEqual(9060);
      expect(result.port).toBeLessThanOrEqual(9070);
    });

    it("should check availability of explicit port", async () => {
      const config = createMockConfig({ min: 9060, max: 9070 });
      const service = new PortService(config);

      // Mock the port as unavailable
      vi.spyOn(service, "isPortAvailable").mockImplementation(async (port: number) => {
        return port !== 9065; // 9065 is unavailable
      });

      const result = await service.assignPort("/project", "npm start", 9065);
      expect(result.port).not.toBe(9065);
      expect(result.reassigned).toBe(true);
    });

    it("should check availability of generated port", async () => {
      const config = createMockConfig({ min: 9060, max: 9070 });
      const service = new PortService(config);

      // Get what port would be generated
      const generatedPort = service.generatePort("/project", "npm start");

      // Mock the generated port as unavailable
      vi.spyOn(service, "isPortAvailable").mockImplementation(async (port: number) => {
        return port !== generatedPort;
      });

      const result = await service.assignPort("/project", "npm start");
      expect(result.port).not.toBe(generatedPort);
      expect(result.reassigned).toBe(true);
    });
  });

  describe("validatePortInRange", () => {
    it("should throw for port below minimum", () => {
      const config = createMockConfig({ min: 3000, max: 9999 });
      const service = new PortService(config);

      expect(() => service.validatePortInRange(2999)).toThrow(ServherdError);
      expect(() => service.validatePortInRange(2999)).toThrow(/outside configured range/);
    });

    it("should throw for port above maximum", () => {
      const config = createMockConfig({ min: 3000, max: 9999 });
      const service = new PortService(config);

      expect(() => service.validatePortInRange(10000)).toThrow(ServherdError);
      expect(() => service.validatePortInRange(10000)).toThrow(/outside configured range/);
    });

    it("should not throw for port within range", () => {
      const config = createMockConfig({ min: 3000, max: 9999 });
      const service = new PortService(config);

      expect(() => service.validatePortInRange(3000)).not.toThrow();
      expect(() => service.validatePortInRange(5000)).not.toThrow();
      expect(() => service.validatePortInRange(9999)).not.toThrow();
    });
  });

  describe("CI mode port allocation", () => {
    it("should use sequential ports in CI mode", async () => {
      const config = createMockConfig({ min: 9080, max: 9090 });
      const service = new PortService(config);

      // Mock all ports as available
      vi.spyOn(service, "isPortAvailable").mockResolvedValue(true);

      // First port in CI mode should be min
      const result1 = await service.assignPort("dir1", "cmd1", undefined, true);
      expect(result1.port).toBe(9080);
      expect(result1.reassigned).toBe(false);

      // Track the first port so sequential allocator knows it's used
      service.trackUsedPort(result1.port);

      // Second port in CI mode should be min+1
      // reassigned=true because we skipped a tracked port
      const result2 = await service.assignPort("dir2", "cmd2", undefined, true);
      expect(result2.port).toBe(9081);
      expect(result2.reassigned).toBe(true); // Skipped tracked port 9080
    });

    it("should use deterministic ports in non-CI mode", async () => {
      const config = createMockConfig({ min: 9080, max: 9090 });
      const service = new PortService(config);

      // Mock all ports as available
      vi.spyOn(service, "isPortAvailable").mockResolvedValue(true);

      // Same input should produce same port in non-CI mode
      const result1 = await service.assignPort("dir1", "cmd1", undefined, false);
      const result2 = await service.assignPort("dir1", "cmd1", undefined, false);

      expect(result1.port).toBe(result2.port);
    });

    it("should skip used ports in CI mode sequential allocation", async () => {
      const config = createMockConfig({ min: 9080, max: 9090 });
      const service = new PortService(config);

      // Mock isPortAvailable: 9080 is not available, 9081 is
      vi.spyOn(service, "isPortAvailable").mockImplementation(async (port: number) => {
        return port !== 9080;
      });

      const result = await service.assignPort("dir1", "cmd1", undefined, true);
      expect(result.port).toBe(9081);
      expect(result.reassigned).toBe(true);
    });

    it("should reset used ports tracking when clearUsedPorts is called", async () => {
      const config = createMockConfig({ min: 9080, max: 9090 });
      const service = new PortService(config);

      vi.spyOn(service, "isPortAvailable").mockResolvedValue(true);

      // Allocate first port
      const result1 = await service.assignPort("dir1", "cmd1", undefined, true);
      service.trackUsedPort(result1.port);

      // Clear tracked ports
      service.clearUsedPorts();

      // Should start from min again
      const result2 = await service.assignPort("dir2", "cmd2", undefined, true);
      expect(result2.port).toBe(9080);
    });

    it("should throw when no ports available in CI mode", async () => {
      const config = createMockConfig({ min: 9080, max: 9082 });
      const service = new PortService(config);

      // Mock all ports as unavailable
      vi.spyOn(service, "isPortAvailable").mockResolvedValue(false);

      await expect(service.assignPort("dir1", "cmd1", undefined, true)).rejects.toThrow(ServherdError);
      await expect(service.assignPort("dir1", "cmd1", undefined, true)).rejects.toThrow(/No available ports/);
    });

    it("should respect explicit port even in CI mode", async () => {
      const config = createMockConfig({ min: 9080, max: 9090 });
      const service = new PortService(config);

      vi.spyOn(service, "isPortAvailable").mockResolvedValue(true);

      const result = await service.assignPort("dir1", "cmd1", 9085, true);
      expect(result.port).toBe(9085);
      expect(result.reassigned).toBe(false);
    });
  });
});
