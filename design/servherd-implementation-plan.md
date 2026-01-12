# Implementation Plan for servherd

## Overview

`servherd` is a CLI tool and MCP server for managing development servers across multiple projects. This plan breaks the implementation into 8 phases, each delivering **testable functionality** that you can try out immediately.

### Phase Summary

| Phase | Name | What You Can Try |
|-------|------|------------------|
| 1 | Project Scaffolding & Core Types | `npm run build && npm test` |
| 2 | Configuration & Registry Services | Run verification script |
| **3** | **Basic CLI - Start, Stop, List** | `servherd start`, `servherd list`, `servherd stop` |
| 4 | Server Info & Logs | `servherd info`, `servherd logs`, `servherd restart` |
| 5 | Server Management | `servherd remove`, `servherd config` |
| 6 | MCP Server | Use with Claude Code or MCP Inspector |
| 7 | Polish & Documentation | Global install: `npm install -g servherd` |
| 8 | Branding & Logo | Visual assets for README and npm |

---

## Phase Breakdown

### Phase 1: Project Scaffolding & Core Types

**Objective**: Establish project foundation with build tooling, linting, testing infrastructure, and core type definitions.

**Tests to Write First**:

- `test/unit/types/config.test.ts`: Zod schema validation for GlobalConfig
  ```typescript
  describe("GlobalConfigSchema", () => {
    it("should validate a complete valid config", () => {
      const config = {
        version: "1",
        hostname: "localhost",
        protocol: "http",
        portRange: { min: 3000, max: 9999 },
        tempDir: "/tmp/servherd",
        pm2: { logDir: "/tmp/logs", pidDir: "/tmp/pids" }
      };
      expect(() => GlobalConfigSchema.parse(config)).not.toThrow();
    });

    it("should reject invalid port ranges (min > max)", () => {
      const config = { ...validConfig, portRange: { min: 9999, max: 3000 } };
      expect(() => GlobalConfigSchema.parse(config)).toThrow();
    });

    it("should reject invalid protocol values", () => {
      const config = { ...validConfig, protocol: "ftp" };
      expect(() => GlobalConfigSchema.parse(config)).toThrow();
    });
  });
  ```

- `test/unit/types/registry.test.ts`: Zod schema validation for Registry and ServerEntry
  ```typescript
  describe("ServerEntrySchema", () => {
    it("should validate a complete server entry", () => {
      const entry = {
        id: "uuid-here",
        name: "brave-tiger",
        command: "npm start --port {{port}}",
        resolvedCommand: "npm start --port 3000",
        cwd: "/home/user/project",
        port: 3000,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-brave-tiger"
      };
      expect(() => ServerEntrySchema.parse(entry)).not.toThrow();
    });

    it("should reject ports outside valid range", () => {
      const entry = { ...validEntry, port: 70000 };
      expect(() => ServerEntrySchema.parse(entry)).toThrow();
    });
  });
  ```

- `test/unit/utils/ci-detector.test.ts`: CI environment detection
  ```typescript
  describe("CIDetector", () => {
    it("should detect GitHub Actions", () => {
      process.env.GITHUB_ACTIONS = "true";
      expect(CIDetector.isCI()).toBe(true);
      expect(CIDetector.getCIName()).toBe("GitHub Actions");
    });

    it("should return false when not in CI", () => {
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      expect(CIDetector.isCI()).toBe(false);
    });
  });
  ```

- `test/unit/utils/logger.test.ts`: Logger configuration
  ```typescript
  describe("createLogger", () => {
    it("should create a pino logger instance", () => {
      const logger = createLogger({ level: "info" });
      expect(logger.info).toBeDefined();
    });

    it("should respect log level configuration", () => {
      const logger = createLogger({ level: "error" });
      expect(logger.level).toBe("error");
    });
  });
  ```

**Implementation**:

- `package.json`: Comprehensive package configuration
  ```json
  {
    "name": "servherd",
    "version": "0.1.0",
    "description": "CLI tool and MCP server for managing development servers across projects",
    "author": "Your Name <your.email@example.com>",
    "license": "MIT",
    "keywords": [
      "server-manager",
      "development-server",
      "pm2",
      "mcp",
      "cli",
      "devtools",
      "process-manager",
      "port-management",
      "storybook",
      "vite",
      "llm",
      "ai-tools"
    ],
    "repository": {
      "type": "git",
      "url": "https://github.com/yourusername/servherd.git"
    },
    "bugs": {
      "url": "https://github.com/yourusername/servherd/issues"
    },
    "homepage": "https://github.com/yourusername/servherd#readme",
    "type": "module",
    "engines": {
      "node": ">=20.0.0"
    },
    "bin": {
      "servherd": "./dist/index.js"
    },
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": {
        "import": "./dist/index.js",
        "types": "./dist/index.d.ts"
      }
    },
    "files": [
      "dist",
      "docs",
      "examples",
      "README.md",
      "CONTRIBUTING.md",
      "LICENSE"
    ],
    "scripts": {
      "build": "tsc",
      "dev": "tsx src/index.ts",
      "lint": "eslint src test",
      "lint:fix": "eslint src test --fix",
      "test": "vitest run",
      "test:unit": "vitest run --config vitest.config.ts",
      "test:integration": "vitest run --config vitest.config.integration.ts",
      "test:e2e": "vitest run --config vitest.config.e2e.ts",
      "test:watch": "vitest",
      "test:coverage": "vitest run --coverage",
      "prepublishOnly": "npm run lint && npm run build && npm run test"
    }
  }
  ```

