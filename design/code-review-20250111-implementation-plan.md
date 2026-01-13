# Implementation Plan for Servherd Code Review Fixes

## Overview

This plan addresses the issues identified in the code review dated January 11, 2026. The implementation is organized into 5 phases, prioritizing critical data integrity issues first, then feature parity, error handling consistency, and finally polish items. Each phase delivers testable, user-verifiable functionality.

## Phase Breakdown

---

### Phase 1: Critical Data Integrity Fixes
**Objective**: Fix file corruption and race condition issues that could cause data loss
**Duration**: 2-3 days

**Tests to Write First**:

- `test/unit/services/registry.service.locking.test.ts`: Registry file locking tests
  ```typescript
  describe("RegistryService file locking", () => {
    it("should acquire lock before writing", async () => {
      const registry = new RegistryService();
      await registry.load();
      await registry.save();
      expect(lockfile.lock).toHaveBeenCalledWith(
        expect.stringContaining("registry.json"),
        expect.objectContaining({ retries: 3 })
      );
    });

    it("should release lock after writing", async () => {
      const registry = new RegistryService();
      await registry.load();
      await registry.save();
      expect(mockRelease).toHaveBeenCalled();
    });

    it("should release lock even if write fails", async () => {
      vi.mocked(writeJson).mockRejectedValueOnce(new Error("Write failed"));
      const registry = new RegistryService();
      await registry.load();
      await expect(registry.save()).rejects.toThrow("Write failed");
      expect(mockRelease).toHaveBeenCalled();
    });

    it("should handle stale locks gracefully", async () => {
      // Simulate stale lock scenario
    });
  });
  ```

- `test/unit/services/port.service.ci-persistence.test.ts`: CI port persistence tests
  ```typescript
  describe("PortService CI port persistence", () => {
    it("should persist CI used ports to file", async () => {
      const portService = new PortService({ ciMode: true });
      await portService.assignPort(/* ... */);
      expect(writeJSON).toHaveBeenCalledWith(
        expect.stringContaining("ci-ports.json"),
        expect.objectContaining({ ports: expect.any(Array) })
      );
    });

    it("should load CI ports from file on init", async () => {
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readJSON).mockResolvedValue({ ports: [3000, 3001], timestamp: Date.now() });
      const portService = new PortService({ ciMode: true });
      await portService.init();
      expect(portService.getCiUsedPorts()).toContain(3000);
    });

    it("should clean up stale CI port entries", async () => {
      // Entries older than 1 hour should be removed
    });
  });
  ```

**Implementation**:

- `src/services/registry.service.ts`: Add file locking
  ```typescript
  import lockfile from "proper-lockfile";

  async save(): Promise<void> {
    if (!this.registry) {
      throw new ServherdError(ServherdErrorCode.REGISTRY_CORRUPT, "Registry not loaded");
    }
    await ensureDir(path.dirname(this.registryPath));

    // Create file if it doesn't exist (lockfile requires existing file)
    if (!await pathExists(this.registryPath)) {
      await writeJson(this.registryPath, { version: "1.0.0", servers: [] }, { spaces: 2 });
    }

    const release = await lockfile.lock(this.registryPath, {
      retries: { retries: 3, minTimeout: 100, maxTimeout: 1000 },
      stale: 10000, // 10 seconds
    });
    try {
      await writeJson(this.registryPath, this.registry, { spaces: 2 });
    } finally {
      await release();
    }
  }
  ```

- `src/services/port.service.ts`: Add CI port file persistence
  ```typescript
  private async loadCiUsedPorts(): Promise<Set<number>> {
    const ciPortsFile = path.join(this.tempDir, "ci-ports.json");
    if (await pathExists(ciPortsFile)) {
      const data = await readJSON(ciPortsFile);
      // Clean up stale entries (older than 1 hour)
      if (Date.now() - data.timestamp < 3600000) {
        return new Set(data.ports);
      }
    }
    return new Set();
  }

  private async saveCiUsedPorts(): Promise<void> {
    const ciPortsFile = path.join(this.tempDir, "ci-ports.json");
    await writeJSON(ciPortsFile, {
      ports: Array.from(this.ciUsedPorts),
      timestamp: Date.now(),
    });
  }
  ```

**Dependencies**:
- External: `proper-lockfile` (npm install)
- Internal: None (this is foundational)

