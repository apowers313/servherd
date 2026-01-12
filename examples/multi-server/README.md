# Managing Multiple Servers

This example shows how to manage multiple development servers across projects using tags and naming conventions.

## Scenario: Full-Stack Application

A typical full-stack setup with frontend, backend, and background workers:

```bash
# Frontend (React/Vite)
servherd start --name frontend --tag web --tag dev -- npx vite --port {{port}}

# Backend API (Node/Express)
servherd start --name api --tag backend --tag dev -- npm run api --port {{port}}

# Background worker
servherd start --name worker --tag background --tag dev -- npm run worker

# Database admin (pgAdmin, etc.)
servherd start --name db-admin --tag tools --tag dev -- npm run db-admin --port {{port}}
```

## Organizing with Tags

### By Layer

```bash
# Frontend services
servherd start --name web --tag frontend -- npm run web --port {{port}}
servherd start --name mobile-api --tag frontend -- npm run mobile --port {{port}}

# Backend services
servherd start --name api --tag backend -- npm run api --port {{port}}
servherd start --name auth --tag backend -- npm run auth --port {{port}}

# Infrastructure
servherd start --name redis-ui --tag infra -- npm run redis-ui --port {{port}}
```

### By Environment

```bash
# Development
servherd start --name api --tag dev -- npm run dev --port {{port}}

# Staging
servherd start --name api-staging --tag staging -- npm run staging --port {{port}}
```

### By Project

```bash
# Project A
servherd start --name projecta-web --tag projecta -- npm run web --port {{port}}
servherd start --name projecta-api --tag projecta -- npm run api --port {{port}}

# Project B
servherd start --name projectb-web --tag projectb -- npm run web --port {{port}}
servherd start --name projectb-api --tag projectb -- npm run api --port {{port}}
```

## Bulk Operations

### Stop by Tag

```bash
# Stop all frontend servers
servherd stop --tag frontend

# Stop all Project A servers
servherd stop --tag projecta

# Stop all dev servers
servherd stop --tag dev
```

### List by Tag

```bash
# List all backend servers
servherd list --tag backend

# List running dev servers only
servherd list --tag dev --running
```

### Restart by Tag

```bash
# Restart all backend servers after config change
servherd restart --tag backend
```

### Remove by Tag

```bash
# Clean up staging servers
servherd remove --tag staging --force
```

## Microservices Example

Managing a microservices architecture:

```bash
# API Gateway
servherd start --name gateway --tag core --tag api \
  -- npm run gateway --port {{port}}

# User Service
servherd start --name users --tag core --tag api \
  -- npm run users --port {{port}}

# Order Service
servherd start --name orders --tag core --tag api \
  -- npm run orders --port {{port}}

# Payment Service
servherd start --name payments --tag core --tag api \
  -- npm run payments --port {{port}}

# Notification Service
servherd start --name notifications --tag async --tag api \
  -- npm run notifications --port {{port}}

# Email Worker
servherd start --name email-worker --tag async --tag worker \
  -- npm run email-worker

# Report Generator
servherd start --name reports --tag async --tag worker \
  -- npm run reports
```

### Managing the Stack

```bash
# View entire stack
servherd list

# View core services only
servherd list --tag core

# View async services
servherd list --tag async

# Restart all API services
servherd restart --tag api

# Stop workers only
servherd stop --tag worker
```

## Scripts for Common Operations

Create shell scripts for common tasks:

### start-all.sh

```bash
#!/bin/bash
set -e

echo "Starting development stack..."

# Core services
servherd start --name frontend --tag dev -- npm run frontend --port {{port}}
servherd start --name api --tag dev -- npm run api --port {{port}}
servherd start --name worker --tag dev -- npm run worker

# Wait for services to be ready
sleep 5

# Show status
servherd list --tag dev

echo "Development stack is running!"
```

### stop-all.sh

```bash
#!/bin/bash

echo "Stopping development stack..."
servherd stop --tag dev

echo "Development stack stopped."
```

### status.sh

```bash
#!/bin/bash

echo "=== Development Stack Status ==="
servherd list --tag dev

echo ""
echo "=== Resource Usage ==="
for server in $(servherd list --tag dev --json | jq -r '.[].name'); do
  echo "--- $server ---"
  servherd info $server | grep -E "(Memory|CPU|Uptime)"
done
```

## Monorepo Pattern

For monorepos with multiple packages:

```bash
# From repo root
PROJECT_ROOT=$(pwd)

# Start each package's dev server
cd $PROJECT_ROOT/packages/web
servherd start --name web --tag monorepo -- npm run dev --port {{port}}

cd $PROJECT_ROOT/packages/admin
servherd start --name admin --tag monorepo -- npm run dev --port {{port}}

cd $PROJECT_ROOT/packages/api
servherd start --name api --tag monorepo -- npm run dev --port {{port}}

cd $PROJECT_ROOT
servherd list --tag monorepo
```

## Tips

### Consistent Naming

Use consistent naming conventions:

```
{project}-{service}  e.g., myapp-frontend, myapp-api
{service}-{env}      e.g., api-dev, api-staging
```

### Tag Hierarchy

Use multiple tags for flexible filtering:

```bash
# Tag by layer, project, and environment
--tag frontend --tag projecta --tag dev
```

### Quick Status Check

```bash
# See what's running
servherd list --running

# Count servers by tag
servherd list --tag dev | wc -l
```

### Resource Monitoring

```bash
# Check a specific server
servherd info api

# Quick memory check across all servers
for s in $(servherd list --json | jq -r '.[].name'); do
  echo -n "$s: "
  servherd info $s --json | jq -r '.memory // "not running"'
done
```