- `tsconfig.json`: Strict TypeScript configuration with ESM
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "strict": true,
      "esModuleInterop": true,
      "declaration": true,
      "outDir": "./dist",
      "rootDir": "./src"
    }
  }
  ```

- `eslint.config.mjs`: Flat config with @stylistic and import sorting
- `vitest.config.ts`, `vitest.config.integration.ts`, `vitest.config.e2e.ts`: Test configurations
- `src/types/config.ts`: GlobalConfig interface and Zod schema
- `src/types/registry.ts`: ServerEntry, Registry, ServerStatus interfaces and Zod schemas
- `src/types/pm2.ts`: PM2-related type definitions
- `src/utils/ci-detector.ts`: CI environment detection utility
- `src/utils/logger.ts`: Pino logger setup

**Dependencies**:
- External: typescript, vitest, @vitest/coverage-v8, eslint, typescript-eslint, @stylistic/eslint-plugin, zod, pino, pino-pretty
- Internal: None (foundation phase)

**Verification**:
1. Run: `npm run build`
   - Expected: Clean TypeScript compilation with no errors
2. Run: `npm run lint`
   - Expected: No linting errors
3. Run: `npm run test:unit`
   - Expected: All schema validation and utility tests pass

---

### Phase 2: Core Services - Configuration & Registry

**Objective**: Implement ConfigService and RegistryService for persistent state management.

**Tests to Write First**:

- `test/unit/services/config.service.test.ts`: Configuration management
  ```typescript
  describe("ConfigService", () => {
    describe("load", () => {
      it("should load config from file when exists", async () => {
        mockFs({ "~/.servherd/config.json": JSON.stringify(validConfig) });
        const service = new ConfigService();
        const config = await service.load();
        expect(config.hostname).toBe("localhost");
      });

      it("should return defaults when config file missing", async () => {
        mockFs({});
        const service = new ConfigService();
        const config = await service.load();
        expect(config).toEqual(DEFAULT_CONFIG);
      });

      it("should merge environment variable overrides", async () => {
        process.env.SERVHERD_HOSTNAME = "custom.local";
        const service = new ConfigService();
        const config = await service.load();
        expect(config.hostname).toBe("custom.local");
      });
    });

    describe("save", () => {
      it("should persist config to file", async () => {
        const service = new ConfigService();
        await service.save(validConfig);
        // Verify file was written
      });

      it("should create directory if not exists", async () => {
        mockFs({});
        const service = new ConfigService();
        await service.save(validConfig);
        // Verify ~/.servherd directory was created
      });
    });

    describe("get/set", () => {
      it("should get nested config values", async () => {
        const service = new ConfigService(validConfig);
        expect(service.get("portRange.min")).toBe(3000);
      });

      it("should set and persist config values", async () => {
        const service = new ConfigService(validConfig);
        await service.set("hostname", "new.local");
        expect(service.get("hostname")).toBe("new.local");
      });
    });
  });
  ```

- `test/unit/services/registry.service.test.ts`: Server registry management
  ```typescript
  describe("RegistryService", () => {
    describe("addServer", () => {
      it("should add a new server entry", async () => {
        const service = new RegistryService();
        const entry = await service.addServer({
          command: "npm start",
          cwd: "/project",
          port: 3000
        });
        expect(entry.id).toBeDefined();
        expect(entry.name).toMatch(/^[a-z]+-[a-z]+$/);
      });

      it("should generate unique human-readable names", async () => {
        const service = new RegistryService();
        const entry1 = await service.addServer({ command: "a", cwd: "/a", port: 3000 });
        const entry2 = await service.addServer({ command: "b", cwd: "/b", port: 3001 });
        expect(entry1.name).not.toBe(entry2.name);
      });
    });

    describe("findServer", () => {
      it("should find server by name", async () => {
        const service = new RegistryService();
        await service.addServer({ name: "test-server", command: "npm start", cwd: "/project", port: 3000 });
        const found = service.findByName("test-server");
        expect(found).toBeDefined();
      });

      it("should find server by cwd and command hash", async () => {
        const service = new RegistryService();
        await service.addServer({ command: "npm start", cwd: "/project", port: 3000 });
        const found = service.findByCommandHash("/project", "npm start");
        expect(found).toBeDefined();
      });

      it("should return undefined when not found", () => {
        const service = new RegistryService();
        expect(service.findByName("nonexistent")).toBeUndefined();
      });
    });

    describe("updateServer", () => {
      it("should update existing server entry", async () => {
        const service = new RegistryService();
        const entry = await service.addServer({ command: "npm start", cwd: "/project", port: 3000 });
        await service.updateServer(entry.id, { port: 3001 });
        const updated = service.findById(entry.id);
        expect(updated?.port).toBe(3001);
      });
    });

    describe("removeServer", () => {
      it("should remove server from registry", async () => {
        const service = new RegistryService();
        const entry = await service.addServer({ command: "npm start", cwd: "/project", port: 3000 });
        await service.removeServer(entry.id);
        expect(service.findById(entry.id)).toBeUndefined();
      });
    });
  });
  ```

- `test/unit/utils/names.test.ts`: Human-readable name generation
  ```typescript
  describe("generateName", () => {
    it("should generate adjective-noun format", () => {
      const name = generateName();
      expect(name).toMatch(/^[a-z]+-[a-z]+$/);
    });

    it("should avoid existing names when provided", () => {
      const existing = new Set(["brave-tiger", "calm-panda"]);
      const name = generateName(existing);
      expect(existing.has(name)).toBe(false);
    });
  });
  ```

**Implementation**:

- `src/services/config.service.ts`: Configuration management
  ```typescript
  export class ConfigService {
    private config: GlobalConfig;
    private configPath: string;

    async load(): Promise<GlobalConfig>;
    async save(config: GlobalConfig): Promise<void>;
    get<K extends keyof GlobalConfig>(key: K): GlobalConfig[K];
    async set<K extends keyof GlobalConfig>(key: K, value: GlobalConfig[K]): Promise<void>;
    getDefaults(): GlobalConfig;
    applyEnvironmentOverrides(config: GlobalConfig): GlobalConfig;
  }
  ```

- `src/services/registry.service.ts`: Server registry
  ```typescript
  export class RegistryService {
    private registry: Registry;
    private registryPath: string;

    async load(): Promise<Registry>;
    async save(): Promise<void>;
    async addServer(options: AddServerOptions): Promise<ServerEntry>;
    findByName(name: string): ServerEntry | undefined;
    findById(id: string): ServerEntry | undefined;
    findByCommandHash(cwd: string, command: string): ServerEntry | undefined;
    async updateServer(id: string, updates: Partial<ServerEntry>): Promise<void>;
    async removeServer(id: string): Promise<void>;
    listServers(filter?: ServerFilter): ServerEntry[];
  }
  ```

- `src/utils/names.ts`: Human-readable name generator using human-readable-ids

**Dependencies**:
- External: fs-extra, cosmiconfig, human-readable-ids
- Internal: types/config.ts, types/registry.ts, utils/logger.ts

**Verification**:
1. Run: `npm run test:unit -- --grep "ConfigService|RegistryService"`
   - Expected: All configuration and registry tests pass
2. Create test script in `tmp/test-services.ts`:
   ```typescript
   const config = new ConfigService();
   await config.load();
   console.log(config.get("hostname"));

   const registry = new RegistryService();
   const entry = await registry.addServer({ command: "test", cwd: "/tmp", port: 3000 });
   console.log("Created server:", entry.name);
   ```
3. Run: `npx tsx tmp/test-services.ts`
   - Expected: Shows hostname and generated server name

---

### Phase 3: Basic CLI - Start, Stop, List

**Objective**: Implement a working CLI with core commands (start, stop, list) that you can immediately try out. This phase combines port management, process management, and basic CLI into one deliverable.

**Tests to Write First**:

- `test/unit/services/port.service.test.ts`: Port management
  ```typescript
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
        const port1 = service.generatePort("/project-a", "npm start");
        const port2 = service.generatePort("/project-b", "npm start");
        expect(port1).not.toBe(port2);
      });

      it("should stay within configured port range", () => {
        const config = { portRange: { min: 5000, max: 6000 } };
        const service = new PortService(config);
        const port = service.generatePort("/project", "npm start");
        expect(port).toBeGreaterThanOrEqual(5000);
        expect(port).toBeLessThan(6000);
      });
    });
  });
  ```

- `test/unit/services/process.service.test.ts`: PM2 wrapper (mocked)
  ```typescript
  describe("ProcessService", () => {
    describe("start", () => {
      it("should start process with correct PM2 options", async () => {
        const service = new ProcessService();
        await service.connect();
        await service.start({
          name: "servherd-test",
          script: "npm",
          args: ["start"],
          cwd: "/project",
          env: { PORT: "3000" }
        });
        expect(mockPm2.start).toHaveBeenCalled();
      });
    });

    describe("stop", () => {
      it("should stop process by name", async () => {
        const service = new ProcessService();
        await service.stop("servherd-test");
        expect(mockPm2.stop).toHaveBeenCalledWith("servherd-test", expect.any(Function));
      });
    });
  });
  ```

- `test/unit/utils/template.test.ts`: Template variable substitution
  ```typescript
  describe("TemplateEngine", () => {
    it("should substitute {{port}} variable", () => {
      const result = renderTemplate("npm start --port {{port}}", { port: 3000 });
      expect(result).toBe("npm start --port 3000");
    });

    it("should extract required variables from template", () => {
      const vars = extractVariables("npm start --port {{port}} --host {{hostname}}");
      expect(vars).toEqual(["port", "hostname"]);
    });
  });
  ```

- `test/unit/cli/commands/start.test.ts`: Start command logic
  ```typescript
  describe("start command", () => {
    it("should register new server and start it", async () => {
      const result = await executeStart({ command: "npm start --port {{port}}" });
      expect(result.action).toBe("started");
      expect(mockRegistry.addServer).toHaveBeenCalled();
    });

    it("should use existing server when already registered", async () => {
      mockRegistry.findByCommandHash.mockReturnValue(existingServer);
      const result = await executeStart({ command: "npm start" });
      expect(result.action).toBe("existing");
    });
  });
  ```

**Implementation**:

- `src/services/port.service.ts`: Port management with FNV-1a hashing
- `src/services/process.service.ts`: PM2 wrapper for process control
- `src/utils/template.ts`: Template variable substitution ({{port}}, {{hostname}})
- `src/cli/index.ts`: Commander program setup
- `src/cli/commands/start.ts`: Start command
- `src/cli/commands/stop.ts`: Stop command
- `src/cli/commands/list.ts`: List command with table output
- `src/cli/output/formatters.ts`: Table and output formatting
- `src/index.ts`: CLI entry point

**Dependencies**:
- External: pm2, @types/pm2, detect-port, commander, chalk, cli-table3
- Internal: All Phase 1-2 services and types

**Verification**:
1. Run: `npm run build && npm run lint && npm test`
   - Expected: All tests pass

---

## Try It Out!

After Phase 3 is complete, you can try out the CLI:

```bash
# See available commands
npx tsx src/index.ts --help

