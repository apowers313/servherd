# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**servherd** is a CLI tool and MCP server for managing development servers across projects. It solves port collisions, resource conflicts, and server tracking in AI-driven development by providing deterministic port assignment, human-readable server names, and seamless AI integration via MCP.

## Common Commands

```bash
# Development
npm run dev -- <args>           # Run CLI with tsx (e.g., npm run dev -- start --name test -- node server.js)
npm run build                   # TypeScript compilation to dist/
npm run lint                    # Run ESLint
npm run lint:fix                # Run ESLint with auto-fix

# Testing
npm test                        # Run all tests
npm run test:unit               # Unit tests only (test/unit/)
npm run test:integration        # Integration tests only (test/integration/)
npm run test:e2e                # E2E tests only (test/e2e/)
npm run test:watch              # Vitest watch mode
npm run test:coverage           # Coverage report (thresholds: 80% statements, 75% branches, 80% functions)

# Run a single test file
npx vitest run path/to/test.ts

# Run tests matching a pattern
npx vitest run -t "pattern"

# Other
npm run knip                    # Find unused dependencies
npm run commit                  # Commitizen commit wizard (conventional commits)
```

## Architecture

### Layered Design

```
CLI Commands (src/cli/commands/) → Services (src/services/) → PM2/Registry
MCP Tools (src/mcp/tools/)      ↗
```

### Core Services (`src/services/`)

- **ConfigService** - Configuration management using cosmiconfig. Loads from package.json, .servherdrc, ~/.servherd/config.json, and SERVHERD_* env vars
- **RegistryService** - Server registry persistence to ~/.servherd/registry.json with file locking (proper-lockfile)
- **PortService** - Deterministic port allocation (hashes project path + command) or sequential (CI mode)
- **ProcessService** - PM2 process management for daemon mode
- **DirectProcessService** - Direct child process spawning for CI environments

### Key Utilities (`src/utils/`)

- **template.ts** - Handlebars template engine with `{{port}}`, `{{hostname}}`, `{{url}}`, and `{{$ "service" "prop"}}` helpers
- **ci-detector.ts** - Detects 14+ CI environments, controls port allocation strategy
- **config-drift.ts** - Detects when server configs change after startup

### Type System (`src/types/`)

All external data validated with Zod schemas. Key types:
- `GlobalConfig` - Configuration schema
- `ServerEntry` - Server registry entry schema

## Code Style

ESLint enforces:
- Double quotes, semicolons required
- 2-space indentation
- Trailing commas in multi-line
- Unused vars error (prefix with `_` to ignore)
- `@typescript-eslint/no-explicit-any` is a warning

Naming:
- Files: kebab-case (e.g., `config.service.ts`)
- Classes: PascalCase
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE

## Testing

Vitest with three config files:
- `vitest.config.ts` - Unit tests
- `vitest.config.integration.ts` - Integration tests
- `vitest.config.e2e.ts` - E2E tests

Test files mirror source structure in `test/unit/`, `test/integration/`, `test/e2e/`.

## MCP Integration

MCP tools in `src/mcp/tools/` mirror CLI commands. Resources in `src/mcp/resources/` expose server details and logs. Framework: `@modelcontextprotocol/sdk` with stdio transport.

## CI Mode Behavior

When CI is detected (or `--ci` flag):
- Port allocation switches from deterministic to sequential
- Interactive prompts disabled
- Can override with `--no-ci`

## Commit Messages

Conventional commits required (commitlint):
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `test:` test changes
- `refactor:` code refactoring
- `chore:` maintenance
