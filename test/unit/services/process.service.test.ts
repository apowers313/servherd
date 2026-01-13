import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2, createMockProcess } from "../../mocks/pm2.js";

// Mock PM2 before importing ProcessService
vi.mock("pm2", async () => {
  const { mockPM2Module } = await import("../../mocks/pm2.js");
  return mockPM2Module;
});

// Import after mocking
const { ProcessService } = await import("../../../src/services/process.service.js");

describe("ProcessService", () => {
  const mockPM2 = getMockPM2();
  let service: ProcessService;

  beforeEach(() => {
    mockPM2._reset();
    service = new ProcessService();
  });

  describe("connect", () => {
    it("should connect to PM2 daemon", async () => {
      await service.connect();
      expect(mockPM2.connect).toHaveBeenCalled();
    });

    it("should throw on connection error", async () => {
      mockPM2.connect.mockImplementationOnce((callback: (err?: Error) => void) => {
        callback(new Error("Connection failed"));
      });

      await expect(service.connect()).rejects.toThrow("Connection failed");
    });
  });

  describe("disconnect", () => {
    it("should disconnect from PM2 daemon", async () => {
      await service.connect();
      service.disconnect();
      expect(mockPM2.disconnect).toHaveBeenCalled();
    });
  });

  describe("start", () => {
    it("should start process with correct PM2 options", async () => {
      await service.connect();

      await service.start({
        name: "servherd-test",
        script: "npm",
        args: ["start"],
        cwd: "/project",
        env: { PORT: "3000" },
      });

      expect(mockPM2.start).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "servherd-test",
          script: "npm",
          args: ["start"],
          cwd: "/project",
          env: expect.objectContaining({ PORT: "3000" }),
        }),
        expect.any(Function),
      );
    });

    it("should throw when not connected", async () => {
      await expect(
        service.start({
          name: "test",
          script: "npm",
        }),
      ).rejects.toThrow("Not connected");
    });

    it("should enable ISO timestamps by default", async () => {
      await service.connect();

      await service.start({
        name: "servherd-test",
        script: "npm",
        args: ["start"],
        cwd: "/project",
      });

      expect(mockPM2.start).toHaveBeenCalledWith(
        expect.objectContaining({
          log_date_format: "YYYY-MM-DDTHH:mm:ss.SSSZ",
        }),
        expect.any(Function),
      );
    });

    it("should allow custom timestamp format", async () => {
      await service.connect();

      await service.start({
        name: "servherd-test",
        script: "npm",
        args: ["start"],
        cwd: "/project",
        log_date_format: "YYYY-MM-DD HH:mm:ss",
      });

      expect(mockPM2.start).toHaveBeenCalledWith(
        expect.objectContaining({
          log_date_format: "YYYY-MM-DD HH:mm:ss",
        }),
        expect.any(Function),
      );
    });
  });

  describe("stop", () => {
    it("should stop process by name", async () => {
      await service.connect();

      // First start a process
      await service.start({
        name: "servherd-test",
        script: "npm",
        args: ["start"],
        cwd: "/project",
      });

      await service.stop("servherd-test");

      expect(mockPM2.stop).toHaveBeenCalledWith("servherd-test", expect.any(Function));
    });

    it("should throw when process not found", async () => {
      await service.connect();

      await expect(service.stop("nonexistent")).rejects.toThrow("not found");
    });
  });

  describe("restart", () => {
    it("should restart process by name", async () => {
      await service.connect();

      // First start a process
      await service.start({
        name: "servherd-test",
        script: "npm",
        args: ["start"],
        cwd: "/project",
      });

      await service.restart("servherd-test");

      expect(mockPM2.restart).toHaveBeenCalledWith("servherd-test", expect.any(Function));
    });
  });

  describe("delete", () => {
    it("should delete process by name", async () => {
      await service.connect();

      // First start a process
      await service.start({
        name: "servherd-test",
        script: "npm",
        args: ["start"],
        cwd: "/project",
      });

      await service.delete("servherd-test");

      expect(mockPM2.delete).toHaveBeenCalledWith("servherd-test", expect.any(Function));
    });
  });

  describe("describe", () => {
    it("should get process description", async () => {
      await service.connect();

      // Start a process first
      await service.start({
        name: "servherd-test",
        script: "npm",
        args: ["start"],
        cwd: "/project",
      });

      const result = await service.describe("servherd-test");

      expect(result).toBeDefined();
      expect(result?.name).toBe("servherd-test");
      expect(result?.pm2_env.status).toBe("online");
    });

    it("should return undefined when process not found", async () => {
      await service.connect();

      const result = await service.describe("nonexistent");

      expect(result).toBeUndefined();
    });
  });

  describe("list", () => {
    it("should list all processes", async () => {
      await service.connect();

      // Start a couple of processes
      await service.start({
        name: "servherd-test-1",
        script: "npm",
        args: ["start"],
        cwd: "/project1",
      });

      await service.start({
        name: "servherd-test-2",
        script: "npm",
        args: ["dev"],
        cwd: "/project2",
      });

      const result = await service.list();

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.name)).toContain("servherd-test-1");
      expect(result.map((p) => p.name)).toContain("servherd-test-2");
    });

    it("should return empty array when no processes", async () => {
      await service.connect();

      const result = await service.list();

      expect(result).toEqual([]);
    });
  });

  describe("listServherdProcesses", () => {
    it("should filter only servherd processes", async () => {
      await service.connect();

      // Add a non-servherd process to mock
      const mockProcess = createMockProcess({ name: "other-process" });
      mockPM2._setProcesses([
        mockProcess,
        createMockProcess({ name: "servherd-my-app" }),
      ]);

      const result = await service.listServherdProcesses();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("servherd-my-app");
    });
  });

  describe("getStatus", () => {
    it("should return online for running process", async () => {
      await service.connect();

      await service.start({
        name: "servherd-test",
        script: "npm",
        cwd: "/project",
      });

      const status = await service.getStatus("servherd-test");

      expect(status).toBe("online");
    });

    it("should return stopped for stopped process", async () => {
      await service.connect();

      await service.start({
        name: "servherd-test",
        script: "npm",
        cwd: "/project",
      });

      await service.stop("servherd-test");

      const status = await service.getStatus("servherd-test");

      expect(status).toBe("stopped");
    });

    it("should return unknown for nonexistent process", async () => {
      await service.connect();

      const status = await service.getStatus("nonexistent");

      expect(status).toBe("unknown");
    });
  });

  describe("flush", () => {
    it("should flush logs for a specific process", async () => {
      await service.connect();

      await service.start({
        name: "servherd-test",
        script: "npm",
        cwd: "/project",
      });

      await service.flush("servherd-test");

      expect(mockPM2.flush).toHaveBeenCalledWith("servherd-test", expect.any(Function));
    });

    it("should throw when not connected", async () => {
      await expect(service.flush("test")).rejects.toThrow("Not connected");
    });
  });

  describe("flushAll", () => {
    it("should flush logs for all servherd processes only", async () => {
      await service.connect();

      // Add a mix of servherd and non-servherd processes
      const mockServherd1 = createMockProcess({ name: "servherd-app1" });
      const mockServherd2 = createMockProcess({ name: "servherd-app2" });
      const mockOther = createMockProcess({ name: "other-process" });
      mockPM2._setProcesses([mockServherd1, mockServherd2, mockOther]);

      await service.flushAll();

      // Should only flush servherd processes, not "other-process"
      expect(mockPM2.flush).toHaveBeenCalledWith("servherd-app1", expect.any(Function));
      expect(mockPM2.flush).toHaveBeenCalledWith("servherd-app2", expect.any(Function));
      expect(mockPM2.flush).not.toHaveBeenCalledWith("other-process", expect.any(Function));
      expect(mockPM2.flush).not.toHaveBeenCalledWith("all", expect.any(Function));
    });

    it("should throw when not connected", async () => {
      await expect(service.flushAll()).rejects.toThrow("Not connected");
    });
  });
});
