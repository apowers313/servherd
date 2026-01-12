# Vite Project Integration

This example demonstrates using servherd with Vite-based projects (React, Vue, Svelte, etc.).

## Basic Setup

```bash
# Start Vite dev server
servherd start --name my-vite-app -- npx vite --port {{port}}

# With host binding (for Docker/network access)
servherd start --name my-vite-app -- npx vite --host {{hostname}} --port {{port}}
```

## React + Vite

### Project Structure

```
my-react-app/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── public/
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Port will be overridden by CLI --port flag
    port: 3000,
  },
});
```

### package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "dev:servherd": "vite --port {{port}}",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### Using with servherd

```bash
cd my-react-app

# Start with automatic port
servherd start --name react-app -- npm run dev:servherd

# Or directly
servherd start --name react-app -- npx vite --port {{port}}

# View the app
servherd info react-app
# URL: http://localhost:5173
```

## Vue + Vite

```bash
# Create new Vue project
npm create vue@latest my-vue-app
cd my-vue-app
npm install

# Start with servherd
servherd start --name vue-app -- npm run dev -- --port {{port}}
```

## Svelte + Vite

```bash
# Create new Svelte project
npm create svelte@latest my-svelte-app
cd my-svelte-app
npm install

# Start with servherd
servherd start --name svelte-app -- npm run dev -- --port {{port}}
```

## Multiple Vite Projects

Manage a monorepo with multiple frontends:

```bash
# Main website
cd packages/website
servherd start --name website --tag frontend -- npx vite --port {{port}}

# Admin panel
cd ../admin
servherd start --name admin --tag frontend -- npx vite --port {{port}}

# Dashboard
cd ../dashboard
servherd start --name dashboard --tag frontend -- npx vite --port {{port}}

# List all frontends
servherd list --tag frontend

# Stop all frontends
servherd stop --tag frontend
```

## With Backend API

Run frontend and backend together:

```bash
# Start API server
servherd start --name api --tag fullstack -- npm run api --port {{port}}

# Get API port for frontend
API_PORT=$(servherd info api --json | jq -r '.port')

# Start frontend with API URL
servherd start --name frontend --tag fullstack -- VITE_API_URL=http://localhost:$API_PORT npx vite --port {{port}}

# Both are now running
servherd list --tag fullstack
```

## Preview Mode

Serve production build for testing:

```bash
# Build first
npm run build

# Start preview server
servherd start --name preview -- npx vite preview --port {{port}}
```

## CI Integration

### GitHub Actions

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Install servherd
        run: npm install -g servherd

      - name: Start Vite dev server
        run: |
          servherd start --name app -- npx vite --port {{port}}
          sleep 5

      - name: Run Playwright tests
        run: npx playwright test
        env:
          BASE_URL: http://localhost:$(servherd info app --json | jq -r '.port')

      - name: Stop server
        if: always()
        run: servherd stop app
```

## Environment Variables

Vite uses `VITE_` prefixed env vars:

```bash
# Set env vars inline
servherd start --name app -- VITE_API_URL=http://api.local npx vite --port {{port}}

# Or from .env file (Vite reads .env automatically)
servherd start --name app -- npx vite --port {{port}}
```

## Hot Module Replacement

Vite's HMR works automatically. servherd just manages the server process:

```bash
# Start server
servherd start --name app -- npx vite --port {{port}}

# Edit files
# Changes appear instantly in browser via HMR

# No need to restart!
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using the port
servherd info app  # Shows assigned port
lsof -i :5173      # Check system port

# Restart to get a new port attempt
servherd restart app
```

### HMR Not Working

Ensure WebSocket connection is allowed:

```bash
# Use 0.0.0.0 for Docker/VM environments
servherd start --name app -- npx vite --host 0.0.0.0 --port {{port}}
```

### Memory Issues

```bash
# Check memory usage
servherd info app

# Restart to clear cache
servherd restart app
```
