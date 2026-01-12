import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa, ExecaError } from "execa";
import path from "path";

const CLI_PATH = path.join(process.cwd(), "src", "index.ts");

describe("CI Mode", () => {
  // Ensure we have a clean build
  beforeAll(async () => {
    await execa("npm", ["run", "build"], { cwd: process.cwd() });
  }, 60000);

  describe("Environment Detection", () => {
    it("should auto-detect CI environment", async () => {
      const result = await execa("npx", ["tsx", CLI_PATH, "config", "--show"], {
        env: { CI: "true", HOME: process.env.HOME },
        cwd: process.cwd(),
      });
      // Should run without prompting
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeDefined();
    }, 30000);

    it("should detect GitHub Actions", async () => {
      const result = await execa("npx", ["tsx", CLI_PATH, "config", "--show"], {
        env: { GITHUB_ACTIONS: "true", HOME: process.env.HOME },
        cwd: process.cwd(),
      });
      expect(result.exitCode).toBe(0);
    }, 30000);

    it("should detect GitLab CI", async () => {
      const result = await execa("npx", ["tsx", CLI_PATH, "config", "--show"], {
        env: { GITLAB_CI: "true", HOME: process.env.HOME },
        cwd: process.cwd(),
      });
      expect(result.exitCode).toBe(0);
    }, 30000);
  });

  describe("Environment Variable Overrides", () => {
    it("should respect SERVHERD_HOSTNAME environment variable", async () => {
      const result = await execa("npx", ["tsx", CLI_PATH, "config", "--show"], {
        env: {
          CI: "true",
          SERVHERD_HOSTNAME: "ci.local",
          HOME: process.env.HOME,
        },
        cwd: process.cwd(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("ci.local");
    }, 30000);

    it("should respect SERVHERD_PORT_MIN environment variable", async () => {
      const result = await execa("npx", ["tsx", CLI_PATH, "config", "--show"], {
        env: {
          CI: "true",
          SERVHERD_PORT_MIN: "8000",
          HOME: process.env.HOME,
        },
        cwd: process.cwd(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("8000");
    }, 30000);

    it("should respect SERVHERD_PORT_MAX environment variable", async () => {
      const result = await execa("npx", ["tsx", CLI_PATH, "config", "--show"], {
        env: {
          CI: "true",
          SERVHERD_PORT_MAX: "9000",
          HOME: process.env.HOME,
        },
        cwd: process.cwd(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("9000");
    }, 30000);
  });

  describe("CLI Behavior in CI", () => {
    it("should show help without error", async () => {
      const result = await execa("npx", ["tsx", CLI_PATH, "--help"], {
        env: { CI: "true", HOME: process.env.HOME },
        cwd: process.cwd(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("servherd");
      expect(result.stdout).toContain("start");
      expect(result.stdout).toContain("stop");
      expect(result.stdout).toContain("list");
    }, 30000);

    it("should show version", async () => {
      const result = await execa("npx", ["tsx", CLI_PATH, "--version"], {
        env: { CI: "true", HOME: process.env.HOME },
        cwd: process.cwd(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    }, 30000);

    it("should list servers without error in CI", async () => {
      const result = await execa("npx", ["tsx", CLI_PATH, "list"], {
        env: { CI: "true", HOME: process.env.HOME },
        cwd: process.cwd(),
      });
      expect(result.exitCode).toBe(0);
    }, 30000);

    it("should handle invalid command gracefully", async () => {
      try {
        await execa("npx", ["tsx", CLI_PATH, "invalid-command"], {
          env: { CI: "true", HOME: process.env.HOME },
          cwd: process.cwd(),
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        const execaError = error as ExecaError;
        expect(execaError.exitCode).not.toBe(0);
      }
    }, 30000);
  });

  describe("Non-Interactive Mode", () => {
    it("should not prompt in CI when removing server", async () => {
      // First create a test server (if it doesn't exist)
      try {
        await execa("npx", ["tsx", CLI_PATH, "start", "--name", "ci-test-server", "--", "node", "-e", "setInterval(() => {}, 1000)"], {
          env: { CI: "true", HOME: process.env.HOME },
          cwd: process.cwd(),
          timeout: 10000,
        });
      } catch {
        // Ignore if server already exists or fails to start
      }

      // Attempt to stop without --force (should work in CI without prompting)
      const result = await execa("npx", ["tsx", CLI_PATH, "stop", "ci-test-server"], {
        env: { CI: "true", HOME: process.env.HOME },
        cwd: process.cwd(),
        timeout: 10000,
      });
      // Should succeed without hanging for input
      expect(result.exitCode).toBe(0);
    }, 30000);
  });

  // Cleanup
  afterAll(async () => {
    try {
      await execa("npx", ["tsx", CLI_PATH, "remove", "ci-test-server", "--force"], {
        env: { CI: "true", HOME: process.env.HOME },
        cwd: process.cwd(),
        timeout: 10000,
      });
    } catch {
      // Ignore cleanup errors
    }
  }, 30000);
});
