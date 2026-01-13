import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2 } from "../../../mocks/pm2.js";
import { ServherdError } from "../../../../src/types/errors.js";

// Mock PM2 before other imports
vi.mock("pm2", async () => {
  const { mockPM2Module } = await import("../../../mocks/pm2.js");
  return mockPM2Module;
});

// Mock RegistryService
const mockRegistryService = {
  load: vi.fn(),
  findByName: vi.fn(),
  findById: vi.fn(),
  listServers: vi.fn(),
  save: vi.fn(),
  updateServer: vi.fn(),
};

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Import after mocking
const { executeInfo } = await import("../../../../src/cli/commands/info.js");
const { executeRestart } = await import("../../../../src/cli/commands/restart.js");

describe("CLI commands error consistency", () => {
  const mockPM2 = getMockPM2();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPM2._reset();

    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.findByName.mockReturnValue(undefined);
    mockRegistryService.listServers.mockReturnValue([]);
  });

  describe("info command", () => {
    it("should throw ServherdError for missing server", async () => {
      mockRegistryService.findByName.mockReturnValue(undefined);

      await expect(executeInfo({ name: "nonexistent" }))
        .rejects.toBeInstanceOf(ServherdError);
    });

    it("should throw ServherdError with SERVER_NOT_FOUND code", async () => {
      mockRegistryService.findByName.mockReturnValue(undefined);

      try {
        await executeInfo({ name: "nonexistent" });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(ServherdError);
        expect((error as ServherdError).code).toBe(1001); // SERVER_NOT_FOUND
      }
    });
  });

  describe("restart command", () => {
    it("should throw ServherdError for missing server", async () => {
      mockRegistryService.findByName.mockReturnValue(undefined);

      await expect(executeRestart({ name: "nonexistent" }))
        .rejects.toBeInstanceOf(ServherdError);
    });

    it("should throw ServherdError with SERVER_NOT_FOUND code", async () => {
      mockRegistryService.findByName.mockReturnValue(undefined);

      try {
        await executeRestart({ name: "nonexistent" });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(ServherdError);
        expect((error as ServherdError).code).toBe(1001); // SERVER_NOT_FOUND
      }
    });
  });
});
