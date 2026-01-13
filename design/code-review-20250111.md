# Code Review Report - 1/11/2026

## Executive Summary

**Project**: servherd - CLI tool and MCP server for managing development servers
**Version**: 1.0.0
**Review Date**: January 11, 2026

### Files Reviewed

| Category | Count |
|----------|-------|
| Production code (src/) | 42 TypeScript files |
| Test code (test/) | 42 test files |
| Configuration files | 10+ config files |
| Design documents | 4 Markdown files |

### Issue Summary

| Priority | Count |
|----------|-------|
| Critical Issues | 2 |
| High Priority Issues | 10 |
| Medium Priority Issues | 15 |
| Low Priority Issues | 12 |

---

## Critical Issues (Fix Immediately)

### 1. Port Race Condition in CI Mode Sequential Allocation

- **Files**: `src/services/port.service.ts:80-103`
- **Description**: In CI mode, the sequential port allocation tracks used ports in a `Set` but this Set is not persisted across different process invocations. If multiple CI jobs run simultaneously or if the servherd process restarts, they could allocate the same port causing server startup failures.

```typescript
// Problem code in port.service.ts
export class PortService {
  private ciUsedPorts: Set<number> = new Set(); // In-memory only!

  private async getNextAvailableSequential(): Promise<number> {
    const usedPorts = this.ciUsedPorts;
    // ...
  }
}
```

- **Fix**:
  - Either persist CI port allocations to a temporary file that can be read across processes
  - Or use file-based locking when allocating ports in CI mode
  - Or accept the limitation and document it clearly

```typescript
// Option 1: File-based tracking
private async loadCiUsedPorts(): Promise<Set<number>> {
  const ciPortsFile = path.join(this.config.tempDir, 'ci-ports.json');
  if (await pathExists(ciPortsFile)) {
    const data = await readJSON(ciPortsFile);
    return new Set(data.ports);
  }
  return new Set();
}

private async saveCiUsedPorts(ports: Set<number>): Promise<void> {
  const ciPortsFile = path.join(this.config.tempDir, 'ci-ports.json');
  await writeJSON(ciPortsFile, { ports: Array.from(ports), timestamp: Date.now() });
}
```

### 2. Registry File Corruption Risk During Concurrent Writes

- **Files**: `src/services/registry.service.ts:171-176`
- **Description**: The registry is loaded into memory and saved back without any file locking. If two processes (e.g., two terminal sessions) modify the registry simultaneously, one's changes could be lost.

```typescript
// Problem code - no locking mechanism
async save(): Promise<void> {
  if (!this.registry) {
    throw new ServherdError(ServherdErrorCode.REGISTRY_CORRUPT, "Registry not loaded");
  }
  await ensureDir(path.dirname(this.registryPath));
  await writeJson(this.registryPath, this.registry, { spaces: 2 });
}
```

- **Fix**: Implement file locking using `proper-lockfile` or similar:

```typescript
import lockfile from 'proper-lockfile';

async save(): Promise<void> {
  if (!this.registry) {
    throw new ServherdError(ServherdErrorCode.REGISTRY_CORRUPT, "Registry not loaded");
  }
  await ensureDir(path.dirname(this.registryPath));

  // Acquire lock before writing
  const release = await lockfile.lock(this.registryPath, {
    retries: 3,
    stale: 10000
  });
  try {
    await writeJson(this.registryPath, this.registry, { spaces: 2 });
  } finally {
    await release();
  }
}
```

---

## High Priority Issues (Fix Soon)

### 1. MCP-CLI Option Parity Gaps

- **Files**: Multiple MCP tool files in `src/mcp/tools/`
- **Description**: Several CLI options are not available in MCP tools, reducing feature parity:

| Command | CLI Option | MCP Support |
|---------|-----------|-------------|
| `stop` | `--force` | ❌ Missing |
| `restart` | `--tag` | ✅ Supported |
| `list` | `--stopped` | ❌ Missing |
| `remove` | `--force` | ❌ Missing |
| `start` | `--port` (explicit) | ❌ Missing |
| `start` | `--protocol` | ❌ Missing |

- **Fix for stop.ts**:
```typescript
// src/mcp/tools/stop.ts
export const stopToolSchema = z.object({
  name: z.string().optional(),
  all: z.boolean().optional(),
  tag: z.string().optional(),
  force: z.boolean().optional().describe("Force stop using SIGKILL"), // ADD THIS
});

export async function handleStopTool(input: StopToolInput): Promise<StopToolResult> {
  const results = await executeStop({
    name: input.name,
    all: input.all,
    tag: input.tag,
    force: input.force, // ADD THIS
  });
  // ...
}
```