**Verification**:
1. Run: `npm test -- --grep "file locking"`
2. Run: `npm test -- --grep "CI port persistence"`
3. Manual test: Open two terminals, run `servherd start "npm run dev"` simultaneously
4. Expected: No registry corruption, no duplicate port assignments

---

### Phase 2: MCP-CLI Feature Parity
**Objective**: Add missing MCP tool options to match CLI functionality
**Duration**: 2 days

**Tests to Write First**:

- `test/unit/mcp/tools/stop.test.ts`: Add force option tests
  ```typescript
  describe("servherd_stop tool with force option", () => {
    it("should pass force flag to stop command", async () => {
      const result = await handleStopTool({ name: "test-server", force: true });
      expect(mockProcessService.stop).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ force: true })
      );
    });

    it("should use SIGKILL when force is true", async () => {
      // Verify signal type
    });
  });
  ```

- `test/unit/mcp/tools/list.test.ts`: Add stopped filter tests
  ```typescript
  describe("servherd_list tool with stopped filter", () => {
    it("should filter to only stopped servers when stopped=true", async () => {
      mockRegistryService.listServers.mockResolvedValue([
        createMockServer({ status: "stopped" }),
        createMockServer({ status: "online" }),
      ]);
      const result = await handleListTool({ stopped: true });
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0].status).toBe("stopped");
    });
  });
  ```

- `test/unit/mcp/tools/start.test.ts`: Add port/protocol override tests
  ```typescript
  describe("servherd_start tool with port/protocol", () => {
    it("should use explicit port when provided", async () => {
      const result = await handleStartTool({ command: "npm start", port: 8080 });
      expect(result.port).toBe(8080);
    });

    it("should use explicit protocol when provided", async () => {
      const result = await handleStartTool({ command: "npm start", protocol: "https" });
      expect(result.url).toMatch(/^https:/);
    });
  });
  ```

- `test/unit/mcp/tools/config.test.ts`: Add refresh options tests
  ```typescript
  describe("servherd_config tool refresh options", () => {
    it("should refresh specific server config", async () => {
      const result = await handleConfigTool({ refresh: "my-server" });
      expect(result.refreshResults).toBeDefined();
    });

    it("should support dry run mode", async () => {
      const result = await handleConfigTool({ refreshAll: true, dryRun: true });
      expect(result.dryRun).toBe(true);
      // Verify no actual changes were made
    });
  });
  ```

**Implementation**:

- `src/mcp/tools/stop.ts`: Add force option
  ```typescript
  export const stopToolSchema = z.object({
    name: z.string().optional().describe("Server name to stop"),
    all: z.boolean().optional().describe("Stop all servers"),
    tag: z.string().optional().describe("Stop servers with this tag"),
    force: z.boolean().optional().describe("Force stop using SIGKILL"),
  });
  ```

- `src/mcp/tools/list.ts`: Add stopped filter
  ```typescript
  export const listToolSchema = z.object({
    running: z.boolean().optional().describe("Only show running servers"),
    stopped: z.boolean().optional().describe("Only show stopped servers"),
    tag: z.string().optional().describe("Filter by tag"),
    cwd: z.string().optional().describe("Filter by working directory"),
    cmd: z.string().optional().describe("Filter by command pattern"),
  });
  ```

- `src/mcp/tools/start.ts`: Add port/protocol options
  ```typescript
  export const startToolSchema = z.object({
    command: z.string().describe("Command to start the server"),
    cwd: z.string().optional(),
    name: z.string().optional(),
    port: z.number().optional().describe("Explicit port number"),
    protocol: z.enum(["http", "https"]).optional().describe("Protocol to use"),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
    env: z.record(z.string()).optional(),
  });
  ```

- `src/mcp/tools/config.ts`: Add refresh options
  ```typescript
  export const configToolSchema = z.object({
    show: z.boolean().optional(),
    get: z.string().optional(),
    set: z.string().optional(),
    value: z.string().optional(),
    reset: z.boolean().optional(),
    refresh: z.string().optional().describe("Refresh a specific server's config"),
    refreshAll: z.boolean().optional().describe("Refresh all servers with config drift"),
    tag: z.string().optional().describe("Filter servers by tag for refresh"),
    dryRun: z.boolean().optional().describe("Preview refresh without executing"),
  });
  ```

- `src/mcp/tools/remove.ts`: Add force option
  ```typescript
  export const removeToolSchema = z.object({
    name: z.string().optional(),
    all: z.boolean().optional(),
    tag: z.string().optional(),
    force: z.boolean().optional().describe("Skip confirmation"),
  });
  ```

