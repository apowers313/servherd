# Feature Design: Missing Features from Original Design

## Overview
- **User Value**: Enhanced CLI usability, better error handling, improved CI/CD integration, and more robust server management capabilities
- **Technical Value**: Feature parity with design specification, improved maintainability through additional tooling, better operational control

## Requirements

Reviewing `design/server-manager-design.md`, the current implementation is missing several key features. This document categorizes and designs the implementation approach for each.

### Gap Analysis Summary

| Category | Missing Features | Priority |
|----------|-----------------|----------|
| CLI Options | `--json`, `--port` override, `--follow`, `--force`, `--stopped`, `--since`, `--head`, `--flush` | High |
| HTTPS Support | Certificate configuration and HTTPS protocol handling | Medium |
| Port Management | Availability checking, conflict resolution with fallback | High |
| Interactive Config | Configuration wizard with @inquirer/prompts | Low |
| CI Mode | Behavioral differences (in-memory registry, sequential ports) | Medium |
| Tooling | husky, commitlint, knip | Low |

---

## Proposed Solutions

### 1. CLI Options Enhancement

#### 1.1 JSON Output (`--json` flag)

**User Interface/API**:
```bash
servherd list --json
servherd info <name> --json
servherd start --json -- <command>
```

**Technical Architecture**:
- **Components**: Modify `src/cli/output/formatters.ts` to support JSON output mode
- **Data Model**: No changes needed - existing result types are JSON-serializable
- **Integration Points**: Add `--json` option to `list`, `info`, `start`, `stop`, `restart`, `remove` commands

**Implementation Approach**:
1. Add global `--json` option to commander program in `src/cli/index.ts`
2. Pass `json` flag through options to action handlers
3. Modify formatters to conditionally output JSON vs. human-readable format
4. Ensure all execute functions return structured data suitable for JSON serialization

**Code Changes**:
```typescript
// src/cli/index.ts
program.option('--json', 'Output results as JSON');

// src/cli/commands/list.ts
export async function listAction(options: ListOptions): Promise<void> {
  const result = await executeList(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    formatListResult(result);
  }
}
```

#### 1.2 Port Override (`--port` flag for start)

**User Interface/API**:
```bash
servherd start --port 8080 -- npm start --port {{port}}
```

**Technical Architecture**:
- **Components**: Modify `src/cli/commands/start.ts`
- **Data Model**: Add `port` to `StartOptions` interface
- **Integration Points**: Override `PortService.assignPort()` when explicit port provided

**Implementation Approach**:
1. Add `--port, -p <port>` option to start command
2. Validate port is within configured range
3. Skip deterministic port generation when explicit port provided
4. Check availability of specified port before use

#### 1.3 Follow Logs (`--follow` flag)

**User Interface/API**:
```bash
servherd logs <name> --follow
servherd logs <name> -f
```

**Technical Architecture**:
- **Components**: New `src/utils/log-follower.ts` utility
- **Data Model**: None
- **Integration Points**: `src/cli/commands/logs.ts`

**Implementation Approach**:
1. Create log follower utility using `fs.watch()` or `chokidar`
2. Implement streaming output with proper signal handling (SIGINT to stop)
3. Add `--follow, -f` option to logs command
4. Stream new lines as they appear in PM2 log files

**Code Example**:
```typescript
// src/utils/log-follower.ts
import { watch } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export async function followLog(logPath: string, signal: AbortSignal): Promise<void> {
  let position = 0;

  const readNewLines = async () => {
    const stream = createReadStream(logPath, { start: position });
    const rl = createInterface({ input: stream });

    for await (const line of rl) {
      console.log(line);
    }
    position = (await stat(logPath)).size;
  };

  const watcher = watch(logPath, async (eventType) => {
    if (eventType === 'change') {
      await readNewLines();
    }
  });

  signal.addEventListener('abort', () => watcher.close());
  await readNewLines();
}
```

#### 1.4 Force Stop (`--force` flag)

**User Interface/API**:
```bash
servherd stop <name> --force
servherd stop -f <name>
```

**Technical Architecture**:
- **Components**: Modify `src/services/process.service.ts`
- **Integration Points**: `src/cli/commands/stop.ts`

**Implementation Approach**:
1. Add `--force, -f` option to stop command
2. Implement force stop using PM2's `delete` with `force: true` option
3. Handle SIGKILL for processes that don't respond to SIGTERM

#### 1.5 Additional List Filters (`--stopped` flag)