- **Fix for list.ts**:
```typescript
// src/mcp/tools/list.ts
export const listToolSchema = z.object({
  running: z.boolean().optional(),
  stopped: z.boolean().optional().describe("Set to true to only show stopped servers"), // ADD THIS
  tag: z.string().optional(),
  cwd: z.string().optional(),
  cmd: z.string().optional(),
});
```

### 2. Port Service Does Not Check Registry Ports Against Running Processes

- **Files**: `src/services/port.service.ts:50-78`
- **Description**: When checking port availability, the code checks if a port is free on the system but doesn't verify if the port is being used by a servherd-managed server that's still in the registry. This could lead to port reassignment when an existing server just hasn't been started yet.

```typescript
// Current code - only checks system availability
async getAvailablePort(
  preferred: number,
  context?: { cwd?: string; command?: string },
): Promise<{ port: number; reassigned: boolean }> {
  // Check if port is available on the system
  if (await this.isPortAvailable(preferred)) {
    return { port: preferred, reassigned: false };
  }
  // ... finds next available
}
```

- **Fix**: Cross-reference with registry before declaring a port available:

```typescript
async getAvailablePort(
  preferred: number,
  context?: { cwd?: string; command?: string },
): Promise<{ port: number; reassigned: boolean }> {
  // First check if this port belongs to another registered server
  if (this.registry) {
    const existingServer = this.registry.servers.find(s => s.port === preferred);
    if (existingServer) {
      // Port is allocated to another server - check if it's running
      // If not running, the port might still be ours when we start it
      // This is complex - need to coordinate with ProcessService
    }
  }

  if (await this.isPortAvailable(preferred)) {
    return { port: preferred, reassigned: false };
  }
  // ...
}
```

### 3. Hardcoded Magic Values Throughout Codebase

- **Files**: Multiple files
- **Description**: Several hardcoded values should be configurable or at least defined as named constants:

| File | Location | Hardcoded Value | Issue |
|------|----------|-----------------|-------|
| `src/cli/commands/logs.ts:13` | `DEFAULT_LINES` | `50` | Should be configurable |
| `src/services/port.service.ts:33` | Hash seed | `2166136261` | Magic number - should be documented |
| `src/mcp/index.ts:84` | Version | `"0.1.0"` | Should use package.json version |
| `src/cli/index.ts:22` | Version | `"0.1.0"` | Should use package.json version |
| `src/types/config.ts:41-54` | DEFAULT_CONFIG | Multiple values | Consider env var overrides |

- **Fix for version**:
```typescript
// src/mcp/index.ts
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));

export function createMCPServer(options: MCPServerOptions = {}): McpServer {
  const name = options.name || "servherd";
  const version = options.version || packageJson.version; // Use actual version
  // ...
}
```

### 4. Inconsistent Error Handling - Mix of Error Classes and Plain Strings

- **Files**: `src/cli/commands/info.ts:51`, `src/cli/commands/restart.ts:95`
- **Description**: Some command handlers use `ServherdError` while others throw plain `Error`. This inconsistency makes error handling less predictable.

```typescript
// info.ts - throws plain Error
if (!server) {
  throw new Error(`Server "${options.name}" not found`);
}

// logs.ts - uses ServherdError
if (!server) {
  throw new ServherdError(
    ServherdErrorCode.SERVER_NOT_FOUND,
    `Server "${options.name}" not found`,
  );
}
```

- **Fix**: Standardize on `ServherdError` throughout:

```typescript
// src/cli/commands/info.ts
if (!server) {
  throw new ServherdError(
    ServherdErrorCode.SERVER_NOT_FOUND,
    `Server "${options.name}" not found`,
  );
}
```

### 5. ProcessService PM2 Connection Leak in Error Paths

- **Files**: `src/services/process.service.ts`
- **Description**: While most command handlers use `try/finally` to disconnect from PM2, if an error occurs during `connect()` itself, the error handling is inconsistent. Also, the `describe` method catches and returns `undefined` for errors, which could hide connection issues.

```typescript
// Problem: describe silently swallows errors
async describe(name: string): Promise<PM2ProcessDescription | undefined> {
  try {
    return await new Promise((resolve, reject) => {
      pm2.describe(name, (err, proc) => {
        if (err) reject(err);
        else resolve(proc[0]);
      });
    });
  } catch {
    return undefined; // Silently swallows ALL errors
  }
}
```

