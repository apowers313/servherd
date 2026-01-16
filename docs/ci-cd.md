# CI/CD Integration

servherd is designed to work seamlessly in CI/CD environments. This guide covers setup, configuration, and best practices for continuous integration.

## CI Detection

servherd automatically detects CI environments and adjusts behavior:

- **Uses no-daemon mode** - Processes are spawned directly as children (not via PM2) and automatically terminate when the parent process exits. This prevents orphaned processes and hanging CI jobs.
- **Skips loading config files** - Uses default configuration instead of `~/.servherd/config.json` or project-local configs to ensure consistent, reproducible builds
- **Uses `0.0.0.0` as default hostname** - Binds to all network interfaces, avoiding IPv4/IPv6 mismatch issues
- Disables interactive prompts
- Uses non-TTY safe output formatting
- Respects environment variable overrides (e.g., `SERVHERD_HOSTNAME`, `SERVHERD_PORT_MIN`)

### No-Daemon Mode

In CI environments, servherd runs servers in **no-daemon mode** by default:

- Processes run as direct children of the servherd command
- Server output is streamed to stdout/stderr with `[server-name]` prefixes
- All processes automatically terminate when the CI job ends
- No PM2 daemon is started or required
- No manual cleanup (`servherd stop`) is needed

You can override this behavior with flags:

```bash
# Force PM2 daemon mode in CI (if you need background processes)
servherd start --daemon -- npm run dev --port {{port}}

# Force no-daemon mode outside CI (useful for local debugging)
servherd start --no-daemon -- npm run dev --port {{port}}
```

### Supported CI Systems

| CI System | Detection Variable |
|-----------|-------------------|
| GitHub Actions | `GITHUB_ACTIONS=true` |
| GitLab CI | `GITLAB_CI=true` |
| Jenkins | `JENKINS_URL` set |
| CircleCI | `CIRCLECI=true` |
| Travis CI | `TRAVIS=true` |
| Azure Pipelines | `TF_BUILD=true` |
| Bitbucket Pipelines | `BITBUCKET_PIPELINE_UUID` set |
| Generic | `CI=true` |

## GitHub Actions

### Basic Workflow

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
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install servherd
        run: npm install -g servherd

      - name: Start server and run E2E tests
        run: |
          # Server runs in foreground (no-daemon mode)
          # Use & to background it, or run tests in a separate step
          servherd start --name app-server -- npm run dev --port {{port}} &
          sleep 5  # Wait for server to be ready
          npm run test:e2e
          # Server automatically terminates when job ends
```

> **Note:** In no-daemon mode, the server runs in the foreground. Use `&` to background it if you need to run additional commands in the same step. No cleanup step is needed - the server terminates automatically when the job ends.

### With Custom Port Range

```yaml
- name: Start server with custom ports
  env:
    SERVHERD_PORT_MIN: 8000
    SERVHERD_PORT_MAX: 8100
  run: servherd start --name test-server -- npm run dev --port {{port}}
```

### Matrix Testing

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
        node: [18, 20]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}

      - name: Install and test
        run: |
          npm ci
          npm install -g servherd
          servherd start -- npm run dev --port {{port}} &
          sleep 5
          npm test
          # No cleanup needed - server terminates with job
```

## GitLab CI

### Basic Configuration

```yaml
# .gitlab-ci.yml
stages:
  - test

e2e-test:
  stage: test
  image: node:20
  script:
    - npm ci
    - npm install -g servherd
    - servherd start --name test-server -- npm run dev --port {{port}} &
    - sleep 5
    - npm run test:e2e
    # No cleanup needed - server terminates with job
  variables:
    CI: "true"
    SERVHERD_PORT_MIN: "8000"
    SERVHERD_PORT_MAX: "8100"
```

### With Services

```yaml
e2e-test:
  stage: test
  image: node:20
  services:
    - name: redis:latest
      alias: redis
  script:
    - npm ci
    - npm install -g servherd
    - servherd start --name api -- npm run dev --port {{port}}
    - npm run test:e2e
  variables:
    REDIS_URL: redis://redis:6379
```

## Jenkins

### Jenkinsfile

```groovy
pipeline {
    agent {
        docker {
            image 'node:20'
        }
    }

    environment {
        CI = 'true'
        SERVHERD_PORT_MIN = '8000'
        SERVHERD_PORT_MAX = '8100'
    }

    stages {
        stage('Install') {
            steps {
                sh 'npm ci'
                sh 'npm install -g servherd'
            }
        }

        stage('Test') {
            steps {
                sh 'servherd start --name app -- npm run dev --port {{port}}'
                sh 'npm run test:e2e'
            }
            post {
                always {
                    sh 'servherd stop --all || true'
                }
            }
        }
    }
}
```

## CircleCI

### Configuration

