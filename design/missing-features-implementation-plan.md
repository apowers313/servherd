# Implementation Plan for Missing Features

## Overview

This plan implements the missing features identified in the gap analysis: CLI options (`--json`, `--port`, `--follow`, `--force`, `--stopped`, `--since`, `--head`, `--flush`), HTTPS support, port availability checking with conflict resolution, interactive configuration wizard, CI mode behavioral differences, and additional tooling (husky, commitlint, knip).

The implementation is organized into 6 phases, each delivering testable functionality that builds on previous phases without breaking existing behavior.

---

## Phase Breakdown

### Phase 1: JSON Output and Simple CLI Flags

**Objective**: Add `--json` global flag and simple command flags (`--port`, `--force`, `--stopped`) to establish the pattern for CLI enhancements.

**Tests to Write First**:

- `test/unit/cli/commands/json-output.test.ts`: JSON output mode tests
  ```typescript
  describe("JSON output mode", () => {
    it("should output valid JSON for list command", async () => {
      const result = await executeList({ json: true });
      expect(() => JSON.parse(result)).not.toThrow();
      expect(result).toHaveProperty("servers");
    });

    it("should output valid JSON for info command", async () => {
      const result = await executeInfo("test-server", { json: true });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("name");
      expect(parsed).toHaveProperty("status");
    });

    it("should output valid JSON for start command", async () => {
      const result = await executeStart({ command: "npm start", json: true });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("server");
      expect(parsed).toHaveProperty("status");
    });
  });
  ```

- `test/unit/cli/commands/start.test.ts`: Add tests for `--port` override
  ```typescript
  describe("--port option", () => {
    it("should use specified port instead of deterministic port", async () => {
      const result = await executeStart({
        command: "npm start",
        port: 8080,
      });
      expect(result.server.port).toBe(8080);
    });

    it("should reject port outside configured range", async () => {
      await expect(
        executeStart({ command: "npm start", port: 99999 })
      ).rejects.toThrow(ServherdError);
    });

    it("should validate port is a number", async () => {
      // Commander validation test
    });
  });
  ```

- `test/unit/cli/commands/stop.test.ts`: Add tests for `--force` flag
  ```typescript
  describe("--force option", () => {
    it("should send SIGKILL when --force is specified", async () => {
      await executeStop("test-server", { force: true });
      expect(mockPM2.delete).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ force: true })
      );
    });
  });
  ```

- `test/unit/cli/commands/list.test.ts`: Add tests for `--stopped` filter
  ```typescript
  describe("--stopped option", () => {
    it("should filter to only stopped servers", async () => {
      // Setup: some running, some stopped
      const result = await executeList({ stopped: true });
      expect(result.servers.every((s) => s.status === "stopped")).toBe(true);
    });

    it("should be mutually exclusive with --running", async () => {
      await expect(
        executeList({ stopped: true, running: true })
      ).rejects.toThrow();
    });
  });
  ```

**Implementation**:

- `src/cli/index.ts`: Add global `--json` option
  ```typescript
  program.option("--json", "Output results as JSON");
  ```

- `src/cli/output/json-formatter.ts`: New JSON formatting utilities
  ```typescript
  export interface JsonOutput<T> {
    success: boolean;
    data: T;
    error?: { code: string; message: string };
  }

  export function formatAsJson<T>(data: T): string {
    return JSON.stringify({ success: true, data }, null, 2);
  }

  export function formatErrorAsJson(error: unknown): string {
    if (isServherdError(error)) {
      return JSON.stringify({
        success: false,
        error: { code: error.getCodeName(), message: error.message },
      }, null, 2);
    }
    return JSON.stringify({
      success: false,
      error: { code: "UNKNOWN", message: String(error) },
    }, null, 2);
  }
  ```

- `src/cli/commands/list.ts`: Add `--stopped` and `--json` support
- `src/cli/commands/start.ts`: Add `--port` and `--json` support
- `src/cli/commands/stop.ts`: Add `--force` and `--json` support
- `src/cli/commands/info.ts`: Add `--json` support
- `src/cli/commands/restart.ts`: Add `--json` support
- `src/cli/commands/remove.ts`: Add `--json` support

- `src/types/cli.ts`: New types for CLI options
  ```typescript
  export interface GlobalOptions {
    json?: boolean;
  }

  export interface StartOptions extends GlobalOptions {
    name?: string;
    port?: number;
    tag?: string[];
    description?: string;
    env?: string[];
  }

  export interface StopOptions extends GlobalOptions {
    all?: boolean;
    tag?: string;
    force?: boolean;
  }

  export interface ListOptions extends GlobalOptions {
    running?: boolean;
    stopped?: boolean;
    tag?: string;
    cwd?: string;
  }
  ```

