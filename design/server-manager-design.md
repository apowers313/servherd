# Server Manager Design Document

> **Project**: servherd
> **Version**: 0.1.0
> **Author**: Design Document
> **Status**: Draft

## Executive Summary

`servherd` is a CLI tool and MCP server for managing development servers across multiple projects, git worktrees, and server types (Vite, Storybook, docs, HTTP, etc.). It provides a global registry for port assignment, configuration management, and lifecycle control with first-class support for LLM/AI integration.

---

## Table of Contents

1. [Toolchain & Project Scaffolding](#toolchain--project-scaffolding)
2. [Package Naming](#package-naming)
3. [Architecture Overview](#architecture-overview)
4. [Data Structures](#data-structures)
5. [CLI Commands](#cli-commands)
6. [MCP Server](#mcp-server)
7. [PM2 Integration](#pm2-integration)
8. [Port Management](#port-management)
9. [CI/CD Support](#cicd-support)
10. [Testing Strategy](#testing-strategy)
11. [File Structure](#file-structure)
12. [Implementation Phases](#implementation-phases)

---

## Toolchain & Project Scaffolding

Based on analysis of graphty-monorepo, pupt, and worktree-tool projects, the following toolchain will be used:

### Build & Runtime

| Tool | Version | Purpose |
|------|---------|---------|
| **TypeScript** | ^5.9.0 | Primary language |
| **Node.js** | >=20.0.0 | Runtime (ESM modules) |
| **tsc** | (bundled) | TypeScript compiler |
| **tsx** | ^4.20.0 | Development execution |

### Testing

| Tool | Version | Purpose |
|------|---------|---------|
| **Vitest** | ^3.2.0 | Test framework |
| **@vitest/coverage-v8** | ^3.2.0 | Code coverage |
| **@vitest/ui** | ^3.2.0 | Test UI (optional) |

### Linting & Code Quality

| Tool | Version | Purpose |
|------|---------|---------|
| **ESLint** | ^9.32.0 | Linting (flat config) |
| **typescript-eslint** | ^8.38.0 | TypeScript ESLint integration |
| **@stylistic/eslint-plugin** | latest | Code formatting via ESLint |
| **eslint-plugin-simple-import-sort** | latest | Import sorting |
| **knip** | latest | Dead code detection |

### CLI & Terminal

| Tool | Version | Purpose |
|------|---------|---------|
| **commander** | ^14.0.0 | CLI argument parsing |
| **@inquirer/prompts** | ^7.8.0 | Interactive prompts |
| **chalk** | ^5.5.0 | Terminal colors |
| **ora** | ^8.2.0 | Spinners |
| **boxen** | ^8.0.0 | Boxed terminal output |

### Configuration & Validation

| Tool | Version | Purpose |
|------|---------|---------|
| **zod** | ^3.23.0 | Schema validation |
| **cosmiconfig** | ^9.0.0 | Configuration loading |
| **handlebars** | ^4.7.0 | Template variable substitution |

### Process Management

| Tool | Version | Purpose |
|------|---------|---------|
| **pm2** | ^5.4.0 | Process management |
| **@types/pm2** | latest | TypeScript types |
| **detect-port** | ^2.1.0 | Port availability checking |
| **get-port** | ^7.1.0 | Get available ports |

### MCP Integration

| Tool | Version | Purpose |
|------|---------|---------|
| **@modelcontextprotocol/sdk** | ^1.23.0 | MCP server implementation |

### Utilities

| Tool | Version | Purpose |
|------|---------|---------|
| **execa** | ^9.6.0 | Process execution |
| **human-readable-ids** | ^1.0.4 | Human-readable server names |
| **pino** | ^9.9.0 | Logging |
| **pino-pretty** | ^13.1.0 | Log formatting |
| **fs-extra** | ^11.3.0 | File system utilities |

### Git Hooks & Release

| Tool | Version | Purpose |
|------|---------|---------|
| **husky** | ^9.0.0 | Git hooks |
| **commitlint** | ^19.8.0 | Commit message linting |
| **semantic-release** | ^24.2.0 | Automated releases |

### Package Manager

- **npm** (not pnpm - single package, not monorepo)

---

## Package Naming

### Recommended Name: `servherd`

**Rationale**:
- Evokes "herding servers" - managing multiple servers
- Short, memorable, easy to type
- Available on npm (verified)
- Descriptive of functionality

**Alternative Names** (all verified available on npm):
- `devsail` - "sail through development"
- `devharbor` - "harbor for dev servers"
- `portwise` - emphasizes port management

**CLI Command**: `servherd` (or chosen alternative)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Interface                           │
│  (commander-based commands: start, stop, list, info, etc.)      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Core Services                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │   Config    │ │  Registry   │ │    Port     │ │  Process  │ │
│  │   Service   │ │   Service   │ │   Service   │ │  Manager  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Config File   │  │  Registry File  │  │      PM2        │
│   (JSON)        │  │    (JSON)       │  │   (Daemon)      │
└─────────────────┘  └─────────────────┘  └─────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server                               │
│  (Exposes all CLI functionality via Model Context Protocol)     │
└─────────────────────────────────────────────────────────────────┘
```

### Service Responsibilities

#### ConfigService
- Manages global configuration (`~/.servherd/config.json`)
- Handles interactive configuration prompts
- Provides CI/CD detection and defaults
- Validates configuration with Zod schemas

#### RegistryService
- Manages server registry (`~/.servherd/registry.json`)
- CRUD operations for server entries
- Generates human-readable server names
- Persists port assignments

#### PortService
- Generates deterministic ports from project hash
- Checks port availability
- Finds alternative ports when conflicts occur
- Port range management (configurable)

#### ProcessManager
- Wraps PM2 programmatic API
- Start/stop/restart servers
- Retrieve logs and status
- Health checking

---

## Data Structures

### Global Configuration (`~/.servherd/config.json`)

```typescript
interface GlobalConfig {
  version: string;              // Config schema version
  hostname: string;             // Default hostname (e.g., "localhost")
  protocol: "http" | "https";   // Default protocol
  httpsCert?: string;           // Path to HTTPS certificate
  httpsKey?: string;            // Path to HTTPS key
  portRange: {
    min: number;                // Minimum port (default: 3000)
    max: number;                // Maximum port (default: 9999)
  };
  tempDir: string;              // Temp directory for servers
  pm2: {
    logDir: string;             // PM2 log directory
    pidDir: string;             // PM2 PID directory
  };
}
```

### Server Registry (`~/.servherd/registry.json`)

```typescript
interface ServerEntry {
  id: string;                   // UUID
  name: string;                 // Human-readable name (e.g., "brave-tiger")
  command: string;              // Original command template
  resolvedCommand: string;      // Command with variables resolved
  cwd: string;                  // Working directory (absolute path)
  port: number;                 // Assigned port
  protocol: "http" | "https";   // Protocol for this server
  hostname: string;             // Hostname for this server
  env: Record<string, string>;  // Environment variables
  createdAt: string;            // ISO timestamp
  lastStartedAt?: string;       // ISO timestamp
  pm2Name: string;              // PM2 process name
  tags?: string[];              // Optional tags for grouping
}

interface Registry {
  version: string;              // Registry schema version
  servers: ServerEntry[];       // All registered servers
}
```

### Server Status (Runtime)

```typescript
interface ServerStatus {
  id: string;
  name: string;
  status: "online" | "offline" | "errored" | "stopped";
  uptime?: number;              // Milliseconds
  restarts: number;
  cpu?: number;                 // CPU percentage
  memory?: number;              // Memory in bytes
  port: number;
  url: string;                  // Full URL (protocol://hostname:port)
  pid?: number;
  pm2Id?: number;
}
```

### Template Variables

```typescript
interface TemplateVariables {
  port: number;
  hostname: string;
  protocol: "http" | "https";
  "https-cert"?: string;
  "https-key"?: string;
  "temp-dir": string;
  cwd: string;
}
```

---

## CLI Commands

### `servherd start`

Start a server with template variable substitution.

```bash
# Basic usage
servherd start -- npx storybook --port {{port}}

# With environment variables
servherd start -e STORYBOOK_PORT={{port}} -e HOST={{hostname}} -- npx storybook

# With custom name
servherd start --name my-storybook -- npx storybook --port {{port}}

# With tags
servherd start --tag frontend --tag storybook -- npx storybook --port {{port}}
```

**Options**:
- `--name, -n <name>`: Custom server name (default: auto-generated)
- `--env, -e <KEY=VALUE>`: Environment variable with template support (repeatable)
- `--tag, -t <tag>`: Tag for grouping (repeatable)
- `--port, -p <port>`: Override port assignment
- `--protocol <http|https>`: Override protocol
- `--hostname <host>`: Override hostname
- `--cwd <dir>`: Override working directory

**Behavior**:
1. Parse command and extract template variables
2. Look up existing server by CWD + command hash
3. If exists and running, return existing server info
4. If exists but stopped, restart with same config
5. If new, generate name, assign port, register, and start
6. If missing config values required by templates, prompt user (unless CI)
7. Print success with server name, URL, and status

**Output (Success)**:
```
✓ Server started: brave-tiger
  URL: http://localhost:6123
  Command: npx storybook --port 6123
  Status: online
```

**Output (Error)**:
```
✗ ERROR: Failed to start server
  Exit code: 1
  Error: EADDRINUSE - port 6123 already in use
  Attempted port reassignment failed
```

### `servherd stop`

Stop a running server.

```bash
servherd stop brave-tiger
servherd stop --all
servherd stop --tag frontend
```

**Options**:
- `--all, -a`: Stop all servers
- `--tag, -t <tag>`: Stop all servers with tag
- `--force, -f`: Force kill (SIGKILL)

### `servherd restart`

Restart a server.

```bash
servherd restart brave-tiger
servherd restart --all
```

**Options**:
- `--all, -a`: Restart all servers
- `--tag, -t <tag>`: Restart all servers with tag

### `servherd list`

List all registered servers.

```bash
servherd list
servherd list --json
servherd list --running
servherd list --tag frontend
```

**Options**:
- `--json`: Output as JSON
- `--running`: Only show running servers
- `--stopped`: Only show stopped servers
- `--tag, -t <tag>`: Filter by tag

**Output (Human)**:
```
┌─────────────┬──────────┬─────────────────────────────┬────────────────────────────┐
│ Name        │ Status   │ URL                         │ Directory                  │
├─────────────┼──────────┼─────────────────────────────┼────────────────────────────┤
│ brave-tiger │ ● online │ http://localhost:6123       │ ~/Projects/my-app          │
│ calm-panda  │ ○ stopped│ http://localhost:6124       │ ~/Projects/other-app       │
│ swift-fox   │ ● online │ https://dev.local:6125      │ ~/Projects/secure-app      │
└─────────────┴──────────┴─────────────────────────────┴────────────────────────────┘
```

**Output (JSON)**:
```json
{
  "servers": [
    {
      "name": "brave-tiger",
      "status": "online",
      "url": "http://localhost:6123",
      "cwd": "/home/user/Projects/my-app",
      "command": "npx storybook --port 6123",
      "uptime": 3600000,
      "pid": 12345
    }
  ]
}
```

### `servherd info`

Display detailed information about a server.

```bash
servherd info brave-tiger
servherd info brave-tiger --json
```

**Options**:
- `--json`: Output as JSON

**Output (Human)**:
```
╭───────────────────────────────────────────────────────────────╮
│ Server: brave-tiger                                           │
├───────────────────────────────────────────────────────────────┤
│ Status:     ● online                                          │
│ URL:        http://localhost:6123                             │
│ Directory:  ~/Projects/my-app                                 │
│ Command:    npx storybook --port {{port}}                     │
│                                                               │
│ Runtime                                                       │
│ ───────                                                       │
│ Uptime:     2h 34m 12s                                        │
│ Restarts:   0                                                 │
│ CPU:        0.5%                                              │
│ Memory:     145 MB                                            │
│ PID:        12345                                             │
│                                                               │
│ Configuration                                                 │
│ ─────────────                                                 │
│ Port:       6123                                              │
│ Protocol:   http                                              │
│ Hostname:   localhost                                         │
│                                                               │
│ Environment                                                   │
│ ───────────                                                   │
│ NODE_ENV=development                                          │
│                                                               │
│ Tags: frontend, storybook                                     │
│                                                               │
│ Created:    2024-01-15 10:30:00                               │
│ Last Start: 2024-01-15 14:22:33                               │
╰───────────────────────────────────────────────────────────────╯
```

### `servherd logs`

Display logs from a server.

```bash
servherd logs brave-tiger
servherd logs brave-tiger --tail 50
servherd logs brave-tiger --head 20
servherd logs brave-tiger --follow
servherd logs brave-tiger --error
```

**Options**:
- `--tail, -t <n>`: Show last n lines (default: 100)
- `--head, -h <n>`: Show first n lines
- `--follow, -f`: Follow log output (like `tail -f`)
- `--error, -e`: Show only error logs
- `--since <time>`: Show logs since timestamp or duration (e.g., "1h", "2024-01-15")

### `servherd config`

Interactive configuration wizard.

```bash
servherd config
servherd config --show
servherd config --reset
servherd config set hostname dev.local
servherd config get hostname
```

**Subcommands**:
- `(none)`: Interactive configuration wizard
- `--show`: Display current configuration
- `--reset`: Reset to defaults
- `set <key> <value>`: Set a configuration value
- `get <key>`: Get a configuration value

**Interactive Prompts**:
1. Default hostname (default: "localhost")
2. Default protocol (http/https)
3. HTTPS certificate path (if https)
4. HTTPS key path (if https)
5. Port range (min/max)

### `servherd remove`

Remove a server from the registry.

```bash
servherd remove brave-tiger
servherd remove --all --stopped
```

**Options**:
- `--force, -f`: Don't prompt for confirmation
- `--all`: Remove all servers matching criteria
- `--stopped`: Only remove stopped servers

### `servherd mcp`

Start the MCP server.

```bash
servherd mcp
servherd mcp --stdio
servherd mcp --port 9050
```

**Options**:
- `--stdio`: Use stdio transport (default for Claude Code integration)
- `--port, -p <port>`: Use SSE transport on specified port

---

## MCP Server

### Available Tools

The MCP server exposes all CLI functionality as tools:

#### `servherd_start`

```typescript
{
  name: "servherd_start",
  description: "Start a development server with automatic port assignment and variable substitution",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Command to run with {{variable}} placeholders" },
      name: { type: "string", description: "Optional server name" },
      env: { type: "object", description: "Environment variables with {{variable}} support" },
      tags: { type: "array", items: { type: "string" } },
      cwd: { type: "string", description: "Working directory" }
    },
    required: ["command"]
  }
}
```

#### `servherd_stop`

```typescript
{
  name: "servherd_stop",
  description: "Stop a running server",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Server name to stop" },
      all: { type: "boolean", description: "Stop all servers" },
      tag: { type: "string", description: "Stop servers with this tag" }
    }
  }
}
```

#### `servherd_restart`

```typescript
{
  name: "servherd_restart",
  description: "Restart a server",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Server name to restart" },
      all: { type: "boolean" }
    }
  }
}
```

#### `servherd_list`

```typescript
{
  name: "servherd_list",
  description: "List all registered servers with their status",
  inputSchema: {
    type: "object",
    properties: {
      running: { type: "boolean", description: "Only running servers" },
      stopped: { type: "boolean", description: "Only stopped servers" },
      tag: { type: "string" }
    }
  }
}
```

#### `servherd_info`

```typescript
{
  name: "servherd_info",
  description: "Get detailed information about a server",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Server name" }
    },
    required: ["name"]
  }
}
```

#### `servherd_logs`

```typescript
{
  name: "servherd_logs",
  description: "Get logs from a server",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Server name" },
      tail: { type: "number", description: "Number of lines from end" },
      head: { type: "number", description: "Number of lines from start" },
      error: { type: "boolean", description: "Error logs only" }
    },
    required: ["name"]
  }
}
```

#### `servherd_config`

```typescript
{
  name: "servherd_config",
  description: "Get or set configuration values",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["get", "set", "show"] },
      key: { type: "string" },
      value: { type: "string" }
    },
    required: ["action"]
  }
}
```

### MCP Resources

The MCP server can also expose resources:

```typescript
// Server list as a resource
{
  uri: "servherd://servers",
  name: "Server List",
  mimeType: "application/json"
}

