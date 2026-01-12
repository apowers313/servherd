import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the MCP server module
vi.mock("../../../../src/mcp/index.js", () => ({
  startStdioServer: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocking
const { mcpAction } = await import("../../../../src/cli/commands/mcp.js");
const { startStdioServer } = await import("../../../../src/mcp/index.js");

describe("mcp command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call startStdioServer", async () => {
    await mcpAction();

    expect(startStdioServer).toHaveBeenCalled();
  });

  it("should set exit code on error", async () => {
    const originalExitCode = process.exitCode;

    vi.mocked(startStdioServer).mockRejectedValueOnce(new Error("Test error"));

    await mcpAction();

    expect(process.exitCode).toBe(1);

    // Restore
    process.exitCode = originalExitCode;
  });
});