**Dependencies**:
- External: None
- Internal: Existing formatter infrastructure

**Verification**:
1. Run: `npm test -- test/unit/cli/commands/json-output.test.ts`
2. Run: `servherd list --json` → Valid JSON output with server array
3. Run: `servherd start --port 8080 -- npm start` → Server starts on port 8080
4. Run: `servherd stop test-server --force` → Server forcefully stopped
5. Run: `servherd list --stopped` → Only stopped servers shown

---

### Phase 2: Port Availability Checking and Conflict Resolution

**Objective**: Implement port availability checking before server start with automatic fallback to next available port.

**Tests to Write First**:

- `test/unit/services/port.service.test.ts`: Port availability tests
  ```typescript
  describe("port availability", () => {
    it("should detect available port", async () => {
      const available = await portService.isPortAvailable(9050);
      expect(typeof available).toBe("boolean");
    });

    it("should detect unavailable port", async () => {
      // Start a server on a known port first
      const server = createServer().listen(9051);
      try {
        const available = await portService.isPortAvailable(9051);
        expect(available).toBe(false);
      } finally {
        server.close();
      }
    });

    it("should find next available port when preferred is taken", async () => {
      const server = createServer().listen(9052);
      try {
        const result = await portService.getAvailablePort(9052);
        expect(result.port).not.toBe(9052);
        expect(result.reassigned).toBe(true);
      } finally {
        server.close();
      }
    });

    it("should return preferred port when available", async () => {
      const result = await portService.getAvailablePort(9053);
      expect(result.port).toBe(9053);
      expect(result.reassigned).toBe(false);
    });

    it("should throw when no ports available in range", async () => {
      // Mock all ports as unavailable
      vi.spyOn(portService, "isPortAvailable").mockResolvedValue(false);
      await expect(portService.getAvailablePort(3000)).rejects.toThrow(
        ServherdError
      );
    });
  });
  ```

- `test/integration/port-conflict.test.ts`: Integration test for conflict resolution
  ```typescript
  describe("port conflict resolution", () => {
    it("should reassign port and warn user when port is taken", async () => {
      const server = createServer().listen(9054);
      try {
        const consoleSpy = vi.spyOn(console, "warn");
        const result = await executeStart({
          command: "npm start --port {{port}}",
        });
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Port 9054 unavailable")
        );
        expect(result.server.port).not.toBe(9054);
      } finally {
        server.close();
      }
    });
  });
  ```

**Implementation**:

- `src/services/port.service.ts`: Add availability checking
  ```typescript
  import detectPort from "detect-port";

  export class PortService {
    // ... existing methods

    async isPortAvailable(port: number): Promise<boolean> {
      const available = await detectPort(port);
      return available === port;
    }

    async getAvailablePort(
      preferred: number
    ): Promise<{ port: number; reassigned: boolean }> {
      if (await this.isPortAvailable(preferred)) {
        return { port: preferred, reassigned: false };
      }

      // Find next available port in range
      for (let port = preferred + 1; port <= this.config.portRange.max; port++) {
        if (await this.isPortAvailable(port)) {
          return { port, reassigned: true };
        }
      }

      // Wrap around and check from min to preferred
      for (let port = this.config.portRange.min; port < preferred; port++) {
        if (await this.isPortAvailable(port)) {
          return { port, reassigned: true };
        }
      }

      throw new ServherdError(
        ServherdErrorCode.NO_PORTS_AVAILABLE,
        `No available ports in range ${this.config.portRange.min}-${this.config.portRange.max}`
      );
    }

    async assignPort(
      cwd: string,
      command: string,
      explicitPort?: number
    ): Promise<{ port: number; reassigned: boolean }> {
      if (explicitPort !== undefined) {
        this.validatePortInRange(explicitPort);
        return this.getAvailablePort(explicitPort);
      }

      const preferred = this.generatePort(cwd, command);
      return this.getAvailablePort(preferred);
    }

    private validatePortInRange(port: number): void {
      if (port < this.config.portRange.min || port > this.config.portRange.max) {
        throw new ServherdError(
          ServherdErrorCode.PORT_OUT_OF_RANGE,
          `Port ${port} is outside configured range ${this.config.portRange.min}-${this.config.portRange.max}`
        );
      }
    }
  }
  ```

- `src/cli/commands/start.ts`: Integrate port availability check
  ```typescript
  // In executeStart function
  const { port, reassigned } = await portService.assignPort(
    cwd,
    command,
    options.port
  );

  if (reassigned) {
    console.warn(
      `⚠ Port ${options.port ?? portService.generatePort(cwd, command)} unavailable, reassigning to ${port}`
    );
  }
  ```

- `src/types/errors.ts`: Add `NO_PORTS_AVAILABLE` error code (if not present)