- **Fix**: Be more selective about which errors to swallow:

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
    // Only swallow "not found" errors, re-throw others
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found') || message.includes('process name not found')) {
      return undefined;
    }
    throw error;
  }
}
```

### 6. Missing Validation for Port Range Overlap

- **Files**: `src/services/port.service.ts`, `src/types/config.ts`
- **Description**: While `PortRangeSchema` validates that min <= max, there's no validation that the port range is reasonable (e.g., avoiding privileged ports 1-1023) or that it doesn't conflict with common service ports.

```typescript
// Current validation is minimal
export const PortRangeSchema = z.object({
  min: z.number().int().min(1).max(65535),
  max: z.number().int().min(1).max(65535),
}).refine((data) => data.min <= data.max, {
  message: "Port range min must be less than or equal to max",
});
```

- **Fix**: Add warnings or validation for common issues:

```typescript
export const PortRangeSchema = z.object({
  min: z.number().int().min(1024).max(65535), // Avoid privileged ports
  max: z.number().int().min(1024).max(65535),
}).refine((data) => data.min <= data.max, {
  message: "Port range min must be less than or equal to max",
}).refine((data) => data.max - data.min >= 100, {
  message: "Port range should have at least 100 ports for flexibility",
});
```

### 7. Config Drift Detection Incomplete for Protocol Changes

- **Files**: `src/utils/config-drift.ts`
- **Description**: Config drift detection only tracks `hostname`, `httpsCert`, and `httpsKey`. If the user changes `protocol` from `http` to `https` (or vice versa), this won't be detected as drift, even though it significantly affects the server URL.

```typescript
// Current snapshot only includes these fields
export const ConfigSnapshotSchema = z.object({
  hostname: z.string().optional(),
  httpsCert: z.string().optional(),
  httpsKey: z.string().optional(),
  // protocol is missing!
});
```

- **Fix**: Add protocol to the config snapshot:

```typescript
export const ConfigSnapshotSchema = z.object({
  hostname: z.string().optional(),
  protocol: z.enum(["http", "https"]).optional(), // ADD THIS
  httpsCert: z.string().optional(),
  httpsKey: z.string().optional(),
});

// Update detectDrift() to check protocol changes
```

### 8. Duplicate Service Instantiation Pattern

- **Files**: All CLI command files
- **Description**: Every command handler creates new instances of services (RegistryService, ProcessService, ConfigService) instead of sharing instances. This wastes resources and makes testing harder.

```typescript
// This pattern is repeated in every command
export async function executeList(options: ListCommandOptions): Promise<ListCommandResult> {
  const registryService = new RegistryService();
  const processService = new ProcessService();
  const configService = new ConfigService();
  // ...
}
```

- **Fix**: Consider dependency injection or a service container:

```typescript
// src/services/container.ts
export interface ServiceContainer {
  registry: RegistryService;
  process: ProcessService;
  config: ConfigService;
  port: PortService;
}

let container: ServiceContainer | null = null;

export function getServices(): ServiceContainer {
  if (!container) {
    container = {
      registry: new RegistryService(),
      process: new ProcessService(),
      config: new ConfigService(),
      port: new PortService(),
    };
  }
  return container;
}

// In commands:
export async function executeList(options: ListCommandOptions): Promise<ListCommandResult> {
  const { registry, process, config } = getServices();
  // ...
}
```

---

## Medium Priority Issues (Technical Debt)

### 1. Missing `lastStartedAt` Field in ServerEntry

- **Files**: `src/types/registry.ts`
- **Description**: The design document specifies a `lastStartedAt` field in `ServerEntry`, but it's not implemented. This would be useful for debugging and server management.

- **Fix**: Add the field and update it on server start:
```typescript
// src/types/registry.ts
export const ServerEntrySchema = z.object({
  // ... existing fields
  lastStartedAt: z.string().optional(), // ADD THIS
});
```

### 2. Log Follower Uses Node's Built-in `watch` Instead of More Robust Solution

- **Files**: `src/utils/log-follower.ts`
- **Description**: Node's `fs.watch` has known issues on some platforms (especially network filesystems). The design document suggested using `chokidar` for more reliable file watching.

```typescript
// Current implementation
const watcher = watch(logPath, async (eventType) => {
  // fs.watch can fire duplicate events, miss events, etc.
});
```

- **Fix**: Consider using `chokidar` or add debouncing:
```typescript
import chokidar from 'chokidar';

const watcher = chokidar.watch(logPath, {
  persistent: true,
  usePolling: false,
  awaitWriteFinish: { stabilityThreshold: 100 },
});