**User Interface/API**:
```bash
servherd list --stopped
servherd list --running  # already implemented
```

**Technical Architecture**:
- **Components**: Modify `src/cli/commands/list.ts`
- **Integration Points**: `RegistryService.listServers()`

**Implementation Approach**:
1. Add `--stopped` option to list command
2. Filter servers where status is 'stopped' or 'offline'

#### 1.6 Log Time Filters (`--since`, `--head` flags)

**User Interface/API**:
```bash
servherd logs <name> --since 1h
servherd logs <name> --since "2024-01-15"
servherd logs <name> --head 20
```

**Technical Architecture**:
- **Components**: Modify `src/cli/commands/logs.ts`, new `src/utils/log-parser.ts`
- **Integration Points**: Log reading logic

**Implementation Approach**:
1. Add `--since <time>` option supporting duration strings (1h, 30m) and ISO dates
2. Add `--head <n>` option for reading from beginning
3. Parse timestamps from PM2 log format to filter by time
4. Implement time parsing utility for human-readable durations

#### 1.7 Flush Logs (`--flush` flag)

**User Interface/API**:
```bash
servherd logs <name> --flush
servherd logs --flush --all
```

**Technical Architecture**:
- **Components**: Modify `src/cli/commands/logs.ts`, extend `src/services/process.service.ts`
- **Integration Points**: ProcessService, MCP logs tool

**Implementation Approach**:
1. Add `flush()` method to ProcessService wrapping `pm2.flush()`
2. Add `--flush` flag to logs command
3. When `--flush` is provided, clear logs instead of displaying them
4. Support `--all` flag combination to flush all server logs
5. Update MCP logs tool to support flush operation

**Code Example**:
```typescript
// src/cli/commands/logs.ts
logsCommand
  .option('--flush', 'Clear logs instead of displaying them')
  .action(async (name, options) => {
    if (options.flush) {
      if (options.all) {
        await processService.flushAll();
        console.log('✓ All server logs cleared');
      } else {
        await processService.flush(name);
        console.log(`✓ Logs cleared for ${name}`);
      }
      return;
    }
    // ... existing log display logic
  });

// src/services/process.service.ts
async flush(name: string): Promise<void> {
  await this.connect();
  return new Promise((resolve, reject) => {
    pm2.flush(this.getPm2Name(name), (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
```

---

### 2. HTTPS Configuration Support

**User Interface/API**:
```bash
servherd config set protocol https
servherd config set httpsCert /path/to/cert.pem
servherd config set httpsKey /path/to/key.pem

servherd start --protocol https -- npm start
```

**Technical Architecture**:
- **Components**:
  - Modify `src/types/config.ts` to add HTTPS fields
  - Modify `src/services/config.service.ts` for HTTPS handling
  - Modify `src/utils/template.ts` for new template variables
- **Data Model**:
  ```typescript
  interface GlobalConfig {
    // ... existing fields
    httpsCert?: string;  // Path to certificate
    httpsKey?: string;   // Path to key file
  }
  ```
- **Integration Points**: Template rendering, URL generation

**Implementation Approach**:
1. Add `httpsCert` and `httpsKey` to GlobalConfig schema
2. Add validation for certificate/key file existence
3. Add `{{https-cert}}` and `{{https-key}}` template variables
4. Modify URL generation to use `https://` when protocol is https
5. Add `--protocol` option to start command

**Code Changes**:
```typescript
// src/types/config.ts
export const GlobalConfigSchema = z.object({
  // ... existing
  httpsCert: z.string().optional(),
  httpsKey: z.string().optional(),
});

// src/utils/template.ts
export function getTemplateVariables(config: GlobalConfig, port: number): TemplateVariables {
  return {
    port,
    hostname: config.hostname,
    protocol: config.protocol,
    url: `${config.protocol}://${config.hostname}:${port}`,
    'https-cert': config.httpsCert ?? '',
    'https-key': config.httpsKey ?? '',
    // ...
  };
}
```

---

### 3. Port Availability Checking and Conflict Resolution

**User Interface/API**:
Automatic - no user interaction required. User sees:
```
⚠ Port 6123 unavailable, reassigning to 6124
✓ Server started: brave-tiger
  URL: http://localhost:6124