**Dependencies**:
- External: `detect-port` (npm install detect-port @types/detect-port)
- Internal: Phase 1 (for `--port` option)

**Verification**:
1. Run: `npm test -- test/unit/services/port.service.test.ts`
2. Start a process on port 9055: `node -e "require('net').createServer().listen(9055)"`
3. Run: `servherd start --port 9055 -- npm start` → Warning about reassignment, starts on different port
4. Run: `servherd info <name>` → Shows reassigned port

---

### Phase 3: Log Command Enhancements

**Objective**: Add `--follow`, `--since`, `--head`, and `--flush` options to the logs command.

**Tests to Write First**:

- `test/unit/utils/log-follower.test.ts`: Log following utility tests
  ```typescript
  describe("LogFollower", () => {
    it("should emit new lines when file changes", async () => {
      const tmpFile = await createTempLogFile();
      const lines: string[] = [];
      const controller = new AbortController();

      const follower = followLog(tmpFile, controller.signal, (line) => {
        lines.push(line);
      });

      await appendFile(tmpFile, "line 1\n");
      await sleep(100);
      await appendFile(tmpFile, "line 2\n");
      await sleep(100);

      controller.abort();
      await follower;

      expect(lines).toContain("line 1");
      expect(lines).toContain("line 2");
    });

    it("should stop following on abort signal", async () => {
      const tmpFile = await createTempLogFile();
      const controller = new AbortController();

      const followerPromise = followLog(tmpFile, controller.signal, () => {});
      controller.abort();

      await expect(followerPromise).resolves.not.toThrow();
    });
  });
  ```

- `test/unit/utils/time-parser.test.ts`: Time parsing utility tests
  ```typescript
  describe("parseTimeFilter", () => {
    it("should parse duration strings", () => {
      expect(parseTimeFilter("1h")).toBeInstanceOf(Date);
      expect(parseTimeFilter("30m")).toBeInstanceOf(Date);
      expect(parseTimeFilter("2d")).toBeInstanceOf(Date);
    });

    it("should parse ISO date strings", () => {
      const date = parseTimeFilter("2024-01-15");
      expect(date.toISOString()).toContain("2024-01-15");
    });

    it("should parse ISO datetime strings", () => {
      const date = parseTimeFilter("2024-01-15T10:30:00");
      expect(date.getHours()).toBe(10);
    });

    it("should throw on invalid format", () => {
      expect(() => parseTimeFilter("invalid")).toThrow();
    });
  });
  ```

- `test/unit/cli/commands/logs.test.ts`: Logs command tests
  ```typescript
  describe("--since option", () => {
    it("should filter logs by relative time", async () => {
      const result = await executeLogs("test-server", { since: "1h" });
      // All logs should be within last hour
    });

    it("should filter logs by absolute date", async () => {
      const result = await executeLogs("test-server", {
        since: "2024-01-15",
      });
    });
  });

  describe("--head option", () => {
    it("should return first N lines", async () => {
      const result = await executeLogs("test-server", { head: 10 });
      expect(result.lines.length).toBeLessThanOrEqual(10);
    });
  });

  describe("--flush option", () => {
    it("should clear logs for specified server", async () => {
      await executeLogs("test-server", { flush: true });
      expect(mockPM2.flush).toHaveBeenCalledWith("servherd-test-server");
    });

    it("should clear all logs with --all flag", async () => {
      await executeLogs(undefined, { flush: true, all: true });
      expect(mockPM2.flush).toHaveBeenCalledWith("all");
    });
  });
  ```

**Implementation**:

- `src/utils/log-follower.ts`: Log following utility
  ```typescript
  import { watch, createReadStream, stat } from "fs";
  import { createInterface } from "readline";

  export async function followLog(
    logPath: string,
    signal: AbortSignal,
    onLine: (line: string) => void
  ): Promise<void> {
    let position = (await stat(logPath)).size;

    const readNewLines = async () => {
      const stream = createReadStream(logPath, { start: position });
      const rl = createInterface({ input: stream });

      for await (const line of rl) {
        if (signal.aborted) break;
        onLine(line);
      }

      position = (await stat(logPath)).size;
    };

    return new Promise((resolve) => {
      const watcher = watch(logPath, async (eventType) => {
        if (signal.aborted) {
          watcher.close();
          resolve();
          return;
        }
        if (eventType === "change") {
          await readNewLines();
        }
      });

      signal.addEventListener("abort", () => {
        watcher.close();
        resolve();
      });
    });
  }
  ```

