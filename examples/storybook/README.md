# Storybook Integration

This example shows how to manage Storybook development servers with servherd.

## Basic Setup

```bash
# Start Storybook with automatic port assignment
servherd start --name stories -- npx storybook dev -p {{port}}

# View at the assigned URL
servherd info stories
# URL: http://localhost:6123
```

## Project Structure

```
my-component-library/
├── .storybook/
│   ├── main.ts
│   └── preview.ts
├── src/
│   └── components/
│       └── Button/
│           ├── Button.tsx
│           └── Button.stories.tsx
├── package.json
└── README.md
```

## package.json Scripts

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "storybook:servherd": "npx storybook dev -p {{port}}",
    "build-storybook": "storybook build"
  }
}
```

## Using with servherd

### Start Storybook

```bash
cd my-component-library

# Start with servherd (port managed automatically)
servherd start --name component-stories -- npm run storybook:servherd

# Or directly with npx
servherd start --name component-stories -- npx storybook dev -p {{port}}
```

### Multiple Storybook Instances

```bash
# Main component library
servherd start --name main-stories --tag storybook -- npx storybook dev -p {{port}}

# Documentation site components
cd ../docs-site
servherd start --name docs-stories --tag storybook -- npx storybook dev -p {{port}}

# List all Storybook instances
servherd list --tag storybook

# Stop all Storybook instances
servherd stop --tag storybook
```

### With Custom Configuration

```bash
# Specify a different config directory
servherd start --name stories -- npx storybook dev -p {{port}} --config-dir .storybook-custom

# With specific docs mode
servherd start --name stories-docs -- npx storybook dev -p {{port}} --docs
```

## Integration with Testing

### Visual Regression Testing

```bash
# Start Storybook
servherd start --name stories -- npx storybook dev -p {{port}}

# Wait for ready
sleep 10

# Run visual tests (Chromatic, Percy, etc.)
npx chromatic --storybook-url=$(servherd info stories --json | jq -r '.url')

# Cleanup
servherd stop stories
```

### Storybook Test Runner

```bash
# Start Storybook
servherd start --name stories -- npx storybook dev -p {{port}}

# Get the URL for test-runner
STORYBOOK_URL=$(servherd info stories --json | jq -r '.url')

# Run tests
npx test-storybook --url $STORYBOOK_URL

# Cleanup
servherd stop stories
```

## CI Configuration

### GitHub Actions

```yaml
name: Storybook Tests

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
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install servherd
        run: npm install -g servherd

      - name: Start Storybook
        run: |
          servherd start --name stories -- npx storybook dev -p {{port}}
          sleep 15  # Wait for Storybook to build

      - name: Run Storybook tests
        run: npx test-storybook --url http://localhost:$(servherd info stories --json | jq -r '.port')

      - name: Stop Storybook
        if: always()
        run: servherd stop stories
```

## Tips

### Faster Rebuilds

Storybook watches for file changes automatically. No need to restart:

```bash
# Start once
servherd start --name stories -- npx storybook dev -p {{port}}

# Edit your components
# Storybook auto-reloads
```

### Memory Management

For large component libraries, monitor memory usage:

```bash
# Check memory
servherd info stories

# Restart if needed to clear cache
servherd restart stories
```

### Port Consistency

servherd assigns the same port for the same Storybook in the same directory. This means bookmarks and browser dev tools remain valid across sessions.