```

**Technical Architecture**:
- **Components**:
  - Modify `src/services/port.service.ts`
  - Add dependencies: `detect-port` or `get-port`
- **Data Model**: No changes
- **Integration Points**: Start command flow

**Implementation Approach**:
1. Install `detect-port` package (already in design spec)
2. Add `isPortAvailable(port: number): Promise<boolean>` method
3. Add `getAvailablePort(preferred: number): Promise<number>` method
4. Modify start flow:
   - Generate deterministic port
   - Check if available
   - If not, check if it's our server (by PM2 name) → consider running
   - If not our server, find next available port
   - Warn user about reassignment
5. Update registry with actual assigned port

**Code Changes**:
```typescript
// src/services/port.service.ts
import detectPort from 'detect-port';

export class PortService {
  async isPortAvailable(port: number): Promise<boolean> {
    const available = await detectPort(port);
    return available === port;
  }

  async getAvailablePort(preferred: number): Promise<{ port: number; reassigned: boolean }> {
    if (await this.isPortAvailable(preferred)) {
      return { port: preferred, reassigned: false };
    }

    // Find next available in range
    const available = await detectPort(preferred);
    if (available >= this.config.portRange.min && available <= this.config.portRange.max) {
      return { port: available, reassigned: true };
    }

    throw new ServherdError(
      ServherdErrorCode.NO_PORTS_AVAILABLE,
      'No ports available in configured range'
    );
  }
}
```

---

### 4. Interactive Configuration Wizard

**User Interface/API**:
```bash
servherd config  # Launches interactive wizard
```

**Technical Architecture**:
- **Components**:
  - Modify `src/cli/commands/config.ts`
  - Add dependency: `@inquirer/prompts`
- **Integration Points**: ConfigService

**Implementation Approach**:
1. Install `@inquirer/prompts` package
2. Create interactive prompts for:
   - Default hostname
   - Default protocol (http/https)
   - HTTPS certificate path (conditional on https)
   - HTTPS key path (conditional on https)
   - Port range (min/max)
3. Validate inputs before saving
4. Skip wizard in CI mode (use `--show` or `set` subcommands)

**Code Example**:
```typescript
// src/cli/commands/config.ts
import { input, select, confirm } from '@inquirer/prompts';

async function runConfigWizard(): Promise<void> {
  if (isCI()) {
    console.error('Interactive config not available in CI mode. Use "servherd config set <key> <value>"');
    process.exit(1);
  }

  const hostname = await input({
    message: 'Default hostname:',
    default: 'localhost',
  });

  const protocol = await select({
    message: 'Default protocol:',
    choices: [
      { name: 'HTTP', value: 'http' },
      { name: 'HTTPS', value: 'https' },
    ],
  });

  let httpsCert: string | undefined;
  let httpsKey: string | undefined;

  if (protocol === 'https') {
    httpsCert = await input({
      message: 'Path to HTTPS certificate:',
      validate: (path) => existsSync(path) || 'File not found',
    });
    httpsKey = await input({
      message: 'Path to HTTPS key:',
      validate: (path) => existsSync(path) || 'File not found',
    });
  }

  const portMin = await input({
    message: 'Minimum port:',
    default: '3000',
    validate: (v) => !isNaN(parseInt(v)) || 'Must be a number',
  });

  const portMax = await input({
    message: 'Maximum port:',
    default: '9999',
    validate: (v) => !isNaN(parseInt(v)) || 'Must be a number',
  });

  // Save configuration
  await configService.save({
    hostname,
    protocol,
    httpsCert,
    httpsKey,
    portRange: { min: parseInt(portMin), max: parseInt(portMax) },
  });

  console.log('✓ Configuration saved');
}
```

---

### 5. CI Mode Behavioral Differences

**User Interface/API**:
```bash
servherd start --ci -- npm start  # Force CI mode
# Or automatic detection via environment variables
```

**Technical Architecture**:
- **Components**:
  - Enhance `src/utils/ci-detector.ts` (already exists)
  - Modify services to check CI mode
- **Behavioral Changes**:

| Feature | Interactive Mode | CI Mode |
|---------|-----------------|---------|
| Config prompts | Interactive wizard | Error with guidance |
| Missing variables | Prompt user | Use defaults or error |
| Registry persistence | Write to file | ✓ Write to file (keep same) |
| Port strategy | Hash + availability | Sequential from min |
| Color output | Enabled | Respect NO_COLOR/CI |

**Implementation Approach**:
1. Add `--ci` flag to commands that might prompt
2. Modify ConfigService to error instead of prompt in CI mode
3. Add sequential port allocation strategy for CI:
   ```typescript
   if (isCI()) {
     return this.getNextSequentialPort();
   }
   return this.generateDeterministicPort(cwd, command);
   ```
4. Disable colors when `process.env.NO_COLOR` or `process.env.CI` is set

**Code Changes**:
```typescript
// src/services/port.service.ts
async assignPort(cwd: string, command: string, ciMode: boolean): Promise<number> {
  if (ciMode) {
    // Sequential allocation in CI for predictability
    return this.getNextAvailableSequential();
  }
  // Deterministic hash-based allocation
  const preferred = this.generatePort(cwd, command);
  const { port } = await this.getAvailablePort(preferred);
  return port;
}