watcher.on('change', readNewLines);
```

### 3. Template Variable `url` Recalculated Instead of Using Config

- **Files**: `src/utils/template.ts:109-119`
- **Description**: The `url` template variable is constructed from individual config values, but if the user wants a custom URL format, there's no way to override it.

```typescript
// url is always constructed, never configurable
return {
  port,
  hostname: config.hostname,
  url: `${config.protocol}://${config.hostname}:${port}`,
  // ...
};
```

### 4. CI Detector Missing Some CI Platforms

- **Files**: `src/utils/ci-detector.ts`
- **Description**: The design document mentions AWS CodeBuild and Azure DevOps (`TF_BUILD`), but these are missing from the implementation.

```typescript
// Missing from CI_ENVIRONMENTS:
// - AWS CodeBuild (CODEBUILD_BUILD_ID)
// - Azure DevOps (TF_BUILD)
// - Drone CI (DRONE)
// - Bitbucket Pipelines (BITBUCKET_COMMIT)
```

- **Fix**: Add missing platforms:
```typescript
const CI_ENVIRONMENTS: CIEnvironment[] = [
  // ... existing
  { name: "Azure DevOps", envVar: "TF_BUILD" },
  { name: "AWS CodeBuild", envVar: "CODEBUILD_BUILD_ID" },
  { name: "Drone CI", envVar: "DRONE" },
  { name: "Bitbucket Pipelines", envVar: "BITBUCKET_COMMIT" },
];
```

### 5. Remove Command Confirmation Not CI-Aware

- **Files**: `src/cli/commands/remove.ts:52-68`
- **Description**: The remove command prompts for confirmation even in CI mode unless `--force` is specified. In CI, the prompt will hang indefinitely.

```typescript
// Problem: confirm() will hang in CI
if (!options.force) {
  const confirmed = await confirm({ message });
  // ...
}
```

- **Fix**: Auto-confirm with `--force` or error in CI:
```typescript
if (!options.force) {
  if (CIDetector.isCI()) {
    // In CI, treat as error if not forced
    throw new ServherdError(
      ServherdErrorCode.INTERACTIVE_NOT_AVAILABLE,
      "Remove requires --force flag in CI mode",
    );
  }
  const confirmed = await confirm({ message });
  // ...
}
```

### 6. ProcessService `flush` Method Takes Optional Name But PM2 API Behavior Differs

- **Files**: `src/services/process.service.ts:154-165`
- **Description**: When `pm2.flush()` is called with no name, it flushes ALL processes (not just servherd-managed ones). This could unexpectedly clear logs for other PM2 processes.

```typescript
// Problem: flushes ALL PM2 processes, not just servherd's
async flush(name?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    pm2.flush(name ?? "all", (err) => {
      // ...
    });
  });
}
```

- **Fix**: Only flush servherd processes when "all" is requested:
```typescript
async flushAll(): Promise<void> {
  // Get list of all servherd processes
  const servers = await this.list();
  for (const proc of servers) {
    if (proc.name.startsWith('servherd-')) {
      await this.flush(proc.name);
    }
  }
}
```

### 7. MCP Server Version Hardcoded Differently Than CLI

- **Files**: `src/mcp/index.ts:84`, `src/cli/index.ts:22`
- **Description**: Both files hardcode version `"0.1.0"` even though package.json is at `1.0.0`.

### 8. Formatters Have Duplicate Uptime/Memory Formatting Logic

- **Files**: `src/cli/output/formatters.ts:242-260`, `src/mcp/tools/info.ts:44-73`
- **Description**: Both files have their own implementations of `formatUptime` and `formatMemory`/`formatBytes`. This duplicates logic and risks inconsistency.

- **Fix**: Extract to shared utility:
```typescript
// src/utils/format.ts
export function formatUptime(uptimeMs: number): string { /* ... */ }
export function formatBytes(bytes: number): string { /* ... */ }
```

### 9. Config Command Has Overly Complex Return Type

- **Files**: `src/cli/output/formatters.ts:482-506`
- **Description**: `ConfigResult` is a union-like type with many optional fields. This makes it hard to understand what the command actually returns in each case.

```typescript
export interface ConfigResult {
  config?: Record<string, unknown>;  // For --show
  configPath?: string | null;
  globalConfigPath?: string;
  key?: string;                       // For --get
  value?: unknown;
  updated?: boolean;                  // For --set
  refreshMessage?: string;
  reset?: boolean;                    // For --reset
  cancelled?: boolean;
  refreshResults?: RefreshResult[];   // For --refresh
  dryRun?: boolean;
  error?: string;
}
```

- **Fix**: Use discriminated unions:
```typescript
type ConfigResult =
  | { type: 'show'; config: GlobalConfig; configPath: string | null; globalConfigPath: string }
  | { type: 'get'; key: string; value: unknown }
  | { type: 'set'; key: string; value: unknown; refreshMessage?: string }
  | { type: 'reset'; reset: boolean; cancelled?: boolean }
  | { type: 'refresh'; results: RefreshResult[]; dryRun: boolean }
  | { type: 'error'; error: string };