# Start a simple HTTP server (uses {{port}} template)
npx tsx src/index.ts start -- node -e "require('http').createServer((req, res) => res.end('Hello from servherd!')).listen({{port}}, () => console.log('Server running on port {{port}}'))"

# List all managed servers
npx tsx src/index.ts list

# Start a named server
npx tsx src/index.ts start --name my-server -- npx http-server -p {{port}}

# Stop a server by name
npx tsx src/index.ts stop my-server

# Stop all servers
npx tsx src/index.ts stop --all
```

**What you should see**:
- `start`: Outputs the server name, assigned port, and URL (e.g., `http://localhost:3456`)
- `list`: Shows a table with Name, Status, Port, URL, and Working Directory
- `stop`: Confirms which server(s) were stopped

---

### Phase 4: Server Info & Logs

**Objective**: Add commands to inspect server details and view logs.

**Tests to Write First**:

- `test/unit/cli/commands/info.test.ts`: Info command
  ```typescript
  describe("info command", () => {
    it("should display detailed server information", async () => {
      mockRegistry.findByName.mockReturnValue(existingServer);
      mockProcess.describe.mockResolvedValue({ pm2_env: { status: "online" } });

      const result = await executeInfo({ name: "brave-tiger" });
      expect(result.name).toBe("brave-tiger");
      expect(result.status).toBe("online");
      expect(result.url).toBeDefined();
    });

    it("should throw when server not found", async () => {
      mockRegistry.findByName.mockReturnValue(undefined);
      await expect(executeInfo({ name: "nonexistent" })).rejects.toThrow();
    });
  });
  ```

