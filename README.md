<p align="center">
  <img src="assets/logo.png" alt="servherd logo" width="180">
</p>

<h1 align="center">servherd</h1>

<p align="center">
  <strong>Herd your development servers</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/servherd"><img src="https://img.shields.io/npm/v/servherd.svg" alt="npm version"></a>
  <a href="https://github.com/apowers313/servherd/actions/workflows/ci.yml"><img src="https://github.com/apowers313/servherd/actions/workflows/ci.yml/badge.svg" alt="CI Status"></a>
  <a href="https://coveralls.io/github/apowers313/servherd?branch=master"><img src="https://coveralls.io/repos/github/apowers313/servherd/badge.svg?branch=master" alt="Coverage"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

## The Problem

When doing AI-driven development across multiple projects, each of which can have multiple git worktrees and multiple development servers (Vite, VitePress, Storybook, logging servers, etc.), you quickly run into resource conflicts:

- **Port collisions**: Multiple servers fighting for the same ports
- **Wasted AI time**: Your AI assistant spends cycles hunting for available ports instead of coding
- **Wrong server errors**: The AI connects to the wrong server instance, causing confusing bugs and failed requests
- **Lost context**: No easy way to track which servers are running where across your development environment

## The Solution

**servherd** manages your herd of development servers for AI-driven development. It provides deterministic port assignment, human-readable server names, and an MCP interface so your AI assistant always knows exactly which servers are running and how to reach them.

## Key Features

### Powered by PM2

