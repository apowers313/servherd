# Configuration Reference

servherd uses a layered configuration system that allows settings to be defined at multiple levels with clear precedence.

## Configuration Precedence

Settings are resolved in this order (highest priority first):

1. **Command-line arguments** - Override everything
2. **Environment variables** - Override file-based config
3. **Project config file** - `.servherdrc.json` in project root
4. **User config file** - `~/.servherd/config.json`
5. **Default values** - Built-in defaults

## Global Configuration File

**Location:** `~/.servherd/config.json`

This file stores user-level configuration that applies to all projects.

### Full Schema

```json
{
  "version": "1",
  "hostname": "localhost",
  "protocol": "http",
  "portRange": {
    "min": 3000,
    "max": 9999
  },
  "tempDir": "~/.servherd/tmp",
  "pm2": {
    "logDir": "~/.servherd/logs",
    "pidDir": "~/.servherd/pids"
  },
  "httpsCert": "/path/to/cert.pem",
  "httpsKey": "/path/to/key.pem",
  "refreshOnChange": "on-start"
}
```

### Configuration Options

#### `version`

- **Type:** `string`
- **Default:** `"1"`
- **Description:** Configuration file format version. Used for future migrations.

#### `hostname`

- **Type:** `string`
- **Default:** `"localhost"`
- **Description:** Default hostname used for server URLs and the `{{hostname}}` template variable.

**Example:**
```json
{
  "hostname": "dev.local"
}
```

#### `protocol`

- **Type:** `"http" | "https"`
- **Default:** `"http"`
- **Description:** Default protocol for server URLs.

#### `portRange.min`

- **Type:** `number`
- **Default:** `3000`
- **Description:** Minimum port number for automatic port assignment.

#### `portRange.max`

- **Type:** `number`
- **Default:** `9999`
- **Description:** Maximum port number for automatic port assignment.

**Example - Restrict to specific range:**
```json
{
  "portRange": {
    "min": 8000,
    "max": 8999
  }
}
```

#### `tempDir`

- **Type:** `string`
- **Default:** `"~/.servherd/tmp"`
- **Description:** Directory for temporary files.

#### `pm2.logDir`

- **Type:** `string`
- **Default:** `"~/.servherd/logs"`
- **Description:** Directory where PM2 stores server log files.

#### `pm2.pidDir`

- **Type:** `string`
- **Default:** `"~/.servherd/pids"`
- **Description:** Directory where PM2 stores process ID files.

#### `httpsCert`

- **Type:** `string` (optional)
- **Default:** `undefined`
- **Description:** Path to HTTPS certificate file. Used when protocol is `https` and exposed via the `{{https-cert}}` template variable.

#### `httpsKey`

- **Type:** `string` (optional)
- **Default:** `undefined`
- **Description:** Path to HTTPS private key file. Used when protocol is `https` and exposed via the `{{https-key}}` template variable.

#### `refreshOnChange`

- **Type:** `"manual" | "prompt" | "auto" | "on-start"`
- **Default:** `"on-start"`
- **Description:** Controls how servers are updated when configuration values change (e.g., hostname, httpsCert, httpsKey).

| Mode | Behavior |
|------|----------|
| `manual` | No automatic refresh. Use `servherd config --refresh-all` or `--refresh <name>` to manually apply config changes. |
| `prompt` | Prompts the user when config is changed via CLI, asking if affected servers should be refreshed. |
| `auto` | Automatically refreshes all affected servers when config is changed via CLI. |
| `on-start` | Applies the new config values the next time each server is started or restarted (default). |

**Example:**
```json
{
  "refreshOnChange": "prompt"
}
```

## Config Drift Detection

When a server is started, servherd captures a snapshot of the configuration values it uses (based on template variables in the command). If the global configuration changes after a server is started, the server has "config drift" - it's running with old values.

### How it Works

1. When a server starts, servherd records which template variables the command uses (e.g., `{{hostname}}`, `{{https-cert}}`)
2. It stores a snapshot of those config values at startup time
3. The `servherd list` command shows a ⚡ indicator next to servers with config drift
4. The `servherd info` command shows drift details for a specific server
5. Use `servherd config --refresh-all` or `--refresh <name>` to restart servers with updated config values

### Refresh Commands

```bash
# Check which servers have config drift (look for ⚡ indicator)
servherd list

# Refresh a specific server with new config values
servherd config --refresh my-server

# Refresh all servers with config drift
servherd config --refresh-all

# Refresh servers with a specific tag
servherd config --refresh-all --tag frontend

# Preview what would be refreshed without making changes
servherd config --refresh-all --dry-run
```