- `src/utils/time-parser.ts`: Time parsing utility
  ```typescript
  export function parseTimeFilter(input: string): Date {
    // Try duration format (1h, 30m, 2d)
    const durationMatch = input.match(/^(\d+)([smhdw])$/);
    if (durationMatch) {
      const value = parseInt(durationMatch[1]);
      const unit = durationMatch[2];
      const now = new Date();

      const multipliers: Record<string, number> = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000,
      };

      return new Date(now.getTime() - value * multipliers[unit]);
    }

    // Try ISO date/datetime
    const date = new Date(input);
    if (!isNaN(date.getTime())) {
      return date;
    }

    throw new ServherdError(
      ServherdErrorCode.INVALID_ARGUMENT,
      `Invalid time format: ${input}. Use duration (1h, 30m) or ISO date (2024-01-15)`
    );
  }

  export function filterLogsByTime(
    lines: string[],
    since: Date,
    parseTimestamp: (line: string) => Date | null
  ): string[] {
    return lines.filter((line) => {
      const timestamp = parseTimestamp(line);
      return timestamp === null || timestamp >= since;
    });
  }
  ```

- `src/services/process.service.ts`: Add flush method
  ```typescript
  async flush(name?: string): Promise<void> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const pm2Name = name ? this.getPm2Name(name) : "all";
      pm2.flush(pm2Name, (err) => {
        if (err) reject(wrapPM2Error(err));
        else resolve();
      });
    });
  }
  ```

- `src/cli/commands/logs.ts`: Add all new options
  ```typescript
  logsCommand
    .option("-f, --follow", "Follow log output")
    .option("--since <time>", "Show logs since time (1h, 30m, 2024-01-15)")
    .option("--head <n>", "Show first N lines", parseInt)
    .option("--flush", "Clear logs instead of displaying")
    .option("-a, --all", "Apply to all servers (with --flush)");
  ```

- `src/mcp/tools/logs.ts`: Update MCP tool to support flush

**Dependencies**:
- External: `chokidar` (optional, for cross-platform file watching) - can use native fs.watch initially
- Internal: Phase 1 (for `--json` integration)

**Verification**:
1. Run: `npm test -- test/unit/utils/log-follower.test.ts test/unit/utils/time-parser.test.ts`
2. Run: `servherd logs <name> --follow` → Streams logs, Ctrl+C to stop
3. Run: `servherd logs <name> --since 1h` → Only logs from last hour
4. Run: `servherd logs <name> --head 20` → First 20 lines
5. Run: `servherd logs <name> --flush` → Logs cleared
6. Run: `servherd logs --flush --all` → All logs cleared

---

### Phase 4: HTTPS Configuration Support

**Objective**: Add HTTPS certificate configuration and template variables for SSL/TLS support.

**Tests to Write First**:

- `test/unit/services/config.service.test.ts`: HTTPS config tests
  ```typescript
  describe("HTTPS configuration", () => {
    it("should save httpsCert and httpsKey paths", async () => {
      await configService.set("httpsCert", "/path/to/cert.pem");
      await configService.set("httpsKey", "/path/to/key.pem");

      const config = await configService.load();
      expect(config.httpsCert).toBe("/path/to/cert.pem");
      expect(config.httpsKey).toBe("/path/to/key.pem");
    });

    it("should validate certificate file exists", async () => {
      await expect(
        configService.set("httpsCert", "/nonexistent/cert.pem")
      ).rejects.toThrow(ServherdError);
    });

    it("should validate key file exists", async () => {
      await expect(
        configService.set("httpsKey", "/nonexistent/key.pem")
      ).rejects.toThrow(ServherdError);
    });
  });
  ```

- `test/unit/utils/template.test.ts`: Template variable tests
  ```typescript
  describe("HTTPS template variables", () => {
    it("should render {{https-cert}} variable", () => {
      const result = renderTemplate("--cert {{https-cert}}", {
        port: 8080,
        hostname: "localhost",
        url: "https://localhost:8080",
        "https-cert": "/path/to/cert.pem",
        "https-key": "/path/to/key.pem",
      });
      expect(result).toBe("--cert /path/to/cert.pem");
    });

    it("should render {{https-key}} variable", () => {
      const result = renderTemplate("--key {{https-key}}", {
        port: 8080,
        hostname: "localhost",
        url: "https://localhost:8080",
        "https-cert": "/path/to/cert.pem",
        "https-key": "/path/to/key.pem",
      });
      expect(result).toBe("--key /path/to/key.pem");
    });

    it("should use https:// in URL when protocol is https", () => {
      const result = renderTemplate("Server at {{url}}", {
        port: 8080,
        hostname: "localhost",
        url: "https://localhost:8080",
        "https-cert": "",
        "https-key": "",
      });
      expect(result).toContain("https://");
    });
  });
  ```