**Dependencies**:
- External: None
- Internal: Phase 1 (registry locking ensures safe concurrent operations)

**Verification**:
1. Run: `npm test -- test/unit/mcp/tools`
2. MCP test: Connect via Claude Desktop, test `servherd_stop` with `{ "name": "test", "force": true }`
3. MCP test: Test `servherd_list` with `{ "stopped": true }`
4. MCP test: Test `servherd_config` with `{ "refresh": "my-server", "dryRun": true }`

---

### Phase 3: Error Handling Consistency & Version Fix
**Objective**: Standardize error classes and fix hardcoded version numbers
**Duration**: 1-2 days

**Tests to Write First**:

- `test/unit/cli/commands/error-consistency.test.ts`: Verify all commands use ServherdError
  ```typescript
  describe("CLI commands error consistency", () => {
    it("info command should throw ServherdError for missing server", async () => {
      mockRegistryService.findByName.mockResolvedValue(undefined);
      await expect(executeInfo({ name: "nonexistent" }))
        .rejects.toBeInstanceOf(ServherdError);
    });

    it("restart command should throw ServherdError for missing server", async () => {
      mockRegistryService.findByName.mockResolvedValue(undefined);
      await expect(executeRestart({ name: "nonexistent" }))
        .rejects.toBeInstanceOf(ServherdError);
    });
  });
  ```

- `test/unit/version.test.ts`: Verify version is read from package.json
  ```typescript
  describe("Version consistency", () => {
    it("CLI should use package.json version", async () => {
      const program = createProgram();
      expect(program.version()).toBe("1.0.0"); // or read from actual package.json
    });

    it("MCP server should use package.json version", async () => {
      const server = createMCPServer();
      // Verify server version matches package.json
    });
  });
  ```

- `test/unit/services/process.service.describe.test.ts`: Selective error handling
  ```typescript
  describe("ProcessService.describe error handling", () => {
    it("should return undefined for 'not found' errors", async () => {
      mockPM2.describe.mockImplementation((name, cb) =>
        cb(new Error("process name not found"), []));
      const result = await processService.describe("missing");
      expect(result).toBeUndefined();
    });

    it("should re-throw connection errors", async () => {
      mockPM2.describe.mockImplementation((name, cb) =>
        cb(new Error("PM2 connection failed"), []));
      await expect(processService.describe("test"))
        .rejects.toThrow("PM2 connection failed");
    });
  });
  ```

**Implementation**:

- `src/cli/commands/info.ts`: Use ServherdError
  ```typescript
  if (!server) {
    throw new ServherdError(
      ServherdErrorCode.SERVER_NOT_FOUND,
      `Server "${options.name}" not found`,
    );
  }
  ```

- `src/cli/commands/restart.ts`: Use ServherdError
  ```typescript
  if (!server) {
    throw new ServherdError(
      ServherdErrorCode.SERVER_NOT_FOUND,
      `Server "${options.name}" not found`,
    );
  }
  ```

- `src/utils/version.ts`: Create version utility
  ```typescript
  import { readFileSync } from "fs";
  import { fileURLToPath } from "url";
  import path from "path";

  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  let cachedVersion: string | null = null;

  export function getVersion(): string {
    if (!cachedVersion) {
      const packagePath = path.join(__dirname, "../../package.json");
      const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
      cachedVersion = pkg.version;
    }
    return cachedVersion;
  }
  ```

- `src/cli/index.ts`: Use version utility
  ```typescript
  import { getVersion } from "../utils/version.js";
  // ...
  program.version(getVersion());
  ```

- `src/mcp/index.ts`: Use version utility
  ```typescript
  import { getVersion } from "../utils/version.js";
  // ...
  const version = options.version || getVersion();
  ```

- `src/services/process.service.ts`: Selective error handling in describe
  ```typescript
  async describe(name: string): Promise<PM2ProcessDescription | undefined> {
    try {
      return await new Promise((resolve, reject) => {
        pm2.describe(name, (err, proc) => {
          if (err) reject(err);
          else resolve(proc[0]);
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not found") || message.includes("process name not found")) {
        return undefined;
      }
      throw error; // Re-throw non-"not found" errors
    }
  }
  ```

**Dependencies**:
- External: None
- Internal: None

**Verification**:
1. Run: `npm test -- --grep "error consistency"`
2. Run: `npm test -- --grep "Version"`
3. Run: `servherd --version` and verify it shows `1.0.0`
4. Start MCP server, verify version in server info