- `test/unit/cli/commands/logs.test.ts`: Logs command
  ```typescript
  describe("logs command", () => {
    it("should retrieve server logs", async () => {
      mockRegistry.findByName.mockReturnValue(existingServer);
      mockProcess.getLogs.mockResolvedValue("log line 1\nlog line 2");

      const result = await executeLogs({ name: "brave-tiger", lines: 50 });
      expect(result).toContain("log line 1");
    });

    it("should support --follow flag for streaming", async () => {
      // Test streaming behavior
    });
  });
  ```

- `test/unit/cli/commands/restart.test.ts`: Restart command
  ```typescript
  describe("restart command", () => {
    it("should restart server by name", async () => {
      mockRegistry.findByName.mockReturnValue(existingServer);
      await executeRestart({ name: "brave-tiger" });
      expect(mockProcess.restart).toHaveBeenCalledWith("servherd-brave-tiger");
    });
  });
  ```

**Implementation**:

- `src/cli/commands/info.ts`: Detailed server information display
- `src/cli/commands/logs.ts`: Log viewing with optional streaming
- `src/cli/commands/restart.ts`: Restart a running server
- `src/cli/output/formatters.ts`: Add boxed info display formatter

**Dependencies**:
- External: boxen (for nice boxed output)
- Internal: Phase 3 services

**Verification**:
1. Run: `npm run build && npm run lint && npm test`
   - Expected: All tests pass

---

## Try It Out!

After Phase 4 is complete, you can inspect your servers:

```bash
# First, start a server if you don't have one running
npx tsx src/index.ts start --name demo-server -- node -e "require('http').createServer((req, res) => res.end('Hello!')).listen({{port}})"

# Get detailed info about a server
npx tsx src/index.ts info demo-server

# View the last 50 lines of logs
npx tsx src/index.ts logs demo-server

# View more log lines
npx tsx src/index.ts logs demo-server --lines 100

# Stream logs in real-time (Ctrl+C to exit)
npx tsx src/index.ts logs demo-server --follow

# Restart a server
npx tsx src/index.ts restart demo-server
```

**What you should see**:
- `info`: A boxed display showing server name, status, port, URL, working directory, command, uptime, and more
- `logs`: Server output logs with timestamps
- `restart`: Confirmation that server was restarted

---

### Phase 5: Server Management - Remove & Config

**Objective**: Add commands for removing servers from registry and managing configuration.

**Tests to Write First**:

- `test/unit/cli/commands/remove.test.ts`: Remove command
  ```typescript
  describe("remove command", () => {
    it("should remove server from registry after stopping", async () => {
      mockRegistry.findByName.mockReturnValue(existingServer);
      await executeRemove({ name: "brave-tiger", force: true });
      expect(mockProcess.delete).toHaveBeenCalled();
      expect(mockRegistry.removeServer).toHaveBeenCalled();
    });

    it("should prompt for confirmation without --force", async () => {
      mockRegistry.findByName.mockReturnValue(existingServer);
      mockPrompt.mockResolvedValue(false);
      await executeRemove({ name: "brave-tiger" });
      expect(mockRegistry.removeServer).not.toHaveBeenCalled();
    });

    it("should remove all servers with --all flag", async () => {
      mockRegistry.listServers.mockReturnValue([server1, server2]);
      await executeRemove({ all: true, force: true });
      expect(mockRegistry.removeServer).toHaveBeenCalledTimes(2);
    });
  });
  ```

- `test/unit/cli/commands/config.test.ts`: Config command
  ```typescript
  describe("config command", () => {
    it("should display current configuration", async () => {
      const result = await executeConfig({ show: true });
      expect(result.hostname).toBeDefined();
      expect(result.portRange).toBeDefined();
    });

    it("should set configuration value", async () => {
      await executeConfig({ set: "hostname", value: "myhost.local" });
      expect(mockConfigService.set).toHaveBeenCalledWith("hostname", "myhost.local");
    });

    it("should reset to defaults", async () => {
      await executeConfig({ reset: true, force: true });
      expect(mockConfigService.save).toHaveBeenCalledWith(DEFAULT_CONFIG);
    });
  });
  ```

**Implementation**:

- `src/cli/commands/remove.ts`: Remove servers from registry (with confirmation)
- `src/cli/commands/config.ts`: View and modify configuration
- Update `src/cli/index.ts`: Register new commands

**Dependencies**:
- External: @inquirer/prompts (for confirmation prompts)
- Internal: Phase 3-4 services

**Verification**:
1. Run: `npm run build && npm run lint && npm test`
   - Expected: All tests pass

---

## Try It Out!

After Phase 5 is complete, you can manage servers and configuration:

```bash
# View current configuration
npx tsx src/index.ts config --show

# Change the hostname setting
npx tsx src/index.ts config --set hostname --value myhost.local

# Change port range
npx tsx src/index.ts config --set portRange.min --value 4000
npx tsx src/index.ts config --set portRange.max --value 5000

# Reset configuration to defaults
npx tsx src/index.ts config --reset

# Remove a server (will prompt for confirmation)
npx tsx src/index.ts remove my-server

# Remove without confirmation
npx tsx src/index.ts remove my-server --force

# Remove all servers
npx tsx src/index.ts remove --all --force

# Filter servers by tag when removing
npx tsx src/index.ts remove --tag test --force
```

**What you should see**:
- `config --show`: Table of all configuration values with their sources (default, file, env)
- `config --set`: Confirmation that setting was updated
- `remove`: Confirmation prompt, then success message showing server was removed from both PM2 and registry

---

### Phase 6: MCP Server

**Objective**: Expose CLI functionality via Model Context Protocol for LLM integration.

**Tests to Write First**:

- `test/unit/mcp/tools/start.test.ts`: MCP start tool
  ```typescript
  describe("servherd_start tool", () => {
    it("should have correct schema", () => {
      const tool = getToolDefinition("servherd_start");
      expect(tool.inputSchema.properties.command).toBeDefined();
      expect(tool.inputSchema.required).toContain("command");
    });

    it("should call executeStart with parsed parameters", async () => {
      const result = await handleStartTool({
        command: "npm start --port {{port}}",
        name: "test-server",
        cwd: "/project"
      });
      expect(mockExecuteStart).toHaveBeenCalledWith({
        command: "npm start --port {{port}}",
        name: "test-server",
        cwd: "/project"
      });
    });

    it("should return structured result", async () => {
      mockExecuteStart.mockResolvedValue({
        action: "started",
        server: { name: "test", url: "http://localhost:3000" }
      });

      const result = await handleStartTool({ command: "npm start" });
      expect(result.content[0].text).toContain("started");
      expect(result.content[0].text).toContain("http://localhost:3000");
    });
  });
  ```