servherd uses [PM2](https://pm2.keymetrics.io) under the hood for robust process management:

- **Reliable background operation** - Servers run as managed daemon processes
- **Automatic restarts** - Crashed servers can be automatically restarted
- **Log management** - Centralized logging with rotation support
- **Resource monitoring** - Track CPU and memory usage per server
- **Full lifecycle control** - Start, stop, restart, and remove servers with ease

### Intelligent Port Management

- **Deterministic port assignment** - Same project + command always gets the same port
- **Automatic conflict resolution** - If a port is busy, servherd finds the next available one
- **Port availability checking** - Verifies ports are free before starting servers
- **Configurable port ranges** - Define your own port range (default: 3000-9999)

### Developer Experience

- **Human-readable server names** - Auto-generated names like "brave-tiger" or "calm-panda"
- **Template variable substitution** - Use `{{port}}`, `{{hostname}}`, `{{url}}` in commands
- **Environment variable templating** - Pass dynamic values with `-e PORT={{port}}`
- **JSON output mode** - Machine-readable output with `--json` for scripting
- **CI/CD friendly** - Automatic CI detection with non-interactive mode

### AI Integration

- **MCP server** - Native integration with Claude Code and other MCP-compatible tools
- **Resource discovery** - AI can query running servers and their status
- **Log access** - AI can read server logs for debugging

## Quick Start

### Installation

```bash
npm install -g servherd
```

### Replace Your npm Scripts

Instead of hunting for available ports, let servherd manage them:

```bash
# Before: Hardcoded port that might conflict
npm run dev

# After: Automatic port assignment with servherd
npx servherd start -- npm run dev -- --port {{port}}
```

### Basic Usage

```bash
# Start a server with automatic port assignment
servherd start -- npx vite --port {{port}}

# Start with a custom name
servherd start --name my-app -- npm run dev -- --port {{port}}

# List all servers
servherd list

# View server details
servherd info my-app

# View server logs
servherd logs my-app

# Follow logs in real-time
servherd logs my-app --follow

# Stop a server
servherd stop my-app

# Stop all servers
servherd stop --all
```

## Development Tool Examples

### Vite

[Vite](https://vite.dev) accepts the port via `--port` flag:

```bash
# Using CLI flag
servherd start --name my-vite-app -- npx vite --port {{port}}

# Using environment variable in vite.config.js
servherd start --name my-vite-app -e VITE_PORT={{port}} -- npx vite
```

In your `vite.config.js`:
```javascript
export default defineConfig({
  server: {
    port: parseInt(process.env.VITE_PORT) || 5173,
  },
})
```

### VitePress

[VitePress](https://vitepress.dev) uses the `--port` flag:

```bash
servherd start --name my-docs -- npx vitepress dev docs --port {{port}}
```

### Storybook

[Storybook](https://storybook.js.org) accepts the port via `-p` flag:

```bash
servherd start --name my-stories -- npx storybook dev -p {{port}}
```

### Next.js

[Next.js](https://nextjs.org) uses the `-p` or `--port` flag:

```bash
# Development server
servherd start --name my-next-app -- npx next dev -p {{port}}

# Production server
servherd start --name my-next-prod -- npx next start -p {{port}}
```

### Webpack Dev Server

[Webpack Dev Server](https://webpack.js.org/configuration/dev-server/) accepts `--port`:

```bash
servherd start --name my-webpack-app -- npx webpack serve --port {{port}}
```

### Create React App

[Create React App](https://create-react-app.dev) reads the `PORT` environment variable:

```bash
servherd start --name my-react-app -e PORT={{port}} -- npm start
```

### Express / Node.js Servers

For custom Node.js servers, pass the port as an environment variable:

```bash
servherd start --name my-api -e PORT={{port}} -- node server.js
```

In your `server.js`:
```javascript
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
```

### Python (Flask/FastAPI)

```bash
# Flask
servherd start --name my-flask -e FLASK_RUN_PORT={{port}} -- flask run

# FastAPI with Uvicorn
servherd start --name my-fastapi -- uvicorn main:app --port {{port}}
```

## Cross-Server Communication

When running multiple servers (like a frontend and backend), you often need one server to know the port of another. The `{{$ ...}}` helper looks up properties from other running servers.

### Basic Syntax

```bash
# Positional arguments: {{$ "server-name" "property"}}
{{$ "backend" "port"}}

# Named arguments (more explicit)
{{$ service="backend" prop="port"}}

# With aliases
{{$ svc="backend" property="port"}}

# Explicit working directory (for cross-project lookups)
{{$ service="backend" prop="port" cwd="/path/to/project"}}
```

### Available Properties

| Property | Description | Example |
|----------|-------------|---------|
| `port` | Server's assigned port | `9042` |
| `url` | Full URL | `http://localhost:9042` |
| `name` | Server name | `backend` |
| `hostname` | Configured hostname | `localhost` |
| `protocol` | Protocol (http/https) | `http` |

### Frontend + Backend Example

Start a backend API server, then a frontend that connects to it:

```bash
# Start backend first
servherd start -n backend -e 'PORT={{port}}' -- node server.js

# Start frontend with reference to backend's port
servherd start -n frontend \
  -e 'PORT={{port}}' \
  -e 'API_URL=http://localhost:{{$ "backend" "port"}}' \
  -- npm run dev
```

The frontend's `API_URL` will be set to the backend's actual port (e.g., `http://localhost:9042`).

### npm Scripts Example

In your `package.json`, use single quotes inside double quotes to avoid escaping issues:

```json
{
  "scripts": {
    "start:backend": "servherd start -n backend -e 'PORT={{port}}' -- node server.js",
    "start:frontend": "servherd start -n frontend -e 'PORT={{port}}' -e 'API_URL=http://localhost:{{$ \"backend\" \"port\"}}' -- npm run dev",
    "stop": "servherd stop --all"
  }
}
```

**Quoting tips for npm scripts:**
- Wrap `-e` values in single quotes: `-e 'VAR={{value}}'`
- Use escaped double quotes inside for `$` helper arguments: `{{$ \"name\" \"prop\"}}`
- Both `{{$ "x" "y"}}` and `{{$ 'x' 'y'}}` work in Handlebars, but single quotes are easier in JSON

### Important Notes

1. **Start order matters** - The referenced server must be running before you start the dependent server
2. **Same working directory** - By default, lookups are scoped to servers in the same working directory (same git worktree)
3. **Error on missing** - If the referenced server doesn't exist, the start command will fail with a clear error message
4. **Cross-project lookups** - Use the `cwd` parameter to reference servers in other directories

## CLI Reference

### Global Options

These options can be used with any command:

| Option | Description |
|--------|-------------|
| `--json` | Output results as JSON |
| `--ci` | Force CI mode behavior |
| `--no-ci` | Force non-CI mode (override CI detection) |

### `servherd start`

Start a new development server or return an existing one.

```bash
servherd start [options] -- <command>
```

**Options:**
| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Custom server name (auto-generated if not provided) |
| `-p, --port <port>` | Override the deterministic port assignment |
| `--protocol <protocol>` | Protocol to use: `http` or `https` |
| `-t, --tag <tag...>` | Tags for grouping servers (can use multiple times) |
| `-d, --description <text>` | Description of the server |
| `-e, --env <KEY=VALUE...>` | Environment variables (supports templates) |

**Template Variables:**
| Variable | Description | Example |
|----------|-------------|---------|
| `{{port}}` | Assigned port number | `8080` |
| `{{hostname}}` | Configured hostname | `localhost` |
| `{{url}}` | Full URL | `http://localhost:8080` |
| `{{https-cert}}` | HTTPS certificate path | `/path/to/cert.pem` |
| `{{https-key}}` | HTTPS key path | `/path/to/key.pem` |
| `{{$ "name" "prop"}}` | Look up property from another server | `{{$ "backend" "port"}}` |

**Examples:**
```bash
# Start with automatic name and port
servherd start -- npx vite --port {{port}}

# Start with custom name and tags
servherd start --name frontend --tag web --tag dev -- npm run dev -- --port {{port}}

# Start with environment variables
servherd start --name api -e PORT={{port}} -e NODE_ENV=development -- node server.js

# Start on a specific port
servherd start --name fixed-port --port 8080 -- npx vite --port {{port}}
```

### `servherd stop`

Stop one or more running servers.

```bash
servherd stop [name] [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `-a, --all` | Stop all managed servers |
| `-t, --tag <tag>` | Stop all servers with this tag |
| `-f, --force` | Force stop using SIGKILL |

**Examples:**
```bash
# Stop by name
servherd stop brave-tiger

# Stop all servers
servherd stop --all

# Force stop a hung server
servherd stop my-server --force

# Stop all servers with a tag
servherd stop --tag frontend
```

### `servherd list`

List all managed servers.

```bash
servherd list [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `-r, --running` | Show only running servers |
| `-s, --stopped` | Show only stopped servers |
| `-t, --tag <tag>` | Filter by tag |
| `-c, --cwd <path>` | Filter by working directory |
| `--cmd <pattern>` | Filter by command pattern (glob syntax) |

**Command Pattern Examples:**
```bash
# Find all Storybook servers
servherd list --cmd "*storybook*"

# Find all Vite servers
servherd list --cmd "*vite*"

# Find servers using npm
servherd list --cmd "npm *"

# Find Vite or Storybook servers (brace expansion)
servherd list --cmd "*{vite,storybook}*"

# Combine with other filters
servherd list --cmd "*storybook*" --running --tag frontend
```

### `servherd info`

Show detailed information about a server.

```bash
servherd info <name>
```

**Displays:**
- Server name and status
- Port and URL
- Working directory and command
- Process ID and uptime
- Memory and CPU usage
- Tags and description

### `servherd logs`

View and manage server logs.

```bash
servherd logs [name] [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `-n, --lines <number>` | Number of lines to show from end (default: 50) |
| `-e, --error` | Show error logs instead of stdout |
| `-f, --follow` | Follow logs in real-time (like `tail -f`) |
| `--since <time>` | Show logs since time (e.g., `1h`, `30m`, `2024-01-15`) |
| `--head <number>` | Show first N lines instead of last |
| `--flush` | Clear logs instead of displaying |
| `-a, --all` | Apply to all servers (with `--flush`) |

**Examples:**
```bash
# View last 50 lines (default)
servherd logs my-app

# View last 100 lines
servherd logs my-app --lines 100

# Follow logs in real-time
servherd logs my-app --follow

# Show logs from the last hour
servherd logs my-app --since 1h

# Show logs since a specific date
servherd logs my-app --since 2024-01-15

# Show first 20 lines
servherd logs my-app --head 20

# View error logs
servherd logs my-app --error

# Clear logs for a server
servherd logs my-app --flush

# Clear logs for all servers
servherd logs --flush --all
```

### `servherd restart`

Restart a running server.

```bash
servherd restart [name] [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `-a, --all` | Restart all servers |
| `-t, --tag <tag>` | Restart servers with this tag |

### `servherd remove`

Remove servers from the registry and stop them.

```bash
servherd remove [name] [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `-a, --all` | Remove all servers |
| `-t, --tag <tag>` | Remove servers with this tag |
| `-f, --force` | Skip confirmation prompt |

### `servherd config`

View or modify configuration.

```bash
servherd config [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `-s, --show` | Display all configuration values |
| `-g, --get <key>` | Get a specific configuration value |
| `--set <key>` | Set a configuration value (requires `--value`) |
| `--value <value>` | Value to set |
| `-r, --reset` | Reset configuration to defaults |

**Examples:**
```bash
# Show all configuration
servherd config --show

# Get specific value
servherd config --get hostname

# Set hostname
servherd config --set hostname --value myhost.local

# Set port range
servherd config --set portRange.min --value 4000
servherd config --set portRange.max --value 5000

# Configure HTTPS
servherd config --set protocol --value https
servherd config --set httpsCert --value /path/to/cert.pem
servherd config --set httpsKey --value /path/to/key.pem

# Reset to defaults
servherd config --reset
```

### `servherd mcp`

Start the MCP (Model Context Protocol) server.

```bash
servherd mcp
```

This starts an MCP server over stdio for integration with AI tools.

## MCP Server Integration

### Setup with Claude Code

The easiest way to add servherd to Claude Code is using the `claude mcp add` command:

```bash
claude mcp add servherd -- npx servherd mcp
```

This registers servherd as an MCP server that Claude Code can use to manage your development servers.

**With a specific scope:**
```bash
# Add for current project only
claude mcp add --scope project servherd -- npx servherd mcp

# Add for current user (all projects)
claude mcp add --scope user servherd -- npx servherd mcp
```

**Alternative: Manual configuration**

Add to your MCP settings file (`~/.claude/claude_desktop_config.json`):

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

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `servherd_start` | Start a development server |
| `servherd_stop` | Stop a server |
| `servherd_restart` | Restart a server |
| `servherd_list` | List all servers (supports filtering by tag, cwd, cmd pattern) |
| `servherd_info` | Get server details |
| `servherd_logs` | View server logs |
| `servherd_remove` | Remove a server |
| `servherd_config` | View/modify configuration |
| `servherd_refresh` | Refresh servers with config drift |

**`servherd_list` Parameters:**
- `running` (boolean) - Only show running servers
- `tag` (string) - Filter by tag
- `cwd` (string) - Filter by working directory
- `cmd` (string) - Filter by command pattern (glob syntax, e.g., `*storybook*`)

### MCP Resources

| Resource | Description |
|----------|-------------|
| `servherd://servers/{name}` | Server details as JSON |
| `servherd://servers/{name}/logs` | Server output logs |

## Configuration

### Global Configuration File

Location: `~/.servherd/config.json`

```json
{
  "version": "1",
  "hostname": "localhost",
  "protocol": "http",
  "portRange": {
    "min": 3000,
    "max": 9999
  },
  "httpsCert": "/path/to/cert.pem",
  "httpsKey": "/path/to/key.pem",
  "tempDir": "~/.servherd/tmp",
  "pm2": {
    "logDir": "~/.servherd/logs",
    "pidDir": "~/.servherd/pids"
  }
}
```

### Environment Variables

Override configuration with environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVHERD_HOSTNAME` | Default hostname | `localhost` |
| `SERVHERD_PROTOCOL` | Protocol (http/https) | `http` |
| `SERVHERD_PORT_MIN` | Minimum port number | `3000` |
| `SERVHERD_PORT_MAX` | Maximum port number | `9999` |
| `SERVHERD_CONFIG_DIR` | Configuration directory | `~/.servherd` |

### CI Mode

servherd automatically detects CI environments and adjusts behavior:

- Uses sequential port allocation (instead of deterministic hashing)
- Disables interactive prompts
- Uses non-TTY output formatting
- Respects environment variable configuration

**Supported CI environments:**
- GitHub Actions
- GitLab CI
- Jenkins
- CircleCI
- Travis CI
- Azure Pipelines
- Buildkite
- TeamCity
- Any environment with `CI=true`

**Manual CI mode control:**
```bash
# Force CI mode
servherd start --ci -- npm run dev -- --port {{port}}

# Force non-CI mode (even in CI environment)
servherd start --no-ci -- npm run dev -- --port {{port}}
```

## API (Programmatic Usage)

```typescript
import { ConfigService, RegistryService, ProcessService, PortService } from "servherd";

// Load configuration
const config = new ConfigService();
await config.load();

// Access registry
const registry = new RegistryService(config);
await registry.load();

// Manage processes
const process = new ProcessService(registry);
await process.connect();

// Generate ports
const port = new PortService(config);
const assignedPort = port.generatePort("/path/to/project", "npm start");
```

## Troubleshooting

### Server won't start

1. Check if PM2 is installed: `pm2 --version`
2. Check if the port is available: `lsof -i :PORT`
3. View server logs: `servherd logs <name> --error`

### Port conflicts

servherd uses deterministic port assignment based on project path and command. If you need a different port:

1. Use `--port` to specify an exact port
2. Use a different server name (changes the hash)
3. Modify the port range in config
4. Stop the existing server first

### PM2 cleanup

If servers become orphaned:

```bash
# List PM2 processes
pm2 list

# Delete servherd processes
pm2 delete all --filter servherd-

# Or remove all and let servherd recreate
servherd remove --all --force
```

### Log management

```bash
# Clear logs for a specific server
servherd logs my-app --flush

# Clear all logs
servherd logs --flush --all

# Check log file location
servherd info my-app  # Shows log paths
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT - see [LICENSE](LICENSE)
