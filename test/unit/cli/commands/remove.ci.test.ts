import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ServherdError } from "../../../../src/types/errors.js";

// Mock dependencies
vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
}));

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue(undefined),
    listServers: vi.fn().mockReturnValue([
      { id: "1", name: "test-server", pm2Name: "servherd-test" },
    ]),
    findByName: vi.fn().mockReturnValue({ id: "1", name: "test-server", pm2Name: "servherd-test" }),
    removeServer: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../../../../src/services/process.service.js", () => ({
  ProcessService: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../../../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Store original env
const originalEnv = process.env;

describe("Remove command CI awareness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Create a clean copy of environment variables
    process.env = { ...originalEnv };
    // Clear all CI-related environment variables
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.CIRCLECI;
    delete process.env.TRAVIS;
    delete process.env.JENKINS_URL;
    delete process.env.BUILDKITE;
    delete process.env.AZURE_PIPELINES;
    delete process.env.TEAMCITY_VERSION;
    delete process.env.TF_BUILD;
    delete process.env.CODEBUILD_BUILD_ID;
    delete process.env.DRONE;
    delete process.env.BITBUCKET_COMMIT;
    delete process.env.SEMAPHORE;
    delete process.env.RENDER;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should error in CI mode without --force", async () => {
    // Set CI environment
    process.env.CI = "true";

    // Dynamically import to get fresh module state
    const { executeRemove } = await import("../../../../src/cli/commands/remove.js");

    await expect(executeRemove({ all: true })).rejects.toThrow(ServherdError);
    await expect(executeRemove({ all: true })).rejects.toThrow(
      /requires --force flag in CI mode/,
    );
  });

  it("should work in CI mode with --force", async () => {
    // Set CI environment
    process.env.CI = "true";

    // Dynamically import to get fresh module state
    const { executeRemove } = await import("../../../../src/cli/commands/remove.js");

    const result = await executeRemove({ all: true, force: true });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].success).toBe(true);
  });

  it("should not require --force when not in CI mode", async () => {
    // Import confirm mock
    const { confirm } = await import("@inquirer/prompts");
    vi.mocked(confirm).mockResolvedValue(true);

    // Dynamically import to get fresh module state
    const { executeRemove } = await import("../../../../src/cli/commands/remove.js");

    // Should not throw, but will use the confirm prompt
    const result = await executeRemove({ all: true });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].success).toBe(true);
    expect(confirm).toHaveBeenCalled();
  });

  it("should skip confirm prompt with --force even when not in CI", async () => {
    const { confirm } = await import("@inquirer/prompts");

    // Dynamically import to get fresh module state
    const { executeRemove } = await import("../../../../src/cli/commands/remove.js");

    const result = await executeRemove({ all: true, force: true });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].success).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