- `test/unit/cli/commands/start.test.ts`: Protocol override tests
  ```typescript
  describe("--protocol option", () => {
    it("should override default protocol", async () => {
      const result = await executeStart({
        command: "npm start",
        protocol: "https",
      });
      expect(result.server.protocol).toBe("https");
      expect(result.server.url).toContain("https://");
    });
  });
  ```

**Implementation**:

- `src/types/config.ts`: Add HTTPS fields to schema
  ```typescript
  export const GlobalConfigSchema = z.object({
    version: z.string(),
    hostname: z.string(),
    protocol: z.enum(["http", "https"]),
    portRange: PortRangeSchema,
    tempDir: z.string(),
    pm2: PM2ConfigSchema,
    // New HTTPS fields
    httpsCert: z.string().optional(),
    httpsKey: z.string().optional(),
  });

  export const DEFAULT_CONFIG: GlobalConfig = {
    // ... existing defaults
    httpsCert: undefined,
    httpsKey: undefined,
  };
  ```

- `src/services/config.service.ts`: Add validation for cert/key files
  ```typescript
  async set<K extends keyof GlobalConfig>(
    key: K,
    value: GlobalConfig[K]
  ): Promise<void> {
    // Validate cert/key file existence
    if ((key === "httpsCert" || key === "httpsKey") && value) {
      const filePath = value as string;
      if (!existsSync(filePath)) {
        throw new ServherdError(
          ServherdErrorCode.CONFIG_VALIDATION_FAILED,
          `File not found: ${filePath}`
        );
      }
    }

    // ... existing set logic
  }
  ```