- `test/unit/mcp/tools/list.test.ts`: MCP list tool
  ```typescript
  describe("servherd_list tool", () => {
    it("should return server list as JSON", async () => {
      mockExecuteList.mockResolvedValue({
        servers: [{ name: "test", status: "online", url: "http://localhost:3000" }]
      });

      const result = await handleListTool({});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.servers).toHaveLength(1);
    });

    it("should pass filter options", async () => {
      await handleListTool({ running: true, tag: "frontend" });
      expect(mockExecuteList).toHaveBeenCalledWith({ running: true, tag: "frontend" });
    });
  });
  ```

- `test/unit/mcp/resources/servers.test.ts`: MCP resources
  ```typescript
  describe("MCP resources", () => {
    it("should list server resources", async () => {
      mockRegistry.listServers.mockReturnValue([server1, server2]);

      const resources = await listResources();
      expect(resources).toContainEqual(
        expect.objectContaining({ uri: "servherd://servers/brave-tiger" })
      );
    });

    it("should read server resource", async () => {
      mockRegistry.findByName.mockReturnValue(server1);
      mockProcess.describe.mockResolvedValue({ pm2_env: { status: "online" } });

      const content = await readResource("servherd://servers/brave-tiger");
      const parsed = JSON.parse(content);
      expect(parsed.name).toBe("brave-tiger");
      expect(parsed.status).toBe("online");
    });

    it("should read server logs resource", async () => {
      mockProcess.getLogs.mockResolvedValue("log line 1\nlog line 2");

      const content = await readResource("servherd://servers/brave-tiger/logs");
      expect(content).toContain("log line 1");
    });
  });
  ```

- `test/integration/mcp.test.ts`: MCP server integration
  ```typescript
  describe("MCP Server Integration", () => {
    let client: MCPTestClient;

    beforeAll(async () => {
      client = await MCPTestClient.connect({ command: "npx", args: ["tsx", "src/mcp/index.ts"] });
    });

    afterAll(async () => {
      await client.disconnect();
    });

    it("should list available tools", async () => {
      const tools = await client.listTools();
      expect(tools.map(t => t.name)).toContain("servherd_start");
      expect(tools.map(t => t.name)).toContain("servherd_stop");
      expect(tools.map(t => t.name)).toContain("servherd_list");
    });

    it("should list available resources", async () => {
      const resources = await client.listResources();
      expect(resources.some(r => r.uri.startsWith("servherd://"))).toBe(true);
    });

    it("should execute start tool", async () => {
      const result = await client.callTool("servherd_start", {
        command: "node -e \"setInterval(() => {}, 1000)\"",
        name: "mcp-test-server"
      });
      expect(result.content[0].text).toContain("started");

      // Cleanup
      await client.callTool("servherd_stop", { name: "mcp-test-server" });
      await client.callTool("servherd_remove", { name: "mcp-test-server" });
    });
  });
  ```

**Implementation**:

- `src/mcp/index.ts`: MCP server entry point
  ```typescript
  export async function createMCPServer(options: MCPServerOptions): Promise<Server>;
  export async function startStdioServer(): Promise<void>;
  export async function startSSEServer(port: number): Promise<void>;
  ```

- `src/mcp/tools/start.ts`: servherd_start tool handler
- `src/mcp/tools/stop.ts`: servherd_stop tool handler
- `src/mcp/tools/restart.ts`: servherd_restart tool handler
- `src/mcp/tools/list.ts`: servherd_list tool handler
- `src/mcp/tools/info.ts`: servherd_info tool handler
- `src/mcp/tools/logs.ts`: servherd_logs tool handler
- `src/mcp/tools/config.ts`: servherd_config tool handler
- `src/mcp/resources/servers.ts`: Server list and individual server resources
- `src/cli/commands/mcp.ts`: CLI command to start MCP server

**Dependencies**:
- External: @modelcontextprotocol/sdk
- Internal: All services, CLI command executors

**Verification**:
1. Run: `npm run test:unit -- --grep "mcp"`
   - Expected: All MCP tool and resource tests pass
2. Run: `npm run test:integration -- --grep "MCP"`
   - Expected: MCP server integration tests pass
3. Manual verification with MCP Inspector:
   ```bash
   npx @anthropic/mcp-inspector npx tsx src/index.ts mcp
   ```
   - Expected: Can browse tools, execute them, and see resources
---

## Try It Out!

After Phase 6 is complete, you can use servherd with LLM tools:

### Option 1: Test with MCP Inspector

```bash
# Launch the MCP Inspector UI to browse and test tools
npx @anthropic/mcp-inspector npx tsx src/index.ts mcp
```

This opens a web UI where you can:
- See all available tools (servherd_start, servherd_stop, servherd_list, etc.)
- Execute tools with custom parameters
- View server resources

### Option 2: Configure Claude Code

Add to your Claude Code MCP settings (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "servherd": {
      "command": "npx",
      "args": ["tsx", "/path/to/server-manager/src/index.ts", "mcp"]
    }
  }
}
```

Then in Claude Code, you can ask:
- "Start a Vite dev server on port {{port}}"
- "List all my running servers"
- "Stop the brave-tiger server"
- "Show me the logs for my-server"

### Option 3: Test MCP Directly via stdio

```bash
# Start MCP server in stdio mode
npx tsx src/index.ts mcp