```

### 10. Design Feature Not Implemented: `servherd remove --stopped`

- **Files**: `src/cli/commands/remove.ts`, `src/cli/index.ts`
- **Description**: The design document mentions `servherd remove --all --stopped` to remove only stopped servers, but this filter isn't implemented.

### 11. Design Feature Not Implemented: MCP SSE Transport

- **Files**: `src/mcp/index.ts`
- **Description**: The design document mentions `servherd mcp --port <port>` for SSE transport, but only stdio transport is implemented.

### 12. Start Command `--cwd` Option Missing

- **Files**: `src/cli/index.ts`, `src/cli/commands/start.ts`
- **Description**: The design document specifies a `--cwd` option for the start command, but it's not implemented in the CLI (it is supported in the MCP tool).

---

## Configuration System Deep Dive

This section provides a detailed analysis of the configuration framework, including prompting behavior, MCP handling, and consistency issues.

### Architecture Overview

The configuration system has a well-designed layered architecture:

```
┌─────────────────────────────────────────────────────────┐
│  Environment Variables (SERVHERD_*)  - Highest priority │
├─────────────────────────────────────────────────────────┤
│  Project-local config (.servherdrc, package.json, etc.) │
├─────────────────────────────────────────────────────────┤
│  Global config (~/.servherd/config.json)                │
├─────────────────────────────────────────────────────────┤
│  DEFAULT_CONFIG (hardcoded defaults) - Lowest priority  │
└─────────────────────────────────────────────────────────┘
```

**Key Components**:
- `src/services/config.service.ts` - Core config loading/saving
- `src/cli/commands/config.ts` - CLI config command with wizard
- `src/mcp/tools/config.ts` - MCP config tool
- `src/utils/template.ts` - Template variable system
- `src/utils/config-drift.ts` - Change detection

### What's Working Well

1. **Multi-source Config Loading**: The `ConfigService.load()` method correctly merges configs from multiple sources with proper precedence.

2. **Template Variable Prompting**: When a user runs a command with `{{https-cert}}` but hasn't configured `httpsCert`, the CLI:
   - Detects missing variables via `findMissingVariables()`
   - Prompts interactively with `promptForMissingVariables()`
   - Saves values for future use
   - Properly errors in CI mode with actionable guidance

3. **MCP Missing Variable Handling**: The `formatMissingVariablesForMCP()` function provides clear instructions on how to configure missing values using the `servherd_config` tool.

4. **Config Drift Detection**: The system tracks which config keys each server uses and can detect when those values have changed.

5. **CI Mode Awareness**: The config wizard properly errors in CI mode instead of hanging.

### Issues Found

#### Issue 1: Config Wizard Not Wired Up in CLI (HIGH)

- **Files**: `src/cli/commands/config.ts`, `src/cli/index.ts`
- **Description**: The `runConfigWizard()` function exists and is fully implemented, but there's no way to invoke it from the CLI. Per the design document, `servherd config` (no arguments) should launch the wizard.

```typescript
// src/cli/commands/config.ts:299-370
export async function runConfigWizard(): Promise<void> {
  // Fully implemented but never called!
}
```

- **Current Behavior**: `servherd config` with no args shows current config (same as `--show`)
- **Expected Behavior**: `servherd config` with no args should launch the interactive wizard
- **Fix**:

```typescript
// src/cli/commands/config.ts - configAction()
export async function configAction(options: ConfigCommandOptions): Promise<void> {
  // If no options provided, run the wizard
  const hasOptions = options.show || options.get || options.set ||
                     options.reset || options.refresh || options.refreshAll;

  if (!hasOptions) {
    await runConfigWizard();
    return;
  }

  // ... rest of existing logic
}
```

#### Issue 2: MCP Config Tool Missing Refresh Options (HIGH)

- **Files**: `src/mcp/tools/config.ts`
- **Description**: The CLI config command supports `--refresh`, `--refresh-all`, `--tag`, and `--dry-run` options for config drift handling, but the MCP tool doesn't expose these.

```typescript
// Current MCP schema - missing refresh options
export const configToolSchema = z.object({
  show: z.boolean().optional(),
  get: z.string().optional(),
  set: z.string().optional(),
  value: z.string().optional(),
  reset: z.boolean().optional(),
  // Missing: refresh, refreshAll, tag, dryRun
});
```

- **Fix**: Add the missing options to match CLI parity:

```typescript
export const configToolSchema = z.object({
  show: z.boolean().optional(),
  get: z.string().optional(),
  set: z.string().optional(),
  value: z.string().optional(),
  reset: z.boolean().optional(),
  refresh: z.string().optional().describe("Refresh a specific server's config"),
  refreshAll: z.boolean().optional().describe("Refresh all servers with config drift"),
  tag: z.string().optional().describe("Filter servers by tag when using refreshAll"),
  dryRun: z.boolean().optional().describe("Preview refresh actions without executing"),
});
```

#### Issue 3: Config Wizard Missing `refreshOnChange` Setting (MEDIUM)

- **Files**: `src/cli/commands/config.ts:299-370`
- **Description**: The config wizard prompts for hostname, protocol, HTTPS certs, and port range, but doesn't prompt for the `refreshOnChange` setting, which is an important behavior configuration.

- **Fix**: Add to the wizard:

```typescript
// In runConfigWizard()
const refreshOnChange = await select({
  message: "When config changes, how should running servers be handled?",
  choices: [
    { name: "On start - Check for drift when servers restart", value: "on-start" },
    { name: "Prompt - Ask before restarting affected servers", value: "prompt" },
    { name: "Auto - Automatically restart affected servers", value: "auto" },
    { name: "Manual - Never auto-restart, use 'servherd refresh'", value: "manual" },
  ],
  default: currentConfig.refreshOnChange ?? "on-start",
});
```

#### Issue 4: No Validation of HTTPS Cert/Key File Existence (MEDIUM)

- **Files**: `src/cli/commands/config.ts`, `src/services/config.service.ts`
- **Description**: The design document specifies that certificate file paths should be validated for existence. Currently, any string is accepted.

```typescript
// Current: No file existence check
if (protocol === "https") {
  httpsCert = await input({
    message: "Path to HTTPS certificate:",
    default: currentConfig.httpsCert,
    // Missing: validate: (path) => existsSync(path) || "File not found"
  });
}
```

- **Fix**: Add file validation:

```typescript
import { existsSync } from 'fs';