- `src/utils/template.ts`: Add HTTPS template variables
  ```typescript
  export interface TemplateVariables {
    port: number;
    hostname: string;
    url: string;
    "https-cert": string;
    "https-key": string;
  }

  export function getTemplateVariables(
    config: GlobalConfig,
    port: number
  ): TemplateVariables {
    return {
      port,
      hostname: config.hostname,
      url: `${config.protocol}://${config.hostname}:${port}`,
      "https-cert": config.httpsCert ?? "",
      "https-key": config.httpsKey ?? "",
    };
  }
  ```

- `src/cli/commands/start.ts`: Add `--protocol` option
  ```typescript
  startCommand.option(
    "--protocol <protocol>",
    "Override protocol (http/https)"
  );
  ```

- `src/cli/commands/config.ts`: Support httpsCert and httpsKey in config set

**Dependencies**:
- External: None
- Internal: Phase 1 (for `--json` support)

**Verification**:
1. Run: `npm test -- test/unit/services/config.service.test.ts`
2. Run: `servherd config set protocol https`
3. Run: `servherd config set httpsCert /path/to/cert.pem` (with valid file) → Success
4. Run: `servherd config set httpsCert /invalid/path` → Error: File not found
5. Run: `servherd start --protocol https -- node server.js --cert {{https-cert}}` → Uses https URL

---

### Phase 5: CI Mode and Interactive Config Wizard

**Objective**: Implement CI mode behavioral differences and interactive configuration wizard.

**Tests to Write First**:

- `test/unit/utils/ci-detector.test.ts`: CI detection tests
  ```typescript
  describe("CI detection", () => {
    it("should detect CI from CI env var", () => {
      process.env.CI = "true";
      expect(isCI()).toBe(true);
      delete process.env.CI;
    });

    it("should detect CI from common CI env vars", () => {
      process.env.GITHUB_ACTIONS = "true";
      expect(isCI()).toBe(true);
      delete process.env.GITHUB_ACTIONS;
    });

    it("should respect --ci flag", () => {
      expect(isCI({ ci: true })).toBe(true);
    });

    it("should respect --no-ci flag", () => {
      process.env.CI = "true";
      expect(isCI({ noCi: true })).toBe(false);
      delete process.env.CI;
    });
  });
  ```

- `test/unit/services/port.service.test.ts`: CI mode port allocation tests
  ```typescript
  describe("CI mode port allocation", () => {
    it("should use sequential ports in CI mode", async () => {
      const port1 = await portService.assignPort("dir1", "cmd1", undefined, true);
      const port2 = await portService.assignPort("dir2", "cmd2", undefined, true);

      expect(port2.port).toBe(port1.port + 1);
    });

    it("should use deterministic ports in non-CI mode", async () => {
      const port1 = await portService.assignPort("dir1", "cmd1", undefined, false);
      const port2 = await portService.assignPort("dir1", "cmd1", undefined, false);

      expect(port2.port).toBe(port1.port); // Same input = same port
    });
  });
  ```

- `test/e2e/ci-mode.test.ts`: E2E CI mode tests
  ```typescript
  describe("CI mode E2E", () => {
    it("should not prompt in CI mode", async () => {
      process.env.CI = "true";
      const result = await runCLI(["config"]);
      expect(result.stderr).toContain("Interactive config not available in CI");
      delete process.env.CI;
    });
  });
  ```

- `test/unit/cli/commands/config.test.ts`: Interactive wizard tests (mocked)
  ```typescript
  describe("interactive config wizard", () => {
    it("should prompt for hostname", async () => {
      const inputMock = vi.fn().mockResolvedValue("custom-host");
      vi.mock("@inquirer/prompts", () => ({ input: inputMock }));

      await runConfigWizard();

      expect(inputMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("hostname") })
      );
    });

    it("should skip interactive in CI mode", async () => {
      process.env.CI = "true";
      await expect(runConfigWizard()).rejects.toThrow();
      delete process.env.CI;
    });
  });
  ```

**Implementation**:

- `src/utils/ci-detector.ts`: Enhanced CI detection
  ```typescript
  export interface CIModeOptions {
    ci?: boolean;
    noCi?: boolean;
  }

  const CI_ENV_VARS = [
    "CI",
    "GITHUB_ACTIONS",
    "GITLAB_CI",
    "CIRCLECI",
    "TRAVIS",
    "JENKINS_URL",
    "BUILDKITE",
    "DRONE",
  ];

  export function isCI(options?: CIModeOptions): boolean {
    // Explicit flags take precedence
    if (options?.noCi) return false;
    if (options?.ci) return true;

    // Check environment variables
    return CI_ENV_VARS.some((v) => process.env[v] !== undefined);
  }

  export function shouldDisableColors(): boolean {
    return isCI() || process.env.NO_COLOR !== undefined;
  }
  ```

- `src/services/port.service.ts`: CI mode port allocation
  ```typescript
  async assignPort(
    cwd: string,
    command: string,
    explicitPort?: number,
    ciMode: boolean = isCI()
  ): Promise<{ port: number; reassigned: boolean }> {
    if (explicitPort !== undefined) {
      this.validatePortInRange(explicitPort);
      return this.getAvailablePort(explicitPort);
    }

    if (ciMode) {
      return this.getNextAvailableSequential();
    }

    const preferred = this.generatePort(cwd, command);
    return this.getAvailablePort(preferred);
  }

  private async getNextAvailableSequential(): Promise<{ port: number; reassigned: boolean }> {
    const usedPorts = new Set(
      this.registry.servers.map((s) => s.port)
    );

    for (let port = this.config.portRange.min; port <= this.config.portRange.max; port++) {
      if (!usedPorts.has(port) && (await this.isPortAvailable(port))) {
        return { port, reassigned: false };
      }
    }

    throw new ServherdError(
      ServherdErrorCode.NO_PORTS_AVAILABLE,
      "No ports available in range"
    );
  }
  ```

- `src/cli/commands/config.ts`: Interactive wizard
  ```typescript
  import { input, select } from "@inquirer/prompts";

  async function runConfigWizard(): Promise<void> {
    if (isCI()) {
      throw new ServherdError(
        ServherdErrorCode.INTERACTIVE_NOT_AVAILABLE,
        'Interactive config not available in CI mode. Use "servherd config set <key> <value>"'
      );
    }

    const hostname = await input({
      message: "Default hostname:",
      default: configService.get("hostname"),
    });

    const protocol = await select({
      message: "Default protocol:",
      choices: [
        { name: "HTTP", value: "http" },
        { name: "HTTPS", value: "https" },
      ],
      default: configService.get("protocol"),
    });

    let httpsCert: string | undefined;
    let httpsKey: string | undefined;

    if (protocol === "https") {
      httpsCert = await input({
        message: "Path to HTTPS certificate:",
        validate: (path) => existsSync(path) || "File not found",
      });
      httpsKey = await input({
        message: "Path to HTTPS key:",
        validate: (path) => existsSync(path) || "File not found",
      });
    }

    const portMin = await input({
      message: "Minimum port:",
      default: String(configService.get("portRange").min),
      validate: (v) => !isNaN(parseInt(v)) || "Must be a number",
    });

    const portMax = await input({
      message: "Maximum port:",
      default: String(configService.get("portRange").max),
      validate: (v) => !isNaN(parseInt(v)) || "Must be a number",
    });

    await configService.save({
      ...configService.getAll(),
      hostname,
      protocol: protocol as "http" | "https",
      httpsCert,
      httpsKey,
      portRange: { min: parseInt(portMin), max: parseInt(portMax) },
    });

    console.log("✓ Configuration saved");
  }
  ```

- `src/cli/index.ts`: Add `--ci` and `--no-ci` global flags
  ```typescript
  program
    .option("--ci", "Force CI mode behavior")
    .option("--no-ci", "Force interactive mode behavior");
  ```

**Dependencies**:
- External: `@inquirer/prompts` (npm install @inquirer/prompts)
- Internal: Phase 4 (for HTTPS config fields)

**Verification**:
1. Run: `npm test -- test/unit/utils/ci-detector.test.ts`
2. Run: `servherd config` (not in CI) → Interactive wizard launches
3. Run: `CI=true servherd config` → Error message about CI mode
4. Run: `servherd config --ci` → Error message about CI mode
5. Run: `CI=true servherd start --no-ci -- npm start` → Normal behavior

---

### Phase 6: Developer Tooling (Husky, Commitlint, Knip)

**Objective**: Add development workflow tooling for consistent commits and dead code detection.

**Tests to Write First**:

- `test/tooling/commitlint.test.ts`: Commitlint rule tests
  ```typescript
  import { lint } from "@commitlint/lint";
  import config from "../../commitlint.config.js";

  describe("commitlint rules", () => {
    it("should accept valid conventional commit", async () => {
      const result = await lint("feat(cli): add json output flag", config.rules);
      expect(result.valid).toBe(true);
    });

    it("should reject missing type", async () => {
      const result = await lint("add json output flag", config.rules);
      expect(result.valid).toBe(false);
    });

    it("should reject invalid scope", async () => {
      const result = await lint("feat(invalid): add feature", config.rules);
      expect(result.valid).toBe(false);
    });

    it("should accept all defined scopes", async () => {
      const scopes = ["cli", "mcp", "services", "types", "utils", "test", "ci", "docs", "deps"];
      for (const scope of scopes) {
        const result = await lint(`feat(${scope}): test`, config.rules);
        expect(result.valid).toBe(true);
      }
    });
  });
  ```

**Implementation**:

- Install dependencies:
  ```bash
  npm install -D husky @commitlint/cli @commitlint/config-conventional \
    commitizen cz-conventional-changelog conventional-changelog-conventionalcommits knip
  ```

- `commitlint.config.js`: Commitlint configuration
  ```javascript
  export default {
    parserPreset: "conventional-changelog-conventionalcommits",
    rules: {
      "body-leading-blank": [1, "always"],
      "body-max-line-length": [2, "always", 100],
      "footer-leading-blank": [1, "always"],
      "footer-max-line-length": [2, "always", 100],
      "header-max-length": [2, "always", 100],
      "scope-case": [2, "always", "lower-case"],
      "scope-enum": [
        2,
        "always",
        ["cli", "mcp", "services", "types", "utils", "test", "ci", "docs", "deps"],
      ],
      "subject-case": [
        2,
        "never",
        ["sentence-case", "start-case", "pascal-case", "upper-case"],
      ],
      "subject-empty": [2, "never"],
      "subject-full-stop": [2, "never", "."],
      "type-case": [2, "always", "lower-case"],
      "type-empty": [2, "never"],
      "type-enum": [
        2,
        "always",
        [
          "build",
          "chore",
          "ci",
          "docs",
          "feat",
          "fix",
          "perf",
          "refactor",
          "revert",
          "style",
          "test",
        ],
      ],
    },
  };
  ```

- `.husky/commit-msg`:
  ```bash
  npx --no-install commitlint --edit "$1"
  ```

- `.husky/prepare-commit-msg`:
  ```bash
  exec < /dev/tty && npx cz --hook || true
  ```

- `.husky/pre-push`:
  ```bash
  npm run lint
  npm test
  ```

- `knip.json`: Knip configuration
  ```json
  {
    "$schema": "https://unpkg.com/knip@latest/schema.json",
    "entry": ["src/index.ts", "src/cli/index.ts", "src/mcp/index.ts"],
    "project": ["src/**/*.ts"],
    "ignore": ["**/*.test.ts", "test/**"],
    "ignoreDependencies": ["@types/*"]
  }
  ```

- `package.json`: Add scripts
  ```json
  {
    "scripts": {
      "prepare": "husky",
      "knip": "knip",
      "commit": "cz"
    },
    "config": {
      "commitizen": {
        "path": "cz-conventional-changelog"
      }
    }
  }
  ```

**Dependencies**:
- External:
  - `husky` - Git hooks
  - `@commitlint/cli` - Commit linting
  - `@commitlint/config-conventional` - Conventional commits preset
  - `commitizen` - Interactive commit wizard
  - `cz-conventional-changelog` - Commitizen adapter
  - `conventional-changelog-conventionalcommits` - Parser preset
  - `knip` - Dead code detection
- Internal: None (independent of other phases)

**Verification**:
1. Run: `npm run prepare` → Husky hooks installed
2. Run: `npm run knip` → No dead code reported (or only expected items)
3. Create test commit: `git commit -m "invalid"` → Rejected by commitlint
4. Create test commit: `git commit -m "feat(cli): add feature"` → Accepted
5. Run: `npm run commit` → Commitizen wizard launches

---

## Common Utilities Needed

| Utility | Location | Purpose | Used In |
|---------|----------|---------|---------|
| `formatAsJson()` | `src/cli/output/json-formatter.ts` | JSON output formatting | All CLI commands |
| `parseTimeFilter()` | `src/utils/time-parser.ts` | Parse duration/date strings | Logs command |
| `followLog()` | `src/utils/log-follower.ts` | Tail log files | Logs command |
| `isCI()` | `src/utils/ci-detector.ts` | CI environment detection | Config, Start, Port |
| `shouldDisableColors()` | `src/utils/ci-detector.ts` | Color output decision | Formatters |

---

## External Libraries Assessment

| Task | Library | Rationale | Phase |
|------|---------|-----------|-------|
| Port availability | `detect-port` | Battle-tested, handles edge cases, fast | Phase 2 |
| Interactive prompts | `@inquirer/prompts` | Modern, tree-shakeable, TypeScript-native | Phase 5 |
| Git hooks | `husky` | De facto standard, well-maintained | Phase 6 |
| Commit linting | `@commitlint/cli` | Enforces consistent commit messages | Phase 6 |
| Dead code detection | `knip` | Modern, fast, great TypeScript support | Phase 6 |

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Port checking race condition | Port taken between check and bind | Accept minor race; PM2 handles bind failure, retry with next port |
| Log following memory leak | Resource exhaustion on long runs | Use streams, clean up watchers on abort, test with long-running follows |
| Interactive prompts break CI | CI builds fail | Robust CI detection, skip prompts, provide helpful error messages |
| Husky hooks frustrate developers | Contributors abandon PRs | Document `--no-verify` escape hatch in CONTRIBUTING.md |
| `detect-port` network calls | Slow/flaky in offline mode | Library works locally; test offline behavior |
| Inquirer stdin issues | CI environment has no TTY | Check `process.stdin.isTTY` before prompting |

---

## Testing Strategy Summary

| Phase | Unit Tests | Integration Tests | E2E Tests |
|-------|-----------|-------------------|-----------|
| 1 | JSON output, option parsing | - | JSON CLI output |
| 2 | Port availability, range validation | Port conflict resolution | - |
| 3 | Time parser, log follower | Log filtering | Follow mode |
| 4 | Config validation, template rendering | - | HTTPS workflow |
| 5 | CI detection, sequential ports | - | CI mode behavior |
| 6 | Commitlint rules | - | Hook execution |

---

## Implementation Order Recommendation

The phases are designed to be implemented in order (1→6), but some parallelization is possible:

```
Phase 1 (JSON + Simple Flags)
    ↓