# Send JSON-RPC requests via stdin (for debugging)
```

**What you should see**:
- Tools respond with structured JSON containing server information
- Resources provide server details and logs
- Claude Code can manage your servers conversationally

---

### Phase 7: Polish, Documentation & Release

**Objective**: Production-ready release with comprehensive documentation and CI/CD.

**Tests to Write First**:

- `test/unit/errors.test.ts`: Error handling
  ```typescript
  describe("ServherdError", () => {
    it("should include error code", () => {
      const error = new ServherdError(
        ServherdErrorCode.PORT_UNAVAILABLE,
        "Port 3000 is in use"
      );
      expect(error.code).toBe(3001);
      expect(error.message).toBe("Port 3000 is in use");
    });

    it("should include details when provided", () => {
      const error = new ServherdError(
        ServherdErrorCode.PM2_START_FAILED,
        "Failed to start",
        { exitCode: 1, stderr: "Error output" }
      );
      expect(error.details?.exitCode).toBe(1);
    });
  });
  ```

- `test/e2e/ci-mode.test.ts`: CI behavior verification
  ```typescript
  describe("CI Mode", () => {
    it("should auto-detect CI environment", async () => {
      const result = await execa("npx", ["tsx", "src/index.ts", "config", "--show"], {
        env: { CI: "true" }
      });
      // Should not prompt, should use defaults
    });

    it("should respect SERVHERD_* environment variables", async () => {
      const result = await execa("npx", ["tsx", "src/index.ts", "start", "--", "echo", "test"], {
        env: {
          CI: "true",
          SERVHERD_HOSTNAME: "ci.local",
          SERVHERD_PORT_MIN: "8000"
        }
      });
      expect(result.stdout).toContain("ci.local");
    });
  });
  ```

**Implementation**:

- `src/types/errors.ts`: ServherdError class and error codes
- `src/utils/error-handler.ts`: Global error handling and formatting
- `.github/workflows/ci.yml`: CI workflow
  ```yaml
  name: CI
  on: [push, pull_request]
  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 20
        - run: npm ci
        - run: npm run lint
        - run: npm run build
        - run: npm run test:unit
        - run: npm run test:integration
        - run: npm run test:e2e
  ```

- `.github/workflows/release.yml`: Semantic release workflow

**Documentation Files**:

- `README.md`: Primary documentation (see structure below)
- `CONTRIBUTING.md`: Contributor guidelines
- `CHANGELOG.md`: Version history (auto-generated by semantic-release)
- `LICENSE`: MIT license file
- `docs/configuration.md`: Detailed configuration reference
- `docs/mcp-integration.md`: MCP server setup and usage guide
- `docs/ci-cd.md`: CI/CD integration examples
- `examples/`: Directory with real-world usage examples

**README.md Structure**:

```markdown
# servherd

[Logo and badges - added in Phase 7]

> Herd your development servers

## Features
- Automatic port assignment with deterministic hashing
- Human-readable server names (e.g., "brave-tiger")
- Template variable substitution in commands
- PM2-powered process management
- MCP server for LLM/AI integration
- CI/CD friendly with environment variable configuration

## Quick Start

### Installation
\`\`\`bash
npm install -g servherd
\`\`\`

### Basic Usage
\`\`\`bash
# Start a server with automatic port assignment
servherd start -- npx vite --port {{port}}

# List all servers
servherd list

# Stop a server
servherd stop brave-tiger
\`\`\`

## CLI Reference

### servherd start
[Command description, options, examples]

### servherd stop
[Command description, options, examples]

### servherd list
[Command description, options, examples]

[... etc for all commands]

## Configuration

### Global Configuration
[~/.servherd/config.json structure and options]

### Environment Variables
[SERVHERD_* environment variable reference]

### Template Variables
[Available {{variables}} and their values]

## MCP Server

### Setup with Claude Code
\`\`\`json
{
  "mcpServers": {
    "servherd": {
      "command": "npx",
      "args": ["servherd", "mcp"]
    }
  }
}
\`\`\`

### Available Tools
[Brief description of each MCP tool]

## CI/CD Integration

### GitHub Actions Example
[Example workflow]

### Environment Variables for CI
[CI-specific configuration]

## API (Programmatic Usage)
[For users who want to use servherd as a library]

## Troubleshooting
[Common issues and solutions]

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md)

## License
MIT - see [LICENSE](LICENSE)
```

**CONTRIBUTING.md Structure**:

```markdown
# Contributing to servherd

## Development Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Build: `npm run build`

## Code Style
- ESLint configuration enforced
- Run `npm run lint:fix` before committing

## Testing
- Unit tests: `npm run test:unit`
- Integration tests: `npm run test:integration`
- E2E tests: `npm run test:e2e`

## Pull Request Process
1. Create a feature branch
2. Write tests for new functionality
3. Ensure all tests pass
4. Update documentation as needed
5. Submit PR with clear description

## Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation changes
- `test:` test additions/changes
- `refactor:` code refactoring
```

**docs/configuration.md Structure**:

```markdown
# Configuration Reference

## Global Configuration File
Location: `~/.servherd/config.json`

### Schema
[Full JSON schema with descriptions]

### Options

#### hostname
- Type: `string`
- Default: `"localhost"`
- Description: Default hostname for servers

#### protocol
- Type: `"http" | "https"`
- Default: `"http"`
[... etc]

## Server Registry
Location: `~/.servherd/registry.json`

[Registry structure documentation]

## Environment Variable Overrides
[Complete list of SERVHERD_* variables]
```

**docs/mcp-integration.md Structure**:

```markdown
# MCP Server Integration

## Overview
servherd exposes all CLI functionality via Model Context Protocol (MCP).

## Setup

### Claude Code
[Configuration instructions]

### Other MCP Clients
[Generic setup instructions]

## Available Tools

### servherd_start
[Full schema and examples]

### servherd_stop
[Full schema and examples]

[... etc]

## Resources

### servherd://servers
[Resource description]

### servherd://servers/{name}
[Resource description]

## Examples
[Real-world MCP usage examples]
```

**examples/ Directory**:

```
examples/
├── basic-usage/
│   └── README.md          # Simple start/stop/list examples
├── storybook/
│   ├── package.json       # Example with Storybook integration
│   └── README.md
├── vite-project/
│   ├── package.json       # Example with Vite dev server
│   └── README.md
├── multi-server/
│   └── README.md          # Managing multiple servers with tags
├── ci-github-actions/
│   └── workflow.yml       # Complete GitHub Actions example
└── mcp-claude-code/
    └── README.md          # MCP integration walkthrough
```