private async getNextAvailableSequential(): Promise<number> {
  const usedPorts = new Set(this.registry.servers.map(s => s.port));
  for (let port = this.config.portRange.min; port <= this.config.portRange.max; port++) {
    if (!usedPorts.has(port) && await this.isPortAvailable(port)) {
      return port;
    }
  }
  throw new ServherdError(ServherdErrorCode.NO_PORTS_AVAILABLE, 'No ports available');
}
```

---

### 6. Additional Tooling

#### 6.1 Husky, Commitlint & Commitizen

**Reference Implementation**: Copy configuration from `../flexi-human-hash` which has a working setup.

**Technical Architecture**:
- **Components**: Git hooks configuration
- **Dependencies**:
  - `husky` - Git hooks manager
  - `@commitlint/cli` - Commit message linter
  - `@commitlint/config-conventional` - Conventional commits preset
  - `commitizen` - Interactive commit message wizard
  - `cz-conventional-changelog` - Commitizen adapter
  - `conventional-changelog-conventionalcommits` - Parser preset

**Implementation Approach**:
1. Install dependencies as devDependencies:
   ```bash
   npm install -D husky @commitlint/cli @commitlint/config-conventional \
     commitizen cz-conventional-changelog conventional-changelog-conventionalcommits
   ```
2. Initialize husky:
   ```bash
   npx husky init
   ```
3. Copy hook files from `../flexi-human-hash/.husky/`
4. Copy and adapt `commitlint.config.js`

**Configuration Files** (from flexi-human-hash):

```javascript
// commitlint.config.js
export default {
    parserPreset: "conventional-changelog-conventionalcommits",
    rules: {
        "body-leading-blank": [1, "always"],
        "body-max-line-length": [2, "always", 100],
        "footer-leading-blank": [1, "always"],
        "footer-max-line-length": [2, "always", 100],
        "header-max-length": [2, "always", 100],
        "scope-case": [2, "always", "lower-case"],
        "scope-enum": [2, "always", [
            "cli",
            "mcp",
            "services",
            "types",
            "utils",
            "test",
            "ci",
            "docs",
            "deps",
        ]],
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

```bash
# .husky/commit-msg
npx --no-install commitlint --edit "$1"
```

```bash
# .husky/prepare-commit-msg (interactive commitizen wizard)
exec < /dev/tty && npx cz --hook || true
```

```bash
# .husky/pre-push (run lint and tests before push)
npm run lint
npm test
```

#### 6.2 Knip (Dead Code Detection)

**Technical Architecture**:
- **Dependency**: `knip`
- **Script**: `npm run knip`

**Implementation Approach**:
1. Install knip as devDependency
2. Add script to package.json
3. Create `knip.json` configuration

**Configuration**:
```json
// knip.json
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "entry": ["src/index.ts"],
  "project": ["src/**/*.ts"],
  "ignore": ["**/*.test.ts", "test/**"],
  "ignoreDependencies": ["@types/*"]
}
```

---

## Acceptance Criteria

### CLI Options
- [ ] `--json` flag outputs valid JSON for list, info, start, stop, restart, remove commands
- [ ] `--port` flag overrides deterministic port assignment
- [ ] `--follow` streams new log lines until SIGINT
- [ ] `--force` sends SIGKILL to unresponsive processes
- [ ] `--stopped` filters list to stopped servers only
- [ ] `--since` filters logs by time (duration and ISO date formats)
- [ ] `--head` shows first N lines of logs
- [ ] `--flush` clears logs for specified server (or all with `--all`)

### HTTPS Support
- [ ] Can configure httpsCert and httpsKey in global config
- [ ] `{{https-cert}}` and `{{https-key}}` template variables work
- [ ] URLs correctly show `https://` when protocol is https
- [ ] Certificate file existence is validated on config save

### Port Management
- [ ] Port availability is checked before starting server
- [ ] Conflict resolution finds next available port automatically
- [ ] User is warned when port is reassigned
- [ ] Registry is updated with actual assigned port

### Interactive Config
- [ ] `servherd config` (no args) launches interactive wizard
- [ ] Wizard prompts for hostname, protocol, certs (if https), port range
- [ ] Wizard is skipped in CI mode with helpful error message
- [ ] All inputs are validated before saving

### CI Mode
- [ ] `--ci` flag forces CI mode behavior
- [ ] CI environment is auto-detected from standard env vars
- [ ] No interactive prompts in CI mode
- [ ] Sequential port allocation in CI mode
- [ ] Colors disabled when NO_COLOR or CI is set

### Tooling
- [ ] Husky hooks installed and working
- [ ] Commitlint validates conventional commit format
- [ ] Commitizen wizard launches on `git commit`
- [ ] Pre-push hook runs lint and tests
- [ ] Knip runs without reporting false positives

---

## Technical Considerations

### Performance
- **Port checking**: `detect-port` is fast (~10ms per check), minimal impact
- **Log following**: Uses file watching, not polling - low CPU usage

### Security
- **HTTPS cert/key**: Store paths only, not contents; validate file existence
- **No secrets in registry**: Certificate contents never stored
- **Path validation**: Certificate paths validated against filesystem

### Compatibility
- **Backward compatibility**: All new CLI options are additive
- **Config migration**: New config fields are optional with sensible defaults
- **Registry unchanged**: No breaking changes to registry format

### Testing
- **Unit tests**: Port service availability checking, CI detection
- **Integration tests**: Log flush command, log following
- **E2E tests**: Full workflow with --json output, HTTPS configuration

---

## Risks and Mitigation

### Risk: Port checking race condition
**Description**: Port could become unavailable between check and server start
**Mitigation**: Accept this minor race; PM2 will error on bind failure and we retry with next port

### Risk: Log following memory leak
**Description**: Long-running log follow could accumulate resources
**Mitigation**: Proper cleanup on SIGINT; use streams not buffers; clear watcher on exit

### Risk: HTTPS certificate validation complexity
**Description**: Different certificate formats (PEM, DER, etc.) may cause issues
**Mitigation**: Document supported formats (PEM only); validate file is readable

### Risk: CI mode breaks user workflows
**Description**: Auto-detection might incorrectly trigger CI mode
**Mitigation**: Explicit `--ci` flag overrides auto-detection; `--no-ci` to force interactive

### Risk: Husky hooks break developer workflow
**Description**: Strict commitlint rules frustrate contributors
**Mitigation**: Use `--no-verify` escape hatch; document in CONTRIBUTING.md; start with warnings only

---

## Future Enhancements

Building on these features, future work could include:

1. **Server groups**: `servherd group create frontend --servers app,storybook,docs`
2. **Health checks**: `--health-check http://localhost:{{port}}/health`
3. **Auto-restart policies**: `--restart-on-failure --max-restarts 3`
4. **Web dashboard**: Browser UI at `http://localhost:9000/dashboard`
5. **Remote management**: `servherd --remote user@host list`
6. **Docker integration**: `servherd start --docker -- docker run nginx`
7. **Plugin system**: Custom server type handlers

---

## Implementation Estimate

Implementation is recommended in phases:

### Phase 1: CLI Options (High Priority)
- `--json` output: 1 day
- `--port` override: 0.5 days
- `--force` stop: 0.5 days
- `--stopped` filter: 0.5 days
- Log filters (`--since`, `--head`): 1 day
- `--follow` logs: 1.5 days
- `--flush` logs: 0.5 days
- **Subtotal**: 5.5 days

### Phase 2: Port Management (High Priority)
- Port availability checking: 1 day
- Conflict resolution: 1 day
- **Subtotal**: 2 days

### Phase 3: HTTPS & CI Mode (Medium Priority)
- HTTPS configuration: 1.5 days
- CI mode enhancements: 1.5 days
- **Subtotal**: 3 days

### Phase 4: Interactive Config & Tooling (Lower Priority)
- Interactive wizard: 1.5 days
- Husky/commitlint: 0.5 days
- Knip: 0.5 days
- **Subtotal**: 2.5 days

### Testing (All Phases)
- Unit tests: 2 days
- Integration tests: 2 days
- E2E tests: 1.5 days
- **Subtotal**: 5.5 days

---

**Total Estimate**: 18.5 days

**Recommended Implementation Order**:
1. Phase 1 + Phase 2 (CLI Options + Port Management) - Core usability
2. Phase 3 (HTTPS + CI) - Production readiness
3. Phase 4 (Config Wizard + Tooling) - Developer experience