Phase 2 (Port Availability) ←── Can start after Phase 1 --port is done
    ↓
Phase 3 (Log Enhancements) ←── Can run parallel to Phase 2
    ↓
Phase 4 (HTTPS Support) ←── Can run parallel to Phase 3
    ↓
Phase 5 (CI Mode + Wizard) ←── Depends on Phase 4 for HTTPS prompts
    ↓
Phase 6 (Tooling) ←── Independent, can be done anytime
```

**Suggested parallel tracks**:
- Track A: Phase 1 → Phase 2 → Phase 5
- Track B: Phase 3 → Phase 4
- Track C: Phase 6 (independent)

---

## Success Metrics

Each phase is complete when:

1. All tests pass (`npm test`)
2. Lint passes (`npm run lint`)
3. Build succeeds (`npm run build`)
4. Manual verification steps documented above succeed
5. No regressions in existing functionality
6. MCP tools updated (where applicable)

---

## Appendix: File Change Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 1 | `src/cli/output/json-formatter.ts`, `src/types/cli.ts` | `src/cli/index.ts`, `src/cli/commands/*.ts` (6 files), `src/mcp/tools/*.ts` (6 files) |
| 2 | - | `src/services/port.service.ts`, `src/cli/commands/start.ts`, `src/types/errors.ts` |
| 3 | `src/utils/log-follower.ts`, `src/utils/time-parser.ts` | `src/cli/commands/logs.ts`, `src/services/process.service.ts`, `src/mcp/tools/logs.ts` |
| 4 | - | `src/types/config.ts`, `src/services/config.service.ts`, `src/utils/template.ts`, `src/cli/commands/start.ts`, `src/cli/commands/config.ts` |
| 5 | - | `src/utils/ci-detector.ts`, `src/services/port.service.ts`, `src/cli/commands/config.ts`, `src/cli/index.ts` |
| 6 | `commitlint.config.js`, `knip.json`, `.husky/commit-msg`, `.husky/prepare-commit-msg`, `.husky/pre-push` | `package.json` |

**Total**: ~8 new files, ~25 modified files across all phases