- Update `package.json`:
  - Add `bin` field for CLI
  - Add `files` field for publishing
  - Configure semantic-release

**Dependencies**:
- External: semantic-release, @semantic-release/git, @semantic-release/npm, @semantic-release/github
- Internal: All previous phases

**Verification**:
1. Run: `npm run lint && npm run build && npm run test`
   - Expected: All checks pass
2. Run: `npm pack --dry-run`
   - Expected: Shows correct files to be published
3. Test global installation:
   ```bash
   npm pack
   npm install -g servherd-0.1.0.tgz
   servherd --help
   servherd start --name global-test -- node -e "console.log('hello')"
   servherd list
   servherd stop global-test
   npm uninstall -g servherd
   ```
   - Expected: CLI works correctly when installed globally
---

## Try It Out!

After Phase 7 is complete, you can install servherd globally:

```bash
# Build a publishable package
npm pack

# Install globally from the tarball
npm install -g servherd-*.tgz

# Now use servherd directly (no npx tsx needed!)
servherd --help
servherd --version

# Start a server
servherd start --name my-app -- npx vite --port {{port}}

# List servers
servherd list

# Stop server
servherd stop my-app

# Uninstall when done testing
npm uninstall -g servherd
```

**What you should see**:
- `servherd` command available globally
- Same functionality as before, but as a proper CLI tool
- Help text with version number and all commands documented

---

### Phase 8: Branding & Logo

**Objective**: Create a memorable logo that evokes the "herding servers" concept, aligned with modern CLI tool aesthetics.

**Design Brief**:

The logo should convey:
- **Herding concept**: A shepherd, border collie, or pastoral scene with servers/containers instead of sheep
- **Technical sophistication**: Clean, modern lines suitable for terminal display and documentation
- **Approachability**: Friendly, not overly corporate

**Style References** (trendy CLI/dev tools):
- Bun (simple, bold, iconic mascot)
- Deno (friendly dinosaur)
- Vite (lightning bolt, gradient colors)
- Turborepo (geometric, modern)
- pnpm (warm colors, simple icon)

**Logo Concepts to Explore**:

1. **Border Collie Herding Servers**
   - A stylized border collie (the quintessential herding dog) with server/container icons
   - Could be minimal line art or filled geometric shapes

2. **Shepherd's Crook + Server**
   - A shepherd's staff/crook intertwined with a server rack or container symbol
   - Clean, iconic, works well at small sizes

3. **Server Flock**
   - Multiple server icons arranged like a flock of sheep being guided
   - Conveys the "managing multiple servers" concept directly

4. **Abstract Herd Pattern**
   - Geometric shapes suggesting movement/flow (like a murmuration)
   - Servers or dots flowing in an organized pattern

**Implementation**:

- `assets/logo.png`: Primary logo (512x512, transparent background)
- `assets/logo-small.png`: Small version for npm/terminal (128x128)
- `assets/logo.svg`: Vector version for scalability
- `assets/banner.png`: GitHub README banner (1280x640)

**Generation Process** (using Nanobanana MCP):

1. Generate initial concepts:
   ```
   Prompt: "A minimal, modern logo for a CLI tool called 'servherd' that manages
   development servers. Show a friendly border collie herding server icons instead
   of sheep. Clean vector style, suitable for terminal display. Trendy dev tool
   aesthetic like Bun or Deno logos. Transparent background."
   ```

2. Iterate on best concept with variations:
   - Color variations (monochrome for terminal, color for web)
   - Size variations to ensure readability at small sizes

3. Generate banner version:
   ```
   Prompt: "GitHub README banner for 'servherd' - a server management CLI tool.
   Wide banner format (1280x640). Include the border collie herding servers logo
   on the left, 'servherd' text in a modern sans-serif font, and tagline
   'Herd your development servers'. Modern gradient background, dev tool aesthetic."
   ```

**Verification**:

1. Visual inspection of generated assets:
   - Does the logo read well at 32x32 pixels (npm favicon)?
   - Is it recognizable in monochrome (terminal)?
   - Does it convey the "herding" concept?

2. Integration verification:
   - Add logo to README.md header
   - Verify logo displays correctly on npm package page
   - Test banner in GitHub repository

3. Nanobanana MCP validation questions (ask YES/NO):
   - "Does this image contain a dog or canine figure?"
   - "Is the image suitable for professional/technical documentation?"
   - "Does the image have a clean, minimal style?"
   - "Would this work as a small favicon (recognizable at small sizes)?"

**Files to Create**:

| File | Dimensions | Purpose |
|------|-----------|---------|
| `assets/logo.png` | 512x512 | Primary logo, transparent |
| `assets/logo-small.png` | 128x128 | npm, small displays |
| `assets/logo-mono.png` | 512x512 | Monochrome for terminal |
| `assets/logo.svg` | Vector | Scalable version |
| `assets/banner.png` | 1280x640 | GitHub README header |
| `assets/favicon.ico` | 32x32 | Web favicon |

**README Integration**:

```markdown
<p align="center">
  <img src="assets/logo.png" alt="servherd logo" width="200">
</p>

<h1 align="center">servherd</h1>

<p align="center">
  <strong>Herd your development servers</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/servherd"><img src="https://img.shields.io/npm/v/servherd.svg" alt="npm version"></a>
  <a href="https://github.com/yourusername/servherd/actions"><img src="https://github.com/yourusername/servherd/workflows/CI/badge.svg" alt="CI Status"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>
```

---

## Common Utilities Needed

| Utility | Purpose | Used In |
|---------|---------|---------|
| `src/utils/logger.ts` | Pino-based structured logging | All services and commands |
| `src/utils/ci-detector.ts` | Detect CI environment and provider | ConfigService, CLI output |
| `src/utils/template.ts` | Handlebars variable substitution | Start command, ProcessService |
| `src/utils/names.ts` | Human-readable name generation | RegistryService |
| `src/utils/error-handler.ts` | Error formatting and handling | CLI commands, MCP tools |
| `test/mocks/pm2.ts` | PM2 mock for unit tests | ProcessService tests |
| `test/mocks/fs.ts` | File system mock using memfs | ConfigService, RegistryService tests |

