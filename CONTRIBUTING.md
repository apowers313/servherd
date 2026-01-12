# Contributing to servherd

Thank you for your interest in contributing to servherd! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 20 or later
- npm 9 or later
- Git

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/servherd.git
   cd servherd
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Run tests:
   ```bash
   npm test
   ```

### Development Workflow

```bash
# Run in development mode (with tsx)
npm run dev -- start --name test -- node -e "console.log('hello')"

# Run linting
npm run lint

# Run linting with auto-fix
npm run lint:fix

# Run unit tests
npm run test:unit

# Run tests in watch mode
npm run test:watch

# Run all tests with coverage
npm run test:coverage
```

## Project Structure

```
servherd/
├── src/
│   ├── cli/              # CLI commands and output formatting
│   │   ├── commands/     # Individual command handlers
│   │   └── output/       # Output formatters
│   ├── mcp/              # MCP server implementation
│   │   ├── tools/        # MCP tool handlers
│   │   └── resources/    # MCP resource handlers
│   ├── services/         # Core business logic
│   ├── types/            # TypeScript types and Zod schemas
│   ├── utils/            # Utility functions
│   └── index.ts          # Entry point
├── test/
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   ├── e2e/              # End-to-end tests
│   └── mocks/            # Test mocks
├── docs/                 # Documentation
├── examples/             # Usage examples
└── scripts/              # Build/development scripts
```

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer explicit types over `any`
- Use Zod for runtime validation of external data
- Export types alongside implementations

### ESLint

The project uses ESLint with the flat config format. Key rules:

- Double quotes for strings
- Semicolons required
- 2-space indentation
- Trailing commas in multi-line constructs

Run `npm run lint:fix` before committing to auto-fix issues.

### Naming Conventions

- **Files**: kebab-case (e.g., `config.service.ts`)
- **Classes**: PascalCase (e.g., `ConfigService`)
- **Functions**: camelCase (e.g., `generatePort`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_CONFIG`)
- **Types/Interfaces**: PascalCase (e.g., `ServerEntry`)

## Testing

### Test Structure

Tests are organized by type:

- **Unit tests** (`test/unit/`): Test individual functions and classes in isolation
- **Integration tests** (`test/integration/`): Test component interactions
- **E2E tests** (`test/e2e/`): Test the full CLI and MCP server

### Writing Tests

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("FeatureName", () => {
  beforeEach(() => {
    // Setup
  });

  it("should do something specific", () => {
    // Arrange
    const input = "test";

    // Act
    const result = doSomething(input);

    // Assert
    expect(result).toBe("expected");
  });
});
```

### Test Coverage

Aim for:
- 80% statement coverage
- 75% branch coverage
- 80% function coverage

Run `npm run test:coverage` to check coverage.

## Pull Request Process

### Before Submitting

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes with clear, focused commits

3. Write or update tests for your changes

4. Ensure all tests pass:
   ```bash
   npm test
   ```

5. Ensure linting passes:
   ```bash
   npm run lint
   ```

6. Update documentation if needed

### PR Guidelines

- Keep PRs focused on a single feature or fix
- Write a clear description of what the PR does
- Link to any related issues
- Include screenshots for UI changes
- Ensure CI checks pass

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions or changes
- `refactor`: Code refactoring
- `style`: Formatting changes
- `chore`: Maintenance tasks

**Examples:**
```
feat(cli): add --filter option to list command
fix(mcp): handle connection timeout gracefully
docs: update README with new configuration options
test(services): add unit tests for PortService
```

## Architecture Decisions

### Services

Services encapsulate business logic and are the primary way to interact with the system:

- `ConfigService`: Configuration management
- `RegistryService`: Server registry persistence
- `PortService`: Port allocation
- `ProcessService`: PM2 process management

### CLI Commands

Each command is in its own file under `src/cli/commands/`. Commands:

1. Parse and validate input
2. Call appropriate services
3. Format and output results

### MCP Tools

MCP tools mirror CLI commands but return structured data for LLM consumption. Each tool:

1. Validates input parameters
2. Delegates to CLI command executors
3. Formats output as MCP response

## Getting Help

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