---

### Phase 4: Configuration System Improvements
**Objective**: Wire up config wizard, add protocol to drift detection, validate HTTPS paths
**Duration**: 2 days

**Tests to Write First**:

- `test/unit/cli/commands/config.wizard.test.ts`: Config wizard invocation
  ```typescript
  describe("Config wizard CLI invocation", () => {
    it("should run wizard when no options provided (non-CI)", async () => {
      vi.mocked(CIDetector.isCI).mockReturnValue(false);
      const wizardSpy = vi.spyOn(configModule, "runConfigWizard");
      await configAction({});
      expect(wizardSpy).toHaveBeenCalled();
    });

    it("should show config when no options in CI mode", async () => {
      vi.mocked(CIDetector.isCI).mockReturnValue(true);
      const result = await executeConfig({});
      expect(result.config).toBeDefined();
    });
  });
  ```

- `test/unit/utils/config-drift.test.ts`: Protocol drift detection
  ```typescript
  describe("Config drift detection with protocol", () => {
    it("should detect protocol change as drift", () => {
      const snapshot = { hostname: "localhost", protocol: "http" };
      const current = { hostname: "localhost", protocol: "https" };
      const drift = detectDrift(snapshot, current);
      expect(drift.hasDrift).toBe(true);
      expect(drift.changes).toContain("protocol");
    });
  });
  ```

- `test/unit/cli/commands/config.validation.test.ts`: HTTPS path validation
  ```typescript
  describe("Config HTTPS path validation", () => {
    it("should reject non-existent cert path on set", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await expect(executeConfig({ set: "httpsCert", value: "/nonexistent/cert.pem" }))
        .rejects.toThrow("File not found");
    });

    it("should accept existing cert path on set", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const result = await executeConfig({ set: "httpsCert", value: "/valid/cert.pem" });
      expect(result.updated).toBe(true);
    });
  });
  ```

**Implementation**:

- `src/cli/commands/config.ts`: Wire up wizard and add validation
  ```typescript
  export async function configAction(options: ConfigCommandOptions): Promise<void> {
    const hasOptions = options.show || options.get || options.set ||
                       options.reset || options.refresh || options.refreshAll;

    if (!hasOptions) {
      if (CIDetector.isCI()) {
        // In CI, default to showing config (no interactive wizard)
        options.show = true;
      } else {
        await runConfigWizard();
        return;
      }
    }

    // ... rest of existing logic
  }

  // In the set handler, add file validation:
  if (options.set === "httpsCert" || options.set === "httpsKey") {
    if (options.value && !existsSync(options.value)) {
      throw new ServherdError(
        ServherdErrorCode.CONFIG_INVALID,
        `File not found: ${options.value}`,
      );
    }
  }
  ```

- `src/utils/config-drift.ts`: Add protocol to snapshot
  ```typescript
  export const ConfigSnapshotSchema = z.object({
    hostname: z.string().optional(),
    protocol: z.enum(["http", "https"]).optional(),
    httpsCert: z.string().optional(),
    httpsKey: z.string().optional(),
  });

  export function createConfigSnapshot(config: GlobalConfig): ConfigSnapshot {
    return {
      hostname: config.hostname,
      protocol: config.protocol,
      httpsCert: config.httpsCert,
      httpsKey: config.httpsKey,
    };
  }

  export function detectDrift(snapshot: ConfigSnapshot, current: GlobalConfig): DriftResult {
    const changes: string[] = [];

    if (snapshot.hostname !== current.hostname) {
      changes.push("hostname");
    }
    if (snapshot.protocol !== current.protocol) {
      changes.push("protocol");
    }
    if (snapshot.httpsCert !== current.httpsCert) {
      changes.push("httpsCert");
    }
    if (snapshot.httpsKey !== current.httpsKey) {
      changes.push("httpsKey");
    }

    return {
      hasDrift: changes.length > 0,
      changes,
    };
  }
  ```

- `src/cli/commands/config.ts`: Add `refreshOnChange` to wizard
  ```typescript
  // In runConfigWizard():
  const refreshOnChange = await select({
    message: "When config changes, how should running servers be handled?",
    choices: [
      { name: "On start - Check for drift when servers restart", value: "on-start" },
      { name: "Prompt - Ask before restarting affected servers", value: "prompt" },
      { name: "Auto - Automatically restart affected servers", value: "auto" },
      { name: "Manual - Never auto-restart, use 'servherd config --refresh'", value: "manual" },
    ],
    default: currentConfig.refreshOnChange ?? "on-start",
  });

  // Add to finalConfig:
  const finalConfig = {
    ...currentConfig,
    hostname,
    protocol,
    httpsCert,
    httpsKey,
    portRange,
    refreshOnChange, // Add this
  };
  ```