httpsCert = await input({
  message: "Path to HTTPS certificate:",
  default: currentConfig.httpsCert,
  validate: (path) => {
    if (!path) return true; // Optional
    return existsSync(path) || `File not found: ${path}`;
  },
});
```

#### Issue 5: MCP Start Tool Doesn't Provide Defaults Context (MEDIUM)

- **Files**: `src/mcp/tools/start.ts`
- **Description**: When the MCP start tool encounters missing template variables, it tells the user to configure them, but doesn't indicate what the current defaults are or provide a way to see them.

- **Current Error**:
```
Cannot start server: required configuration is missing.
The command uses template variables that are not configured:
  - {{https-cert}}: Use servherd_config tool with set="httpsCert" and value="<path>"
```

- **Better Error** (include current value context):
```
Cannot start server: required configuration is missing.
The command uses template variables that are not configured:
  - {{https-cert}}: Currently empty. Use servherd_config tool with set="httpsCert" and value="<path>"

Tip: Use servherd_config with show=true to see all current settings.
```

#### Issue 6: Inconsistent Default Value Display (LOW)

- **Files**: `src/cli/commands/config.ts`, `src/mcp/tools/config.ts`
- **Description**: Neither CLI nor MCP provides a way to see what the DEFAULT values are (vs current values). This is useful when deciding whether to reset.

- **Fix**: Add `--defaults` option:

```typescript
// CLI
servherd config --defaults  // Show default values

