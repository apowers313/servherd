#!/usr/bin/env node

/**
 * servherd - CLI tool and MCP server for managing development servers across projects
 */

import { runCLI } from "./cli/index.js";

// Export types
export * from "./types/config.js";
export * from "./types/registry.js";
export * from "./types/pm2.js";

// Export utilities
export * from "./utils/ci-detector.js";
export * from "./utils/logger.js";
export * from "./utils/template.js";

// Export services
export { ConfigService, type ConfigLoadOptions } from "./services/config.service.js";
export { RegistryService } from "./services/registry.service.js";
export { PortService } from "./services/port.service.js";
export { ProcessService } from "./services/process.service.js";

// Export CLI
export { runCLI, createProgram } from "./cli/index.js";

// Run CLI when executed directly
runCLI().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
