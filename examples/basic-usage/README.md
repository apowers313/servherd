# Basic Usage Examples

This guide demonstrates common servherd commands and workflows.

## Starting Your First Server

```bash
# Start a simple Node.js server
servherd start -- node -e "require('http').createServer((req, res) => res.end('Hello!')).listen({{port}})"

# Output:
# Server 'brave-tiger' started on http://localhost:3456
```

The server is now running in the background, managed by PM2.

## Starting with a Custom Name

```bash
# Name your server for easy reference
servherd start --name my-app -- npm run dev --port {{port}}

# Now reference it by name
servherd info my-app
servherd logs my-app
servherd stop my-app
```

## Listing Servers

```bash
# List all servers
servherd list

# Output:
# ┌────────────┬─────────┬──────┬──────────────────────────┬─────────────────────┐
# │ Name       │ Status  │ Port │ URL                      │ Working Directory   │
# ├────────────┼─────────┼──────┼──────────────────────────┼─────────────────────┤
# │ my-app     │ online  │ 3456 │ http://localhost:3456    │ /home/user/project  │
# │ brave-tiger│ online  │ 3789 │ http://localhost:3789    │ /home/user/other    │
# └────────────┴─────────┴──────┴──────────────────────────┴─────────────────────┘

# List only running servers
servherd list --running
```

## Viewing Server Details

```bash
servherd info my-app

# Output:
# ╭──────────────────────────────────────────────────────╮
# │  my-app                                              │
# ├──────────────────────────────────────────────────────┤
# │  Status:     online                                  │
# │  Port:       3456                                    │
# │  URL:        http://localhost:3456                   │
# │  Directory:  /home/user/project                      │
# │  Command:    npm run dev --port {{port}}             │
# │  PID:        12345                                   │
# │  Uptime:     2h 15m                                  │
# │  Memory:     45.2 MB                                 │
# │  CPU:        0.5%                                    │
# ╰──────────────────────────────────────────────────────╯
```

## Viewing Logs

```bash
# View last 50 lines of output
servherd logs my-app

# View more lines
servherd logs my-app --lines 100

# View error logs
servherd logs my-app --error
```

## Stopping Servers

```bash
# Stop by name
servherd stop my-app

# Stop all servers
servherd stop --all
```

## Restarting Servers

```bash
# Restart a specific server
servherd restart my-app

# Restart all servers
servherd restart --all
```

## Removing Servers

```bash
# Remove a server (stops it and removes from registry)
servherd remove my-app

# Remove without confirmation
servherd remove my-app --force

# Remove all servers
servherd remove --all --force
```

## Using Tags

Tags help organize related servers:

```bash
# Start servers with tags
servherd start --name frontend --tag web --tag dev -- npm run dev --port {{port}}
servherd start --name backend --tag api --tag dev -- npm run api --port {{port}}
servherd start --name worker --tag background --tag dev -- npm run worker

# List servers by tag
servherd list --tag dev

# Stop servers by tag
servherd stop --tag web

# Remove servers by tag
servherd remove --tag dev --force
```

## Template Variables

Use template variables in your commands:

```bash
# {{port}} - The assigned port
servherd start -- vite --port {{port}}

# {{hostname}} - Configured hostname (default: localhost)
servherd start -- vite --host {{hostname}} --port {{port}}

# {{url}} - Full URL (protocol + hostname + port)
servherd start -- echo "Server at {{url}}"
```

## Configuration

```bash
# View current configuration
servherd config --show

# Change hostname
servherd config --set hostname --value dev.local

# Change port range
servherd config --set portRange.min --value 8000
servherd config --set portRange.max --value 8999

# Reset to defaults
servherd config --reset
```

## Tips

### Same Command = Same Port

servherd generates deterministic ports based on your command and directory. Running the same command in the same directory always assigns the same port (if available).

### Persisted Between Sessions

Servers continue running after you close your terminal. Use `servherd list` to see all servers and `servherd stop --all` to clean up.

### Works with Any Command

```bash
# Python
servherd start -- python -m http.server {{port}}

# Ruby
servherd start -- ruby -run -e httpd . -p {{port}}

# PHP
servherd start -- php -S localhost:{{port}}
```
