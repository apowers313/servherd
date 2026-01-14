# CI/CD Integration

servherd is designed to work seamlessly in CI/CD environments. This guide covers setup, configuration, and best practices for continuous integration.

## CI Detection

servherd automatically detects CI environments and adjusts behavior:

- **Skips loading config files** - Uses default configuration instead of `~/.servherd/config.json` or project-local configs to ensure consistent, reproducible builds
- **Uses `0.0.0.0` as default hostname** - Binds to all network interfaces, avoiding IPv4/IPv6 mismatch issues
- Disables interactive prompts
- Uses non-TTY safe output formatting
- Respects environment variable overrides (e.g., `SERVHERD_HOSTNAME`, `SERVHERD_PORT_MIN`)

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

      - name: Start development server
        run: |
          servherd start --name app-server -- npm run dev --port {{port}}
          # Wait for server to be ready
          sleep 5

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Stop server
        if: always()
        run: servherd stop --all
```

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
          servherd start -- npm run dev --port {{port}}
          npm test
          servherd stop --all
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
    - servherd start --name test-server -- npm run dev --port {{port}}
    - npm run test:e2e
    - servherd stop --all
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
          name: Start server
          command: servherd start --name app -- npm run dev --port {{port}}
      - run:
          name: Run tests
          command: npm run test:e2e
      - run:
          name: Cleanup
          command: servherd stop --all
          when: always

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

### 1. Always Clean Up

Use `always()` or equivalent to ensure servers are stopped:

```yaml
# GitHub Actions
- name: Stop servers
  if: always()
  run: servherd stop --all

# Jenkins
post {
    always {
        sh 'servherd stop --all || true'
    }
}
```

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
# Check server logs
servherd logs my-server --error

# Try starting manually first
npm run dev --port 3000
```

### PM2 Not Available

```bash
# Ensure PM2 is installed
npm install -g pm2

# Or use npx
npx pm2 list
```

### Cleanup Orphaned Processes

```bash
# List all PM2 processes
pm2 list

# Delete servherd processes
pm2 delete $(pm2 list | grep servherd | awk '{print $4}')

# Or delete all
servherd remove --all --force
```