```yaml
# .circleci/config.yml
version: 2.1

jobs:
  test:
    docker:
      - image: cimg/node:20.0
    environment:
      CI: "true"
      SERVHERD_PORT_MIN: "8000"
      SERVHERD_PORT_MAX: "8100"
    steps:
      - checkout
      - restore_cache:
          keys:
            - deps-{{ checksum "package-lock.json" }}
      - run: npm ci
      - save_cache:
          key: deps-{{ checksum "package-lock.json" }}
          paths:
            - node_modules
      - run: npm install -g servherd
      - run:
          name: Start server and run tests
          command: |
            servherd start --name app -- npm run dev --port {{port}} &
            sleep 5
            npm run test:e2e
            # No cleanup needed - server terminates with job

workflows:
  test:
    jobs:
      - test
```

## Docker

### Development with Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    environment:
      - CI=true
      - SERVHERD_HOSTNAME=0.0.0.0
      - SERVHERD_PORT_MIN=3000
      - SERVHERD_PORT_MAX=3100
    ports:
      - "3000-3100:3000-3100"
    command: |
      sh -c "
        npm ci &&
        npm install -g servherd &&
        servherd start --name app -- npm run dev --host 0.0.0.0 --port {{port}} &&
        tail -f /dev/null
      "
```

### Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Install servherd globally
RUN npm install -g servherd

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Set CI environment
ENV CI=true
ENV SERVHERD_PORT_MIN=3000
ENV SERVHERD_PORT_MAX=3100

# Start server
CMD ["servherd", "start", "--", "npm", "run", "dev", "--port", "{{port}}"]
```

## Best Practices

### 1. Cleanup (Usually Automatic)

In **no-daemon mode** (the default for CI), cleanup is automatic - processes terminate when the CI job ends. No explicit cleanup step is needed.

If you use `--daemon` flag to run servers via PM2, add cleanup:

```yaml
# GitHub Actions (only needed with --daemon)
- name: Stop servers
  if: always()
  run: servherd stop --all

# Jenkins (only needed with --daemon)
post {
    always {
        sh 'servherd stop --all || true'
    }
}
```

> **Note:** In no-daemon mode, `servherd stop` and `servherd list` won't show these servers since they're not managed by PM2.

### 2. Use Specific Port Ranges

Avoid port conflicts by using dedicated ranges per job:

```yaml
env:
  SERVHERD_PORT_MIN: 8000
  SERVHERD_PORT_MAX: 8100
```

### 3. Wait for Server Ready

Add appropriate delays or health checks:

```bash
# Simple delay
servherd start --name app -- npm run dev --port {{port}}
sleep 5

# With health check
servherd start --name app -- npm run dev --port {{port}}
until curl -s http://localhost:$(servherd info app --json | jq -r '.port') > /dev/null; do
  sleep 1
done
```

### 4. Use Tags for Organization

```bash
# Start with tags
servherd start --name frontend --tag e2e -- npm run dev --port {{port}}
servherd start --name backend --tag e2e -- npm run api --port {{port}}

# Stop by tag
servherd stop --tag e2e
```

### 5. Check Server Status

```bash
# List running servers
servherd list --running

# Get specific server info
servherd info my-server
```

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `CI` | Enable CI mode (skips config files, uses defaults) | `false` |
| `SERVHERD_HOSTNAME` | Server hostname | `0.0.0.0` |
| `SERVHERD_PROTOCOL` | Protocol (http/https) | `http` |
| `SERVHERD_PORT_MIN` | Minimum port | `3000` |
| `SERVHERD_PORT_MAX` | Maximum port | `9999` |
| `SERVHERD_CONFIG_DIR` | Config directory | `~/.servherd` |
| `LOG_LEVEL` | Log verbosity | `info` |
| `NO_COLOR` | Disable colors | `false` |

> **Note:** In CI mode, config files (`~/.servherd/config.json` and project-local configs) are ignored. Only environment variables and default values are used. This ensures CI builds are consistent regardless of the developer's local configuration.

## Troubleshooting

### Port Already in Use

```bash
# Check what's using a port
lsof -i :3000

# Use a different port range
export SERVHERD_PORT_MIN=9000
export SERVHERD_PORT_MAX=9100
```

### Server Not Starting

```bash
# In no-daemon mode, errors appear directly in stdout/stderr
# Look for error messages in your CI job output

# Try starting manually first
npm run dev --port 3000

# If using --daemon mode, check server logs
servherd logs my-server --error
```

### CI Job Hangs

If your CI job hangs, it may be waiting for input or a server that won't start:

```bash
# Ensure CI environment is detected
echo $CI  # Should be "true"

# Or explicitly enable CI mode
servherd start --ci -- npm run dev --port {{port}}
```

### PM2 Issues (--daemon mode only)

These issues only apply when using `--daemon` flag:

```bash
# Ensure PM2 is installed
npm install -g pm2

# Or use npx
npx pm2 list
```

### Cleanup Orphaned Processes

In **no-daemon mode** (default), processes die with the parent - no cleanup needed.

If using `--daemon` mode and processes are orphaned:

```bash
# List all PM2 processes
pm2 list

# Delete servherd processes
pm2 delete $(pm2 list | grep servherd | awk '{print $4}')

# Or delete all
servherd remove --all --force
```