## Server Registry

**Location:** `~/.servherd/registry.json`

The registry stores information about all managed servers. You typically don't edit this file directly.

### Registry Structure

```json
{
  "version": "1",
  "servers": {
    "server-id-1": {
      "id": "uuid-string",
      "name": "brave-tiger",
      "command": "npm start --port {{port}}",
      "resolvedCommand": "npm start --port 3000",
      "cwd": "/home/user/project",
      "port": 3000,
      "protocol": "http",
      "hostname": "localhost",
      "env": {},
      "tags": ["frontend", "dev"],
      "description": "Main development server",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "pm2Name": "servherd-brave-tiger"
    }
  }
}
```

### Server Entry Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `name` | string | Human-readable name |
| `command` | string | Original command with templates |
| `resolvedCommand` | string | Command with templates resolved |
| `cwd` | string | Working directory |
| `port` | number | Assigned port number |
| `protocol` | string | Protocol (http/https) |
| `hostname` | string | Hostname |
| `env` | object | Environment variables |
| `tags` | string[] | Tags for organization |
| `description` | string | Server description |
| `createdAt` | string | ISO timestamp of creation |
| `pm2Name` | string | PM2 process name |

## Environment Variables

Override any configuration option using environment variables:

### Core Settings

| Variable | Config Key | Example |
|----------|------------|---------|
| `SERVHERD_HOSTNAME` | `hostname` | `dev.local` |
| `SERVHERD_PROTOCOL` | `protocol` | `https` |
| `SERVHERD_PORT_MIN` | `portRange.min` | `8000` |
| `SERVHERD_PORT_MAX` | `portRange.max` | `8999` |

### Directory Settings

| Variable | Config Key | Example |
|----------|------------|---------|
| `SERVHERD_CONFIG_DIR` | config directory | `/opt/servherd` |
| `SERVHERD_TEMP_DIR` | `tempDir` | `/tmp/servherd` |
| `SERVHERD_LOG_DIR` | `pm2.logDir` | `/var/log/servherd` |
| `SERVHERD_PID_DIR` | `pm2.pidDir` | `/var/run/servherd` |

### Behavior Settings

| Variable | Description | Values |
|----------|-------------|--------|
| `CI` | Enable CI mode | `true` |
| `LOG_LEVEL` | Logging verbosity | `debug`, `info`, `warn`, `error` |
| `NO_COLOR` | Disable color output | `1` |

## Template Variables

Template variables can be used in server commands and environment variables:

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `{{port}}` | Assigned port number | `3000` |
| `{{hostname}}` | Configured hostname | `localhost` |
| `{{url}}` | Full URL | `http://localhost:3000` |
| `{{https-cert}}` | Path to HTTPS certificate | `/path/to/cert.pem` |
| `{{https-key}}` | Path to HTTPS private key | `/path/to/key.pem` |

**Usage Example:**
```bash
# Basic server with port and hostname
servherd start -- npm run dev --port {{port}} --host {{hostname}}

# HTTPS server with certificate paths
servherd start -- node server.js --cert {{https-cert}} --key {{https-key}}
```

## Port Assignment Algorithm

Ports are assigned deterministically using FNV-1a hashing:

1. Hash the combination of `cwd` (working directory) and `command`
2. Map the hash to the configured port range
3. Check if the port is available
4. If not, increment and retry (up to 100 attempts)

This means:
- The same project/command always gets the same port (if available)
- Different projects get different ports
- Ports are predictable across sessions

## Managing Configuration via CLI

```bash
# View all configuration
servherd config --show

# Get a specific value
servherd config --get hostname
servherd config --get portRange.min

# Set a value
servherd config --set hostname --value myhost.local
servherd config --set portRange.min --value 4000
servherd config --set refreshOnChange --value prompt

# Reset to defaults
servherd config --reset

# Refresh servers with config drift
servherd config --refresh my-server       # Refresh specific server
servherd config --refresh-all             # Refresh all servers with drift
servherd config --refresh-all --tag api   # Refresh by tag
servherd config --refresh-all --dry-run   # Preview changes
```

## CI/CD Configuration

For CI environments, use environment variables:

```yaml
# GitHub Actions example
env:
  CI: true
  SERVHERD_HOSTNAME: ci.local
  SERVHERD_PORT_MIN: 8000
  SERVHERD_PORT_MAX: 8100
```

See [CI/CD Integration](ci-cd.md) for detailed examples.