**Dependencies**:
- External: None
- Internal: Phase 3 (error handling consistency)

**Verification**:
1. Run: `npm test -- --grep "wizard"`
2. Run: `npm test -- --grep "drift"`
3. Run: `npm test -- --grep "HTTPS path"`
4. Manual: Run `servherd config` (no args) - should launch interactive wizard
5. Manual: Set invalid httpsCert path - should error
6. Manual: Start server with protocol=http, change to https, check drift detection

---

### Phase 5: Code Quality & Polish
**Objective**: Extract shared utilities, add CI awareness to prompts, add missing CI platforms
**Duration**: 2 days

**Tests to Write First**:

- `test/unit/utils/format.test.ts`: Shared formatting utilities
  ```typescript
  describe("Shared formatting utilities", () => {
    describe("formatUptime", () => {
      it("should format seconds correctly", () => {
        expect(formatUptime(45000)).toBe("45s");
      });
      it("should format minutes correctly", () => {
        expect(formatUptime(125000)).toBe("2m 5s");
      });
      it("should format hours correctly", () => {
        expect(formatUptime(3665000)).toBe("1h 1m");
      });
      it("should format days correctly", () => {
        expect(formatUptime(90000000)).toBe("1d 1h");
      });
    });

    describe("formatBytes", () => {
      it("should format bytes", () => {
        expect(formatBytes(512)).toBe("512 B");
      });
      it("should format kilobytes", () => {
        expect(formatBytes(1536)).toBe("1.50 KB");
      });
      it("should format megabytes", () => {
        expect(formatBytes(1048576)).toBe("1.00 MB");
      });
    });
  });
  ```

- `test/unit/cli/commands/remove.ci.test.ts`: CI-aware confirmation
  ```typescript
  describe("Remove command CI awareness", () => {
    it("should error in CI mode without --force", async () => {
      vi.mocked(CIDetector.isCI).mockReturnValue(true);
      await expect(removeAction({ all: true }))
        .rejects.toThrow("requires --force flag in CI mode");
    });

    it("should work in CI mode with --force", async () => {
      vi.mocked(CIDetector.isCI).mockReturnValue(true);
      const result = await executeRemove({ all: true, force: true });
      expect(result.removed.length).toBeGreaterThan(0);
    });
  });
  ```

- `test/unit/utils/ci-detector.test.ts`: Additional CI platforms
  ```typescript
  describe("CI detector additional platforms", () => {
    it("should detect Azure DevOps", () => {
      process.env.TF_BUILD = "True";
      expect(CIDetector.isCI()).toBe(true);
      expect(CIDetector.getCIName()).toBe("Azure DevOps");
      delete process.env.TF_BUILD;
    });

    it("should detect AWS CodeBuild", () => {
      process.env.CODEBUILD_BUILD_ID = "build:123";
      expect(CIDetector.isCI()).toBe(true);
      expect(CIDetector.getCIName()).toBe("AWS CodeBuild");
      delete process.env.CODEBUILD_BUILD_ID;
    });

    it("should detect Drone CI", () => {
      process.env.DRONE = "true";
      expect(CIDetector.isCI()).toBe(true);
      expect(CIDetector.getCIName()).toBe("Drone CI");
      delete process.env.DRONE;
    });

    it("should detect Bitbucket Pipelines", () => {
      process.env.BITBUCKET_COMMIT = "abc123";
      expect(CIDetector.isCI()).toBe(true);
      expect(CIDetector.getCIName()).toBe("Bitbucket Pipelines");
      delete process.env.BITBUCKET_COMMIT;
    });
  });
  ```

**Implementation**:

- `src/utils/format.ts`: Create shared formatting utilities
  ```typescript
  /**
   * Format milliseconds as human-readable uptime
   */
  export function formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Format bytes as human-readable size
   */
  export function formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let unitIndex = 0;
    let size = bytes;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return unitIndex === 0
      ? `${size} ${units[unitIndex]}`
      : `${size.toFixed(2)} ${units[unitIndex]}`;
  }
  ```

- `src/cli/output/formatters.ts`: Use shared utilities
  ```typescript
  import { formatUptime, formatBytes } from "../../utils/format.js";

  // Remove duplicate formatUptime and formatBytes implementations
  // Use imported functions instead
  ```

