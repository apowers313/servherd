import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { followLog } from "../../../src/utils/log-follower.js";

describe("log-follower", () => {
  let tempDir: string;
  let tempFile: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = await fs.mkdtemp(join(tmpdir(), "log-follower-test-"));
    tempFile = join(tempDir, "test.log");
    // Create initial empty file
    await fs.writeFile(tempFile, "");
  });

  afterEach(async () => {
    // Clean up temp files
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("followLog", () => {
    it("should emit new lines when file changes", async () => {
      const lines: string[] = [];
      const controller = new AbortController();

      // Start following
      const followerPromise = followLog(tempFile, controller.signal, (line) => {
        lines.push(line);
      });

      // Wait a bit for watcher to be set up
      await sleep(50);

      // Append some lines
      await fs.appendFile(tempFile, "line 1\n");
      await sleep(100);
      await fs.appendFile(tempFile, "line 2\n");
      await sleep(100);

      // Stop following
      controller.abort();
      await followerPromise;

      expect(lines).toContain("line 1");
      expect(lines).toContain("line 2");
    });

    it("should stop following on abort signal", async () => {
      const lines: string[] = [];
      const controller = new AbortController();

      const followerPromise = followLog(tempFile, controller.signal, (line) => {
        lines.push(line);
      });

      // Abort immediately
      controller.abort();
      await followerPromise;

      // Write after abort - should not be captured
      await fs.appendFile(tempFile, "should not capture\n");
      await sleep(50);

      expect(lines).not.toContain("should not capture");
    });

    it("should handle pre-aborted signal", async () => {
      const lines: string[] = [];
      const controller = new AbortController();
      controller.abort();

      const followerPromise = followLog(tempFile, controller.signal, (line) => {
        lines.push(line);
      });

      await expect(followerPromise).resolves.not.toThrow();
    });

    it("should handle multiple lines at once", async () => {
      const lines: string[] = [];
      const controller = new AbortController();

      const followerPromise = followLog(tempFile, controller.signal, (line) => {
        lines.push(line);
      });

      await sleep(50);

      // Write multiple lines at once
      await fs.appendFile(tempFile, "line A\nline B\nline C\n");
      await sleep(100);

      controller.abort();
      await followerPromise;

      expect(lines).toContain("line A");
      expect(lines).toContain("line B");
      expect(lines).toContain("line C");
    });

    it("should handle file with existing content", async () => {
      // Write initial content
      await fs.writeFile(tempFile, "existing line\n");

      const lines: string[] = [];
      const controller = new AbortController();

      const followerPromise = followLog(tempFile, controller.signal, (line) => {
        lines.push(line);
      });

      await sleep(50);

      // Write new content
      await fs.appendFile(tempFile, "new line\n");
      await sleep(100);

      controller.abort();
      await followerPromise;

      // Should only see new content, not existing
      expect(lines).toContain("new line");
      expect(lines).not.toContain("existing line");
    });

    it("should filter out empty lines", async () => {
      const lines: string[] = [];
      const controller = new AbortController();

      const followerPromise = followLog(tempFile, controller.signal, (line) => {
        lines.push(line);
      });

      await sleep(50);

      // Write lines with empties
      await fs.appendFile(tempFile, "line 1\n\n\nline 2\n");
      await sleep(100);

      controller.abort();
      await followerPromise;

      expect(lines).toContain("line 1");
      expect(lines).toContain("line 2");
      // Empty lines should be filtered
      expect(lines.filter((l) => l === "")).toHaveLength(0);
    });
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
