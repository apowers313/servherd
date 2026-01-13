import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2 } from "../../mocks/pm2.js";

// Mock PM2 before importing ProcessService
vi.mock("pm2", async () => {
  const { mockPM2Module } = await import("../../mocks/pm2.js");
  return mockPM2Module;
});

// Import after mocking
const { ProcessService } = await import("../../../src/services/process.service.js");

describe("ProcessService.describe error handling", () => {
  const mockPM2 = getMockPM2();
  let service: InstanceType<typeof ProcessService>;

  beforeEach(() => {
    mockPM2._reset();
    service = new ProcessService();
  });

  it("should return undefined for 'not found' errors", async () => {
    await service.connect();

    mockPM2.describe.mockImplementationOnce(
      (name: string, callback: (err: Error | null, proc: unknown[]) => void) => {
        callback(new Error("process name not found"), []);
      },
    );

    const result = await service.describe("missing");
    expect(result).toBeUndefined();
  });

  it("should return undefined for 'process name not found' errors", async () => {
    await service.connect();

    mockPM2.describe.mockImplementationOnce(
      (name: string, callback: (err: Error | null, proc: unknown[]) => void) => {
        callback(new Error("process name not found in pm2 list"), []);
      },
    );

    const result = await service.describe("missing-process");
    expect(result).toBeUndefined();
  });

  it("should re-throw connection errors", async () => {
    await service.connect();

    mockPM2.describe.mockImplementationOnce(
      (name: string, callback: (err: Error | null, proc: unknown[]) => void) => {
        callback(new Error("PM2 connection failed"), []);
      },
    );

    await expect(service.describe("test"))
      .rejects.toThrow("PM2 connection failed");
  });

  it("should re-throw generic errors", async () => {
    await service.connect();

    mockPM2.describe.mockImplementationOnce(
      (name: string, callback: (err: Error | null, proc: unknown[]) => void) => {
        callback(new Error("Something went wrong"), []);
      },
    );

    await expect(service.describe("test"))
      .rejects.toThrow("Something went wrong");
  });

  it("should re-throw IPC errors", async () => {
    await service.connect();

    mockPM2.describe.mockImplementationOnce(
      (name: string, callback: (err: Error | null, proc: unknown[]) => void) => {
        callback(new Error("IPC channel closed"), []);
      },
    );

    await expect(service.describe("test"))
      .rejects.toThrow("IPC channel closed");
  });
});