- `src/mcp/tools/info.ts`: Use shared utilities
  ```typescript
  import { formatUptime, formatBytes } from "../../utils/format.js";

  // Remove duplicate implementations, use shared utilities
  ```

- `src/cli/commands/remove.ts`: Add CI awareness
  ```typescript
  if (!options.force) {
    if (CIDetector.isCI()) {
      throw new ServherdError(
        ServherdErrorCode.COMMAND_VALIDATION,
        "Remove requires --force flag in CI mode to prevent hanging on confirmation prompt",
      );
    }
    const confirmed = await confirm({ message });
    if (!confirmed) {
      return { removed: [], message: "Cancelled" };
    }
  }
  ```

- `src/utils/ci-detector.ts`: Add missing CI platforms
  ```typescript
  const CI_ENVIRONMENTS: CIEnvironment[] = [
    // ... existing platforms
    { name: "Azure DevOps", envVar: "TF_BUILD" },
    { name: "AWS CodeBuild", envVar: "CODEBUILD_BUILD_ID" },
    { name: "Drone CI", envVar: "DRONE" },
    { name: "Bitbucket Pipelines", envVar: "BITBUCKET_COMMIT" },
    { name: "Buildkite", envVar: "BUILDKITE" },
    { name: "Semaphore", envVar: "SEMAPHORE" },
    { name: "Render", envVar: "RENDER" },
  ];
  ```

- `src/services/process.service.ts`: Fix flushAll to only affect servherd processes
  ```typescript
  async flushAll(): Promise<void> {
    // Get list of all servherd processes
    const processes = await this.listServherdProcesses();
    for (const proc of processes) {
      await this.flush(proc.name);
    }
  }

  // Update existing flush(name?: string) method
  async flush(name: string): Promise<void> {
    // Remove the "all" option, require explicit name
    return new Promise((resolve, reject) => {
      pm2.flush(name, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  ```

**Dependencies**:
- External: None
- Internal: Phase 3 (error handling patterns)

**Verification**:
1. Run: `npm test -- --grep "format"`
2. Run: `npm test -- --grep "CI"`
3. Run: `npm run build && npm run lint` - verify no regressions
4. Manual: In CI environment, run `servherd remove --all` without force - should error
5. Manual: In CI environment, run `servherd remove --all --force` - should work

---

## Common Utilities Needed

| Utility | Purpose | Used By |
|---------|---------|---------|
| `src/utils/format.ts` | Shared formatting (uptime, bytes) | formatters.ts, info.ts (MCP) |
| `src/utils/version.ts` | Read version from package.json | CLI, MCP server |
| `proper-lockfile` wrapper | File locking abstraction | RegistryService |

## External Libraries Assessment

| Task | Library | Reason |
|------|---------|--------|
| File locking for registry | `proper-lockfile` | Battle-tested, handles stale locks, cross-platform |
| (Already in place) | `detect-port` | Port availability checking |
| (Already in place) | `cosmiconfig` | Config file discovery |
| (Consider for future) | `chokidar` | More reliable file watching than fs.watch |

## Risk Mitigation

| Potential Risk | Mitigation Strategy |
|----------------|---------------------|
| File locking deadlocks | Use stale lock detection (10s timeout), limited retries (3) |
| CI port file corruption | Include timestamp, clean up entries older than 1 hour |
| Breaking existing tests | Run full test suite after each phase, no merge until 100% pass |
| Version mismatch between CLI/MCP | Single source of truth in `src/utils/version.ts` |
| Config wizard breaking CI | Explicit CI check before launching wizard, fallback to `--show` |

## Summary

| Phase | Focus | Key Deliverables | Estimated Effort |
|-------|-------|------------------|------------------|
| 1 | Critical Data Integrity | File locking, CI port persistence | 2-3 days |
| 2 | MCP-CLI Feature Parity | Missing tool options (force, stopped, port, protocol, refresh) | 2 days |
| 3 | Error Consistency | ServherdError standardization, version fix, selective error handling | 1-2 days |
| 4 | Configuration Improvements | Wizard wiring, protocol drift, HTTPS validation | 2 days |
| 5 | Code Quality & Polish | Shared utilities, CI awareness, additional CI platforms | 2 days |

**Total Estimated Effort**: 9-11 days

Each phase builds on previous phases and maintains backward compatibility. Tests are written first to ensure quality and prevent regressions.