// MCP
{ defaults: true }  // Return DEFAULT_CONFIG
```

#### Issue 7: Config Set Doesn't Validate All Keys (LOW)

- **Files**: `src/cli/commands/config.ts:201-234`
- **Description**: The `--set` handler validates `protocol`, `refreshOnChange`, and port values, but doesn't validate:
- `hostname` (any string accepted, including empty)
- `tempDir` (no path validation)
- `pm2.logDir` and `pm2.pidDir` (not in VALID_NESTED_KEYS)

### Configuration System Summary Table

| Feature | CLI | MCP | Notes |
|---------|-----|-----|-------|
| Show all config | ✅ `--show` | ✅ `show: true` | |
| Get specific value | ✅ `--get <key>` | ✅ `get: "<key>"` | |
| Set value | ✅ `--set <key> --value <v>` | ✅ `set/value` | |
| Reset to defaults | ✅ `--reset` | ✅ `reset: true` | |
| Interactive wizard | ✅ `runConfigWizard()` | N/A | **Not wired up!** |
| Force (skip prompts) | ✅ `--force` | ✅ Auto-forced | |
| Refresh server | ✅ `--refresh <name>` | ❌ Missing | |
| Refresh all | ✅ `--refresh-all` | ❌ Missing | |
| Tag filter | ✅ `--tag <tag>` | ❌ Missing | |
| Dry run | ✅ `--dry-run` | ❌ Missing | |
| Show defaults | ❌ Missing | ❌ Missing | |
| JSON output | ✅ `--json` | N/A (always JSON) | |

### Recommendations for Configuration System

1. **Wire up the config wizard** - Add CLI routing to call `runConfigWizard()` when no options provided
2. **Add refresh options to MCP** - Complete feature parity with CLI
3. **Add file validation for HTTPS paths** - Both in wizard and `--set`
4. **Add `refreshOnChange` to wizard** - Important behavior setting
5. **Add `--defaults` option** - Show default values for comparison
6. **Improve MCP error messages** - Include tips and current value context

---

## Low Priority Issues (Nice to Have)

### 1. No Input Validation for Server Names

- **Files**: `src/services/registry.service.ts`
- **Description**: User-provided server names aren't validated. Names with spaces, special characters, or very long names could cause issues.

### 2. Missing Progress Indicators (ora)

- **Files**: Various CLI command files
- **Description**: The design document mentions using `ora` for spinners, but the implementation doesn't use any progress indicators for long-running operations.

### 3. No Graceful Degradation When PM2 Not Installed

- **Files**: `src/services/process.service.ts`
- **Description**: If PM2 isn't installed or the daemon isn't running, the error messages could be more helpful.

### 4. Test Files Import Production Services Directly

- **Files**: `test/unit/*.test.ts`
- **Description**: Some test files import production services without proper mocking, making tests potentially flaky.

### 5. No JSDoc Comments on Public APIs

- **Files**: Most source files
- **Description**: While the code is readable, public interfaces and exported functions lack JSDoc comments that would improve IDE intellisense and documentation generation.

### 6. Console.log Used Instead of Logger in Some Places

- **Files**: `src/cli/commands/config.ts:369`
- **Description**: `console.log("✓ Configuration saved")` bypasses the logger, making it harder to control output in different contexts.

### 7. `any` Type in Config Command Nested Value Getter

- **Files**: `src/cli/commands/config.ts:39-40`
- **Description**: The `getNestedValue` function uses `any` type, which could be avoided with better typing.

```typescript
function getNestedValue(config: GlobalConfig, key: string): unknown {
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = config; // Could use better typing
```

### 8. Unused ResourceTemplate Import Warning Suppression Needed

- **Files**: `src/mcp/index.ts:1`
- **Description**: `ResourceTemplate` is imported but the way it's used might trigger ESLint warnings in some configurations.

### 9. Missing `--quiet` or `-q` Option

- **Files**: `src/cli/index.ts`
- **Description**: No quiet mode for scripting scenarios where you only want exit codes.

### 10. Logs Command Default Lines Not Documented in Help

- **Files**: `src/cli/index.ts:90`
- **Description**: The help text says "Number of lines to show" but doesn't mention the default (50).

---

## Positive Findings

### Excellent Practices to Replicate

1. **Strong Type Safety**: Consistent use of Zod schemas for runtime validation combined with TypeScript static types provides excellent type safety.

2. **Clear Separation of Concerns**: The architecture cleanly separates CLI commands, MCP tools, services, and utilities.

3. **Comprehensive Error Codes**: The `ServherdError` class with categorized error codes (1xxx, 2xxx, etc.) enables programmatic error handling.

4. **Config Drift Detection**: The implementation of config drift tracking with snapshots is a sophisticated feature not commonly seen.

5. **Template Variable System**: The `{{variable}}` substitution system with validation for missing variables is well-designed.

6. **Test Organization**: Tests are well-organized into unit, integration, and e2e categories with appropriate configurations.

7. **CI Mode Design**: The CI detection and behavioral differences are thoughtfully implemented.

8. **Graceful PM2 Connection Handling**: The `try/finally` pattern for PM2 connections prevents connection leaks in most cases.

9. **Human-Readable Names**: Using `flexi-human-hash` for server names is user-friendly.

10. **MCP Resources**: Exposing servers as MCP resources in addition to tools provides flexibility.

---

## Recommendations

### Immediate Actions (This Sprint)

1. **Fix registry file locking** - Critical for data integrity
2. **Add missing MCP tool options** - Quick wins for feature parity
3. **Standardize error classes** - Low effort, high consistency improvement
4. **Fix hardcoded versions** - Should read from package.json

### Short-term Actions (Next 2 Sprints)

5. **Refactor service instantiation** - Introduce dependency injection
6. **Complete config drift detection** - Add protocol tracking
7. **Add CI awareness to confirmation prompts** - Prevent CI hangs
8. **Fix PM2 flushAll to only affect servherd processes**

### Medium-term Actions (Backlog)

9. **Implement missing design features** - `--stopped` for remove, SSE transport
10. **Add file locking for CI port allocation** - Prevent race conditions
11. **Replace fs.watch with chokidar** - More reliable log following
12. **Extract shared formatting utilities** - Reduce code duplication
13. **Add progress indicators** - Better UX for long operations

### Documentation Needs

14. Document the port hashing algorithm (FNV-1a) with the magic constants
15. Document CI mode limitations (port allocation across processes)
16. Add JSDoc to all public APIs
17. Update help text with defaults

---

## Implementation Tracking

### Feature Parity Checklist (Design vs Implementation)

| Feature | Design | Implemented | Notes |
|---------|--------|-------------|-------|
| CLI: start | ✓ | ✓ | Missing --cwd |
| CLI: stop | ✓ | ✓ | Complete |
| CLI: restart | ✓ | ✓ | Complete |
| CLI: list | ✓ | ✓ | Complete |
| CLI: info | ✓ | ✓ | Complete |
| CLI: logs | ✓ | ✓ | Complete |
| CLI: config | ✓ | ✓ | Complete |
| CLI: remove | ✓ | ✓ | Missing --stopped |
| CLI: mcp | ✓ | ✓ | Missing SSE transport |
| MCP: start | ✓ | ✓ | Missing port/protocol override |
| MCP: stop | ✓ | ✓ | Missing force option |
| MCP: restart | ✓ | ✓ | Complete |
| MCP: list | ✓ | ✓ | Missing stopped filter |
| MCP: info | ✓ | ✓ | Complete |
| MCP: logs | ✓ | ✓ | Complete |
| MCP: config | ✓ | ✓ | Missing refresh/refreshAll/tag/dryRun |
| MCP: remove | ✓ | ✓ | Missing force option |
| MCP: refresh | ✓ | ✓ | Complete |
| HTTPS support | ✓ | ✓ | Complete |
| Port conflict resolution | ✓ | ✓ | Complete |
| CI mode detection | ✓ | ✓ | Missing some platforms |
| Interactive config wizard | ✓ | ⚠️ | Implemented but not wired up to CLI |
| Config drift detection | ✓ | ✓ | Missing protocol |
| husky/commitlint | ✓ | ✓ | Complete |
| knip | ✓ | ✓ | Complete |
| semantic-release | ✓ | ✓ | Complete |
| lastStartedAt field | ✓ | ❌ | Not implemented |
| MCP SSE transport | ✓ | ❌ | Not implemented |
| remove --stopped | ✓ | ❌ | Not implemented |

### Port Edge Cases Checklist

| Scenario | Handled | Notes |
|----------|---------|-------|
| Preferred port available | ✓ | |
| Preferred port in use by external process | ✓ | Reassigns |
| Preferred port in use by servherd server | ✓ | Returns existing |
| Port range exhausted | ✓ | Throws error |
| Port in privileged range (1-1023) | ❌ | No warning |
| CI parallel job port collision | ❌ | Race condition |
| Port freed after server stopped | ⚠️ | Might reassign |
| User-specified port unavailable | ✓ | Throws error |
| User-specified port out of range | ✓ | Throws error |

---

## Conclusion

The servherd codebase is well-architected and largely complete. The main areas for improvement are:

1. **Data integrity** - File locking for registry and CI port allocation
2. **Feature parity** - Missing CLI/MCP option alignment
3. **Error handling consistency** - Standardize on ServherdError
4. **Code deduplication** - Extract shared utilities
5. **Configuration system** - Wire up the config wizard and add MCP refresh options

The implementation closely follows the design documents, with only a few features remaining unimplemented (SSE transport, `lastStartedAt` field, `--stopped` filter for remove).

### Configuration System Assessment

The configuration framework is well-designed with:
- ✅ Proper multi-layer config loading with correct precedence
- ✅ Template variable system with missing value detection
- ✅ Interactive prompting for missing values in CLI
- ✅ CI-aware behavior (errors instead of hanging prompts)
- ✅ Config drift detection and refresh mechanism

Key gaps:
- ❌ Config wizard implemented but not accessible via CLI
- ❌ MCP config tool missing refresh options
- ❌ No file existence validation for HTTPS cert/key paths
- ❌ Protocol not tracked in config drift detection

Overall code quality is high, with good test coverage targets and proper use of TypeScript features. The identified issues are mostly edge cases and polish items rather than fundamental architectural problems.
