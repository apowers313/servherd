# Claude Code MCP Integration

This guide shows how to use servherd with Claude Code through the Model Context Protocol (MCP).

## Setup

### 1. Install servherd

```bash
npm install -g servherd
```

### 2. Configure Claude Code

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

### 3. Restart Claude Code

After updating the configuration, restart Claude Code to load the new MCP server.

## Using with Claude

Once configured, you can ask Claude to manage your development servers naturally:

### Starting Servers

> **You:** Start a Vite dev server for my React project

Claude will use `servherd_start` to start the server and tell you the assigned port:

> **Claude:** I've started your Vite development server. It's running at http://localhost:5173

### Listing Servers

> **You:** What servers are running?

> **Claude:** You have 2 servers running:
> - `frontend` (online) - http://localhost:5173 - /home/user/my-project
> - `api` (online) - http://localhost:3000 - /home/user/my-project/api

### Viewing Server Info

> **You:** Tell me about the frontend server

> **Claude:** Here's the status of your frontend server:
> - **Name:** frontend
> - **Status:** online
> - **URL:** http://localhost:5173
> - **Uptime:** 2 hours 15 minutes
> - **Memory:** 125 MB
> - **CPU:** 0.5%

### Checking Logs

> **You:** Show me the last few log lines from the api server

> **Claude:** Here are the recent logs from your api server:
> ```
> [12:34:56] Server listening on port 3000
> [12:35:01] GET /api/users - 200 (15ms)
> [12:35:03] POST /api/login - 200 (45ms)
> ```

### Stopping Servers

> **You:** Stop all the development servers

> **Claude:** I've stopped all your development servers:
> - frontend - stopped
> - api - stopped

## Practical Examples

### Full-Stack Development

> **You:** I'm working on a full-stack app with a React frontend and Express backend. Start both servers for me.

> **Claude:** I'll start both servers for you.
>
> Started:
> - Frontend (React/Vite): http://localhost:5173
> - Backend (Express): http://localhost:3001
>
> Both servers are now running and ready for development.

### Debugging

> **You:** The API is returning errors. Can you check the logs?

> **Claude:** Let me check the error logs for your API server...
>
> I found some errors in the logs:
> ```
> [ERROR] TypeError: Cannot read property 'id' of undefined
>     at /src/routes/users.js:45:23
> ```
>
> It looks like there's an issue in your users route where it's trying to access an undefined object's `id` property.

### Resource Monitoring

> **You:** Is anything using too much memory?

> **Claude:** Let me check your servers' resource usage...
>
> | Server | Memory | CPU |
> |--------|--------|-----|
> | frontend | 125 MB | 0.5% |
> | api | 89 MB | 0.2% |
> | worker | 256 MB | 5.1% |
>
> The worker process is using the most memory at 256 MB and has higher CPU usage. This might be worth investigating if performance is a concern.

### Cleanup

> **You:** I'm done for the day. Clean up all my dev servers.

> **Claude:** I've cleaned up your development environment:
>
> Stopped and removed:
> - frontend
> - api
> - worker
>
> All servers have been stopped and removed from the registry.

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `servherd_start` | Start a new development server |
| `servherd_stop` | Stop running servers |
| `servherd_restart` | Restart servers |
| `servherd_list` | List all managed servers |
| `servherd_info` | Get detailed server information |
| `servherd_logs` | View server logs |
| `servherd_remove` | Remove servers from registry |
| `servherd_config` | View/modify configuration |

## MCP Resources

Claude can also access these resources directly:

- `servherd://servers` - List of all servers
- `servherd://servers/{name}` - Details for a specific server
- `servherd://servers/{name}/logs` - Logs for a specific server

## Tips

### Natural Language

You don't need to know the exact commands. Just describe what you want:

- "Start my development server"
- "What's running right now?"
- "Stop the frontend but keep the API running"
- "Is the server healthy?"

### Context Awareness

Claude remembers previous actions in the conversation:

> **You:** Start a Vite server
> **Claude:** Started at http://localhost:5173
>
> **You:** What port is it on?
> **Claude:** Your Vite server is running on port 5173

### Error Handling

Claude will explain errors clearly:

> **You:** Start another server with the same name
> **Claude:** There's already a server named "frontend" running. Would you like me to:
> 1. Restart the existing server
> 2. Stop it and start a new one
> 3. Use a different name for the new server

## Troubleshooting

### MCP Server Not Connecting

1. Check configuration file syntax
2. Ensure servherd is installed: `npx servherd --version`
3. Try running manually: `npx servherd mcp`
4. Restart Claude Code

### Commands Not Working

1. Check if PM2 is installed: `pm2 --version`
2. Verify permissions on ~/.servherd directory
3. Check servherd logs for errors

### Getting Help

Ask Claude:

> **You:** What servherd commands are available?

Claude will list all available server management capabilities.