// Individual server info
{
  uri: "servherd://servers/{name}",
  name: "Server Info",
  mimeType: "application/json"
}

// Server logs
{
  uri: "servherd://servers/{name}/logs",
  name: "Server Logs",
  mimeType: "text/plain"
}
```

---

## PM2 Integration

### Programmatic API Usage

```typescript
import pm2 from "pm2";

class PM2Manager {
  private connected = false;

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.connect((err) => {
        if (err) reject(err);
        else {
          this.connected = true;
          resolve();
        }
      });
    });
  }

  async start(options: PM2StartOptions): Promise<PM2Process> {
    await this.ensureConnected();
    return new Promise((resolve, reject) => {
      pm2.start({
        script: options.script,
        name: options.name,
        cwd: options.cwd,
        env: options.env,
        interpreter: options.interpreter || "none", // For shell commands
        interpreterArgs: options.interpreterArgs,
        autorestart: false, // We handle restart logic
        max_restarts: 3,
        log_file: options.logFile,
        error_file: options.errorFile,
        out_file: options.outFile,
        merge_logs: true,
        time: true, // Timestamp logs
      }, (err, apps) => {
        if (err) reject(err);
        else resolve(apps[0]);
      });
    });
  }

  async stop(name: string): Promise<void> {
    await this.ensureConnected();
    return new Promise((resolve, reject) => {
      pm2.stop(name, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async restart(name: string): Promise<void> {
    await this.ensureConnected();
    return new Promise((resolve, reject) => {
      pm2.restart(name, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async delete(name: string): Promise<void> {
    await this.ensureConnected();
    return new Promise((resolve, reject) => {
      pm2.delete(name, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async describe(name: string): Promise<PM2ProcessDescription> {
    await this.ensureConnected();
    return new Promise((resolve, reject) => {
      pm2.describe(name, (err, desc) => {
        if (err) reject(err);
        else resolve(desc[0]);
      });
    });
  }

  async list(): Promise<PM2ProcessDescription[]> {
    await this.ensureConnected();
    return new Promise((resolve, reject) => {
      pm2.list((err, list) => {
        if (err) reject(err);
        else resolve(list);
      });
    });
  }

  async getLogs(name: string, lines: number): Promise<string> {
    // Read from PM2 log files
    const desc = await this.describe(name);
    const logPath = desc.pm2_env?.pm_out_log_path;
    // Read last N lines from log file
  }

  async flush(name: string): Promise<void> {
    await this.ensureConnected();
    return new Promise((resolve, reject) => {
      pm2.flush(name, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  disconnect(): void {
    if (this.connected) {
      pm2.disconnect();
      this.connected = false;
    }
  }
}
```

### PM2 Process Naming Convention

PM2 process names follow the pattern: `servherd-{server-name}`

Example: `servherd-brave-tiger`

This prevents conflicts with other PM2 processes.

### Additional PM2 Features to Expose

1. **`servherd flush <name>`**: Clear logs for a server
2. **`servherd reload <name>`**: Graceful reload (0-downtime for cluster mode)
3. **`servherd monit`**: Open PM2 monitoring dashboard
4. **`servherd save`**: Save current PM2 process list for restart on reboot
5. **`servherd resurrect`**: Restore previously saved processes

---

## Port Management

### Port Assignment Strategy

```typescript
class PortService {
  private config: GlobalConfig;
  private registry: Registry;

  /**
   * Generate a deterministic port based on CWD and command.
   * This ensures the same server always gets the same port initially.
   */
  generatePort(cwd: string, command: string): number {
    const hash = this.hashString(`${cwd}:${command}`);
    const range = this.config.portRange.max - this.config.portRange.min;
    return this.config.portRange.min + (hash % range);
  }

  /**
   * FNV-1a hash for deterministic port generation
   */
  private hashString(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash >>> 0;
  }

  /**
   * Check if a port is available
   */
  async isPortAvailable(port: number): Promise<boolean> {
    const detectPort = await import("detect-port");
    const availablePort = await detectPort.default(port);
    return availablePort === port;
  }

  /**
   * Get an available port, starting from preferred
   */
  async getAvailablePort(preferred: number): Promise<number> {
    if (await this.isPortAvailable(preferred)) {
      return preferred;
    }

    // Use get-port for finding next available
    const getPort = await import("get-port");
    return getPort.default({
      port: getPort.portNumbers(
        this.config.portRange.min,
        this.config.portRange.max
      ),
      exclude: this.getUsedPorts()
    });
  }

  /**
   * Get all ports currently assigned in registry
   */
  private getUsedPorts(): number[] {
    return this.registry.servers.map(s => s.port);
  }

  /**
   * Assign a port for a new server
   */
  async assignPort(cwd: string, command: string): Promise<number> {
    const preferredPort = this.generatePort(cwd, command);
    return this.getAvailablePort(preferredPort);
  }
}
```

### Port Conflict Resolution

1. On start, check if assigned port is available
2. If not, try to find the process using the port
3. If it's our server (by PM2 name), consider it "already running"
4. If it's another process, assign a new port and update registry
5. Warn user about port reassignment

---

## CI/CD Support

### CI Detection

```typescript
class CIDetector {
  static isCI(): boolean {
    return !!(
      process.env.CI ||
      process.env.CONTINUOUS_INTEGRATION ||
      process.env.GITHUB_ACTIONS ||
      process.env.GITLAB_CI ||
      process.env.CIRCLECI ||
      process.env.TRAVIS ||
      process.env.JENKINS_URL ||
      process.env.BUILDKITE ||
      process.env.TF_BUILD ||  // Azure DevOps
      process.env.CODEBUILD_BUILD_ID  // AWS CodeBuild
    );
  }

  static getCIName(): string | null {
    if (process.env.GITHUB_ACTIONS) return "GitHub Actions";
    if (process.env.GITLAB_CI) return "GitLab CI";
    if (process.env.CIRCLECI) return "CircleCI";
    if (process.env.TRAVIS) return "Travis CI";
    if (process.env.JENKINS_URL) return "Jenkins";
    if (process.env.BUILDKITE) return "Buildkite";
    if (process.env.TF_BUILD) return "Azure DevOps";
    if (process.env.CODEBUILD_BUILD_ID) return "AWS CodeBuild";
    if (process.env.CI) return "Unknown CI";
    return null;
  }
}
```

### CI Behavior Differences

| Feature | Interactive Mode | CI Mode |
|---------|-----------------|---------|
| Config prompts | Interactive | Use defaults/error |
| Missing variables | Prompt user | Use defaults/error |
| Registry persistence | Write to file | In-memory only |
| Hostname default | "localhost" | "localhost" |
| Port strategy | Hash + availability | Sequential from min |
| Color output | Enabled | Disabled (respects NO_COLOR) |
| Progress spinners | Enabled | Disabled |

### CI-Specific Options

```bash
# Force CI mode
servherd start --ci -- npx storybook --port {{port}}

# Provide all variables explicitly (no prompts)
servherd start --hostname localhost --port 6006 -- npx storybook --port {{port}}

# Use environment variables for configuration
SERVHERD_HOSTNAME=localhost SERVHERD_PORT=6006 servherd start -- npx storybook
```

### CI Configuration via Environment

```bash
# All config options available as env vars
SERVHERD_HOSTNAME=localhost
SERVHERD_PROTOCOL=http
SERVHERD_PORT_MIN=3000
SERVHERD_PORT_MAX=9999
SERVHERD_TEMP_DIR=/tmp/servherd
```

---

## Testing Strategy

### Test Categories

#### 1. Unit Tests

Location: `test/unit/`

- Pure function testing
- Service logic with mocked dependencies
- Configuration parsing and validation
- Template variable substitution
- Port hashing algorithm

```typescript
// Example: test/unit/port-service.test.ts
describe("PortService", () => {
  describe("generatePort", () => {
    it("should generate deterministic port for same input", () => {
      const service = new PortService(mockConfig);
      const port1 = service.generatePort("/home/user/project", "npm start");
      const port2 = service.generatePort("/home/user/project", "npm start");
      expect(port1).toBe(port2);
    });

    it("should generate different ports for different inputs", () => {
      const service = new PortService(mockConfig);
      const port1 = service.generatePort("/home/user/project-a", "npm start");
      const port2 = service.generatePort("/home/user/project-b", "npm start");
      expect(port1).not.toBe(port2);
    });

    it("should respect port range", () => {
      const service = new PortService({ ...mockConfig, portRange: { min: 5000, max: 6000 } });
      const port = service.generatePort("/home/user/project", "npm start");
      expect(port).toBeGreaterThanOrEqual(5000);
      expect(port).toBeLessThan(6000);
    });
  });
});
```

#### 2. Integration Tests

Location: `test/integration/`

- PM2 integration (with real PM2 daemon)
- File system operations
- Port availability checking
- Full command execution

```typescript
// Example: test/integration/pm2-manager.test.ts
describe("PM2Manager", () => {
  let manager: PM2Manager;

  beforeAll(async () => {
    manager = new PM2Manager();
    await manager.connect();
  });

  afterAll(async () => {
    // Cleanup test processes
    await manager.delete("test-server");
    manager.disconnect();
  });

  it("should start a simple server", async () => {
    const result = await manager.start({
      name: "test-server",
      script: "node",
      args: ["-e", "require('http').createServer((_, r) => r.end('ok')).listen(19999)"],
      cwd: process.cwd()
    });

    expect(result.pm2_env.status).toBe("online");
  });

  it("should retrieve server status", async () => {
    const desc = await manager.describe("test-server");
    expect(desc.pm2_env.status).toBe("online");
  });
});
```

#### 3. E2E Tests

Location: `test/e2e/`

- Full CLI command execution
- MCP server communication
- Complete workflows

```typescript
// Example: test/e2e/cli.test.ts
describe("CLI E2E", () => {
  it("should start and stop a server via CLI", async () => {
    // Start server
    const startResult = await execa("servherd", [
      "start",
      "--name", "e2e-test",
      "--",
      "node", "-e",
      "require('http').createServer((_, r) => r.end('ok')).listen(process.env.PORT)"
    ]);

    expect(startResult.exitCode).toBe(0);
    expect(startResult.stdout).toContain("SUCCESS");

    // List servers
    const listResult = await execa("servherd", ["list", "--json"]);
    const servers = JSON.parse(listResult.stdout);
    expect(servers.servers).toContainEqual(
      expect.objectContaining({ name: "e2e-test", status: "online" })
    );

    // Stop server
    const stopResult = await execa("servherd", ["stop", "e2e-test"]);
    expect(stopResult.exitCode).toBe(0);
  });
});
```

### Mock Strategy

#### PM2 Mocking

```typescript
// test/mocks/pm2.ts
export const createMockPM2 = () => ({
  connect: vi.fn((cb) => cb(null)),
  disconnect: vi.fn(),
  start: vi.fn((opts, cb) => cb(null, [{ pm2_env: { status: "online" } }])),
  stop: vi.fn((name, cb) => cb(null)),
  restart: vi.fn((name, cb) => cb(null)),
  delete: vi.fn((name, cb) => cb(null)),
  describe: vi.fn((name, cb) => cb(null, [mockProcessDescription])),
  list: vi.fn((cb) => cb(null, [])),
  flush: vi.fn((name, cb) => cb(null)),
});
```

#### File System Mocking

```typescript
// Use memfs for in-memory file system testing
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vol.fromJSON({
    "/home/user/.servherd/config.json": JSON.stringify(defaultConfig),
    "/home/user/.servherd/registry.json": JSON.stringify({ version: "1", servers: [] }),
  });
});
```

### Test Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["test/**", "dist/**", "*.config.*"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    setupFiles: ["./test/setup.ts"],
  },
});

// vitest.config.integration.ts
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,  // PM2 tests need single process
      },
    },
  },
});

// vitest.config.e2e.ts
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
```

### Test Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --config vitest.config.ts",
    "test:integration": "vitest run --config vitest.config.integration.ts",
    "test:e2e": "vitest run --config vitest.config.e2e.ts",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

---

## File Structure

```
servherd/
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── cli/
│   │   ├── index.ts                # Commander setup
│   │   ├── commands/
│   │   │   ├── start.ts            # start command
│   │   │   ├── stop.ts             # stop command
│   │   │   ├── restart.ts          # restart command
│   │   │   ├── list.ts             # list command
│   │   │   ├── info.ts             # info command
│   │   │   ├── logs.ts             # logs command
│   │   │   ├── config.ts           # config command
│   │   │   ├── remove.ts           # remove command
│   │   │   └── mcp.ts              # mcp command
│   │   └── output/
│   │       ├── formatters.ts       # Output formatting
│   │       └── spinners.ts         # Progress indicators
│   ├── services/
│   │   ├── config.service.ts       # Configuration management
│   │   ├── registry.service.ts     # Server registry
│   │   ├── port.service.ts         # Port management
│   │   └── process.service.ts      # PM2 wrapper
│   ├── mcp/
│   │   ├── index.ts                # MCP server entry
│   │   ├── tools/                  # MCP tool handlers
│   │   │   ├── start.ts
│   │   │   ├── stop.ts
│   │   │   ├── list.ts
│   │   │   └── ...
│   │   └── resources/              # MCP resource handlers
│   │       └── servers.ts
│   ├── utils/
│   │   ├── ci-detector.ts          # CI environment detection
│   │   ├── template.ts             # Handlebars template processing
│   │   ├── names.ts                # Human-readable name generation
│   │   └── logger.ts               # Pino logger setup
│   └── types/
│       ├── config.ts               # Config types + Zod schemas
│       ├── registry.ts             # Registry types + Zod schemas
│       └── pm2.ts                  # PM2 related types
├── test/
│   ├── setup.ts                    # Test setup
│   ├── fixtures/                   # Test fixtures
│   │   ├── configs/
│   │   └── registries/
│   ├── mocks/
│   │   ├── pm2.ts                  # PM2 mock
│   │   └── fs.ts                   # File system mock
│   ├── unit/
│   │   ├── services/
│   │   │   ├── config.service.test.ts
│   │   │   ├── registry.service.test.ts
│   │   │   ├── port.service.test.ts
│   │   │   └── process.service.test.ts
│   │   └── utils/
│   │       ├── ci-detector.test.ts
│   │       ├── template.test.ts
│   │       └── names.test.ts
│   ├── integration/
│   │   ├── pm2.test.ts
│   │   ├── port-availability.test.ts
│   │   └── config-persistence.test.ts
│   └── e2e/
│       ├── cli.test.ts
│       └── mcp.test.ts
├── scripts/
│   └── add-shebang.js              # Post-build shebang addition
├── design/
│   └── server-manager-design.md    # This document
├── .github/
│   └── workflows/
│       ├── ci.yml                  # CI workflow
│       └── release.yml             # Release workflow
├── package.json
├── tsconfig.json
├── tsconfig.eslint.json
├── eslint.config.mjs
├── vitest.config.ts
├── vitest.config.integration.ts
├── vitest.config.e2e.ts
├── .gitignore
├── .nvmrc
└── LICENSE
```

---

## Implementation Phases

### Phase 1: Project Setup & Core Infrastructure

**Goal**: Working project skeleton with basic tooling

**Tasks**:
1. Initialize npm package with ESM configuration
2. Set up TypeScript with strict configuration
3. Configure ESLint with flat config and @stylistic
4. Set up Vitest with coverage
5. Configure husky and commitlint
6. Create basic directory structure
7. Implement logger utility
8. Implement CI detector utility
9. Create Zod schemas for config and registry

**Deliverables**:
- `package.json` with all dependencies
- `tsconfig.json` configured
- `eslint.config.mjs` configured
- `vitest.config.ts` (all three configs)
- Basic utility files with tests

### Phase 2: Core Services

**Goal**: Implement core business logic services

**Tasks**:
1. Implement ConfigService
   - Load/save configuration
   - Interactive prompts
   - CI mode defaults
   - Environment variable overrides
2. Implement RegistryService
   - CRUD operations for servers
   - Human-readable name generation
   - Server lookup by name, CWD, command hash
3. Implement PortService
   - Deterministic port hashing
   - Port availability checking
   - Port reassignment logic
4. Implement ProcessService (PM2 wrapper)
   - Connect/disconnect
   - Start/stop/restart
   - Status and logs retrieval

**Deliverables**:
- All four service classes with full test coverage
- Integration tests for PM2 and port checking

### Phase 3: CLI Commands

**Goal**: Full CLI implementation

**Tasks**:
1. Set up Commander with global options
2. Implement `start` command
   - Template variable parsing
   - Server registration
   - PM2 process start
3. Implement `stop` command
4. Implement `restart` command
5. Implement `list` command with table formatting
6. Implement `info` command with boxed output
7. Implement `logs` command with streaming support
8. Implement `config` command with interactive wizard
9. Implement `remove` command
10. Add shebang script for `npx` execution

**Deliverables**:
- Fully functional CLI
- E2E tests for all commands
- Help text and examples

### Phase 4: MCP Server

**Goal**: MCP server exposing CLI functionality

**Tasks**:
1. Set up MCP server with stdio transport
2. Implement all tool handlers
3. Implement resource handlers
4. Add SSE transport option
5. Test MCP integration

**Deliverables**:
- Working MCP server
- MCP configuration examples for Claude Code
- MCP integration tests

### Phase 5: Polish & Release

**Goal**: Production-ready release

**Tasks**:
1. Comprehensive documentation
2. Error handling improvements
3. Performance optimization
4. Semantic release configuration
5. GitHub Actions workflows
6. npm publishing setup
7. README with examples

**Deliverables**:
- Published npm package
- Complete documentation
- CI/CD pipelines

---

## Configuration Examples

### Claude Code MCP Configuration

```json
{
  "mcpServers": {
    "servherd": {
      "command": "npx",
      "args": ["servherd", "mcp"]
    }
  }
}
```

### Package.json npm script integration

```json
{
  "scripts": {
    "storybook": "servherd start -- npx storybook dev --port {{port}}",
    "dev": "servherd start -- vite --port {{port}}",
    "docs": "servherd start -- vitepress dev docs --port {{port}}"
  }
}
```

### CI/CD Usage (GitHub Actions)

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci

      # Start test server (CI mode auto-detected)
      - run: npx servherd start --name test-server -- npm run serve

      # Run tests against the server
      - run: npm test

      # Stop server
      - run: npx servherd stop test-server
```

---

## Error Handling

### Error Categories

```typescript
enum ServherdErrorCode {
  // Configuration errors (1xxx)
  CONFIG_NOT_FOUND = 1001,
  CONFIG_INVALID = 1002,
  CONFIG_WRITE_FAILED = 1003,

  // Registry errors (2xxx)
  REGISTRY_NOT_FOUND = 2001,
  REGISTRY_INVALID = 2002,
  SERVER_NOT_FOUND = 2003,
  SERVER_ALREADY_EXISTS = 2004,

  // Port errors (3xxx)
  PORT_UNAVAILABLE = 3001,
  PORT_OUT_OF_RANGE = 3002,
  NO_PORTS_AVAILABLE = 3003,

  // PM2 errors (4xxx)
  PM2_CONNECTION_FAILED = 4001,
  PM2_START_FAILED = 4002,
  PM2_STOP_FAILED = 4003,
  PM2_NOT_FOUND = 4004,

  // Template errors (5xxx)
  TEMPLATE_INVALID = 5001,
  TEMPLATE_MISSING_VARIABLE = 5002,

  // General errors (9xxx)
  UNKNOWN_ERROR = 9999,
}

class ServherdError extends Error {
  constructor(
    public code: ServherdErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ServherdError";
  }
}
```

### Error Output Format

```
✗ ERROR [4002]: Failed to start server

  Server: brave-tiger
  Command: npx storybook --port 6123

  Details:
    Exit code: 1
    stderr: Error: Cannot find module 'storybook'

  Suggestions:
    - Ensure storybook is installed: npm install @storybook/cli
    - Check the command is correct
    - View logs: servherd logs brave-tiger
```

---

## Security Considerations

1. **Command Injection Prevention**
   - All user-provided commands are passed to PM2 as-is
   - Template variables are validated against whitelist
   - No shell interpolation of user input

2. **File Permissions**
   - Config and registry files created with 0600 permissions
   - Log files created with 0644 permissions

3. **Path Traversal Prevention**
   - All paths validated and resolved to absolute paths
   - No symlink following for sensitive operations

4. **Environment Variable Safety**
   - Sensitive values (certs, keys) stored as paths, not contents
   - No secrets in registry file

---

## Future Considerations

### Potential Future Features

1. **Server Groups**: Manage related servers together
2. **Health Checks**: HTTP/TCP health check endpoints
3. **Auto-restart Policies**: Configurable restart behavior
4. **Web Dashboard**: Browser-based UI for server management
5. **Remote Management**: Manage servers across machines
6. **Docker Integration**: Container-based server management
7. **Plugins**: Extensible server type handlers

### API Stability

- Config file format: Versioned, migrations supported
- Registry file format: Versioned, migrations supported
- CLI commands: Semantic versioning for breaking changes
- MCP tools: Additive changes only after v1.0

---

## Glossary

| Term | Definition |
|------|------------|
| **Server** | A long-running process managed by servherd |
| **Registry** | The JSON file tracking all servers and their configurations |
| **Template Variable** | A `{{variable}}` placeholder in commands |
| **PM2 Name** | The unique identifier used by PM2 (prefixed with `servherd-`) |
| **Human Name** | The user-friendly server name (e.g., "brave-tiger") |
