# MCP Server Integration

servherd includes a Model Context Protocol (MCP) server that exposes all CLI functionality to LLM tools like Claude Code.

## Overview

The MCP server allows AI assistants to:

- Start and stop development servers
- List and monitor server status
- View server logs
- Manage configuration

All operations are performed through structured tool calls with JSON input/output.

## Setup

### Claude Code

Add servherd to your Claude Code MCP configuration:

**Location:** `~/.claude/claude_desktop_config.json`

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

For a local development installation:

```json
{
  "mcpServers": {
    "servherd": {
      "command": "npx",
      "args": ["tsx", "/path/to/servherd/src/index.ts", "mcp"]
    }
  }
}
```

### Other MCP Clients

servherd's MCP server communicates over stdio using JSON-RPC. Any MCP-compatible client can connect:

```bash
# Start the MCP server
servherd mcp

# The server reads JSON-RPC requests from stdin
# and writes responses to stdout
```

### Testing with MCP Inspector

Use the MCP Inspector to test tools interactively:

```bash
npx @anthropic/mcp-inspector npx servherd mcp
```

This opens a web UI where you can:
- Browse available tools
- Execute tools with custom parameters
- View tool responses
- Browse resources

## Available Tools

### servherd_start

Start a new development server.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `command` | string | Yes | Command to run (supports `{{port}}`, `{{hostname}}`, `{{url}}`) |
| `name` | string | No | Custom server name |
| `cwd` | string | No | Working directory |
| `description` | string | No | Server description |
| `tags` | string[] | No | Tags for grouping |
| `env` | object | No | Environment variables |

**Example:**
```json
{
  "command": "npm run dev --port {{port}}",
  "name": "frontend-dev",
  "cwd": "/home/user/my-project",
  "tags": ["frontend", "development"]
}
```

**Response:**
```json
{
  "action": "started",
  "server": {
    "name": "frontend-dev",
    "port": 3456,
    "url": "http://localhost:3456",
    "status": "online"
  },
  "message": "Server 'frontend-dev' started on http://localhost:3456"
}
```

### servherd_stop

Stop one or more servers.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | No* | Server name to stop |
| `all` | boolean | No* | Stop all servers |
| `tag` | string | No* | Stop servers with this tag |

*At least one of `name`, `all`, or `tag` must be provided.

**Example:**
```json
{
  "name": "frontend-dev"
}
```

**Response:**
```json
{
  "results": [
    {
      "name": "frontend-dev",
      "success": true,
      "message": "Stopped successfully"
    }
  ],
  "count": 1,
  "message": "Stopped 1 server"
}
```

### servherd_restart

Restart one or more servers.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | No* | Server name to restart |
| `all` | boolean | No* | Restart all servers |
| `tag` | string | No* | Restart servers with this tag |

*At least one of `name`, `all`, or `tag` must be provided.

### servherd_list

List all managed servers.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `running` | boolean | No | Only show running servers |
| `tag` | string | No | Filter by tag |
| `cwd` | string | No | Filter by working directory |

**Example:**
```json
{
  "running": true
}
```

**Response:**
```json
{
  "servers": [
    {
      "name": "frontend-dev",
      "status": "online",
      "port": 3456,
      "url": "http://localhost:3456",
      "cwd": "/home/user/my-project",
      "tags": ["frontend"],
      "hasDrift": false
    }
  ],
  "count": 1,
  "message": "Found 1 running server"
}
```

### servherd_info

Get detailed information about a server.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Server name |

**Response:**
```json
{
  "name": "frontend-dev",
  "status": "online",
  "port": 3456,
  "url": "http://localhost:3456",
  "cwd": "/home/user/my-project",
  "command": "npm run dev --port {{port}}",
  "pid": 12345,
  "uptime": "2h 15m",
  "uptimeMs": 8100000,
  "memory": "45.2 MB",
  "memoryBytes": 47417344,
  "cpu": 0.5,
  "restarts": 0,
  "tags": ["frontend"],
  "description": "Development server",
  "logPaths": {
    "out": "/home/user/.servherd/logs/frontend-dev-out.log",
    "error": "/home/user/.servherd/logs/frontend-dev-error.log"
  }
}
```

### servherd_logs

Get server logs.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Server name |
| `lines` | number | No | Number of lines (default: 50) |
| `error` | boolean | No | Get error logs instead of stdout |

**Response:**
```json
{
  "name": "frontend-dev",
  "status": "online",
  "logs": "Server running on port 3456\nHandling request...\n",
  "lineCount": 2,
  "logType": "output",
  "logPath": "/home/user/.servherd/logs/frontend-dev-out.log"
}
```

### servherd_remove

Remove servers from the registry.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | No* | Server name to remove |
| `all` | boolean | No* | Remove all servers |
| `tag` | string | No* | Remove servers with this tag |

*At least one of `name`, `all`, or `tag` must be provided.

### servherd_config

View or modify configuration.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `show` | boolean | No | Show all configuration |
| `get` | string | No | Get specific config key |
| `set` | string | No | Set config key (requires `value`) |
| `value` | string | No | Value to set |
| `reset` | boolean | No | Reset to defaults |

**Example - Get config:**
```json
{
  "show": true
}
```

**Response:**
```json
{
  "action": "show",
  "success": true,
  "config": {
    "hostname": "localhost",
    "protocol": "http",
    "portRange": {
      "min": 3000,
      "max": 9999
    },
    "refreshOnChange": "on-start"
  },
  "message": "Current configuration"
}
```

### servherd_refresh

Refresh servers that have config drift (running with outdated configuration values).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | No* | Specific server to refresh |
| `all` | boolean | No* | Refresh all servers with drift |
| `tag` | string | No | Filter by tag (used with `all`) |
| `dryRun` | boolean | No | Preview changes without applying |

*At least one of `name` or `all` must be provided.

**Example - Refresh all servers:**
```json
{
  "all": true
}
```

**Response:**
```json
{
  "results": [
    {
      "name": "frontend-dev",
      "success": true,
      "status": "online",
      "message": "Refreshed with new config",
      "driftDetails": "hostname: \"localhost\" → \"dev.local\""
    }
  ],
  "count": 1,
  "message": "Refreshed 1 server"
}
```

**Example - Dry run:**
```json
{
  "all": true,
  "dryRun": true
}
```

**Response:**
```json
{
  "results": [
    {
      "name": "frontend-dev",
      "success": true,
      "driftDetails": "hostname: \"localhost\" → \"dev.local\"",
      "skipped": true
    }
  ],
  "count": 1,
  "message": "Would refresh 1 server (dry run)"
}
```

## MCP Resources

Resources provide read-only access to server information.

### servherd://servers

List all registered servers.

**URI:** `servherd://servers`

**Content:** JSON array of server summaries

### servherd://servers/{name}

Get details for a specific server.

**URI:** `servherd://servers/brave-tiger`

**Content:** JSON object with full server details

### servherd://servers/{name}/logs

Get logs for a specific server.

**URI:** `servherd://servers/brave-tiger/logs`

**Content:** Plain text log output

## Usage Examples

### Starting a Development Stack

```
User: Start both the frontend and backend servers for my project