---

## External Libraries Assessment

| Task | Recommended Library | Rationale |
|------|---------------------|-----------|
| CLI parsing | commander | Widely used, excellent TypeScript support, feature-rich |
| Interactive prompts | @inquirer/prompts | Modern, ESM-native, tree-shakeable version of Inquirer |
| Schema validation | zod | TypeScript-first, excellent inference, runtime validation |
| Config loading | cosmiconfig | Standard for config file discovery (package.json, rc files, etc.) |
| Process management | pm2 | De facto standard for Node.js process management |
| Port detection | detect-port + get-port | detect-port checks availability, get-port finds free ports |
| Template rendering | handlebars | Lightweight, {{variable}} syntax matches design |
| Human names | human-readable-ids | Simple, provides adjective-noun pairs |
| Logging | pino | Fast, JSON logging, pino-pretty for development |
| Terminal output | chalk + boxen + ora | Standard terminal formatting libraries |
| MCP | @modelcontextprotocol/sdk | Official SDK for MCP server implementation |
| Process execution | execa | Better child process handling, TypeScript support |

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| PM2 daemon conflicts | High - could affect user's other PM2 processes | Use `servherd-` prefix for all process names; test with isolated PM2 home |
| Port collisions | Medium - servers might not start | Implement retry with port reassignment; warn user clearly |
| Config file corruption | Medium - could lose server registry | Validate with Zod before write; atomic file writes; backup before update |
| Long-running process cleanup | Medium - orphaned processes | Document cleanup procedures; provide `servherd remove --all` |
| CI mode edge cases | Low-Medium - could prompt in CI | Explicit CI detection; environment variable overrides; `--ci` flag |
| Breaking changes in dependencies | Low - could break builds | Pin major versions; use lockfile; regular dependency audits |
| MCP transport reliability | Low - could lose connection | Handle reconnection; graceful degradation; clear error messages |

---

## Test Coverage Goals

| Category | Target | Rationale |
|----------|--------|-----------|
| Statements | 80% | Core business logic coverage |
| Branches | 75% | Important edge case coverage |
| Functions | 80% | API surface coverage |
| Lines | 80% | Overall code coverage |

Priority areas for test coverage:
1. **Critical**: ConfigService, RegistryService, PortService (data integrity)
2. **High**: ProcessService, CLI commands (user-facing functionality)
3. **Medium**: MCP tools, formatters (integration points)
4. **Lower**: Utility functions, spinners (less critical)

---

## File Creation Order

For optimal implementation flow, create files in this order:

**Phase 1 (Foundation)** - COMPLETE:
1. `package.json`
2. `tsconfig.json`
3. `eslint.config.mjs`
4. `vitest.config.ts` (all three)
5. `src/types/config.ts`
6. `src/types/registry.ts`
7. `src/types/pm2.ts`
8. `src/utils/logger.ts`
9. `src/utils/ci-detector.ts`
10. Tests for above

**Phase 2 (Config & Registry)** - COMPLETE:
1. `src/utils/names.ts`
2. `src/services/config.service.ts`
3. `src/services/registry.service.ts`
4. `test/mocks/fs.ts`
5. Tests for services

**Phase 3 (Basic CLI - Start, Stop, List)**:
1. `src/utils/template.ts`
2. `src/services/port.service.ts`
3. `src/services/process.service.ts`
4. `test/mocks/pm2.ts`
5. `src/cli/output/formatters.ts`
6. `src/cli/commands/start.ts`
7. `src/cli/commands/stop.ts`
8. `src/cli/commands/list.ts`
9. `src/cli/index.ts`
10. `src/index.ts`
11. Tests for services and CLI commands

**Phase 4 (Server Info & Logs)**:
1. `src/cli/commands/info.ts`
2. `src/cli/commands/logs.ts`
3. `src/cli/commands/restart.ts`
4. Tests for new commands

**Phase 5 (Server Management - Remove & Config)**:
1. `src/cli/commands/remove.ts`
2. `src/cli/commands/config.ts`
3. Tests for new commands

**Phase 6 (MCP Server)**:
1. `src/mcp/tools/*.ts`
2. `src/mcp/resources/servers.ts`
3. `src/mcp/index.ts`
4. `src/cli/commands/mcp.ts`
5. Tests for MCP

**Phase 7 (Polish & Documentation)**:
1. `src/types/errors.ts`
2. `src/utils/error-handler.ts`
3. `.github/workflows/ci.yml`
4. `.github/workflows/release.yml`
5. `scripts/add-shebang.js`
6. `LICENSE`
7. `README.md`
8. `CONTRIBUTING.md`
9. `docs/configuration.md`
10. `docs/mcp-integration.md`
11. `docs/ci-cd.md`
12. `examples/basic-usage/README.md`
13. `examples/storybook/` (package.json + README.md)
14. `examples/vite-project/` (package.json + README.md)
15. `examples/multi-server/README.md`
16. `examples/ci-github-actions/workflow.yml`
17. `examples/mcp-claude-code/README.md`
18. Final test refinement

**Phase 8 (Branding)**:
1. `assets/logo.png` (512x512 primary logo)
2. `assets/logo-small.png` (128x128 for npm)
3. `assets/logo-mono.png` (monochrome variant)
4. `assets/logo.svg` (vector version)
5. `assets/banner.png` (1280x640 GitHub banner)
6. `assets/favicon.ico` (32x32 favicon)
7. Update `README.md` with logo and badges

---

## Try It Out!

After Phase 8 is complete, verify the branding looks good:

```bash
# View the README on GitHub (or locally with a markdown preview)
# Check that:
# - Logo displays correctly at the top
# - Banner looks good
# - Badges show correct status

# Test logo at different sizes in browser
open assets/logo.png
open assets/logo-small.png
open assets/banner.png

# Verify favicon works (if applicable)
```

**What you should see**:
- A distinctive border collie or shepherd-themed logo
- Logo is recognizable even at small sizes (32x32)
- Banner looks professional on GitHub README
- Consistent branding across all assets
