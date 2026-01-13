import chalk from "chalk";
import Table from "cli-table3";
import boxen from "boxen";
import type { ServerEntry, ServerStatus } from "../../types/registry.js";
import type { InfoCommandResult } from "../commands/info.js";
import type { LogsCommandResult } from "../commands/logs.js";

/**
 * Format server status with color
 */
export function formatStatus(status: ServerStatus): string {
  switch (status) {
    case "online":
      return chalk.green("● online");
    case "stopped":
      return chalk.gray("○ stopped");
    case "errored":
      return chalk.red("✖ errored");
    default:
      return chalk.yellow("? unknown");
  }
}

/**
 * Format URL for display
 */
export function formatUrl(protocol: string, hostname: string, port: number): string {
  return chalk.cyan(`${protocol}://${hostname}:${port}`);
}

/**
 * Format server name for display
 */
export function formatName(name: string): string {
  return chalk.bold(name);
}

/**
 * Create a table showing server list
 */
export interface ServerListItem {
  server: ServerEntry;
  status: ServerStatus;
  hasDrift?: boolean;
}

export function formatServerListTable(servers: ServerListItem[]): string {
  if (servers.length === 0) {
    return chalk.yellow("No servers registered");
  }

  const table = new Table({
    head: [
      chalk.bold("Name"),
      chalk.bold("Status"),
      chalk.bold("Port"),
      chalk.bold("Command"),
      chalk.bold("Working Directory"),
    ],
    style: {
      head: [],
      border: [],
    },
  });

  for (const { server, status, hasDrift } of servers) {
    // Add drift indicator to name if config has drifted
    const nameDisplay = hasDrift
      ? formatName(server.name) + chalk.yellow(" ⚡")
      : formatName(server.name);

    table.push([
      nameDisplay,
      formatStatus(status),
      String(server.port),
      truncateString(server.command, 30),
      truncatePath(server.cwd, 30),
    ]);
  }

  // Add legend if any server has drift
  const anyDrift = servers.some(s => s.hasDrift);
  let result = table.toString();
  if (anyDrift) {
    result += "\n\n" + chalk.yellow("⚡ = Config has changed since server started. Run `servherd refresh` to update.");
  }

  return result;
}

/**
 * Format start result output
 */
export interface StartResult {
  action: "started" | "existing" | "restarted" | "renamed" | "refreshed";
  server: ServerEntry;
  status: ServerStatus;
  previousName?: string;
  /** Whether port was reassigned due to unavailability or config change */
  portReassigned?: boolean;
  /** Original port before reassignment */
  originalPort?: number;
  /** Whether config drift was detected and applied */
  configDrift?: boolean;
  /** Details of config drift that was applied */
  driftDetails?: string[];
  /** User declined refresh when prompted */
  userDeclinedRefresh?: boolean;
}

export function formatStartResult(result: StartResult): string {
  const { action, server, status } = result;
  const url = `${server.protocol}://${server.hostname}:${server.port}`;

  const lines: string[] = [];

  switch (action) {
    case "started":
      lines.push(chalk.green(`✓ Server "${server.name}" started`));
      break;
    case "existing":
      lines.push(chalk.blue(`ℹ Server "${server.name}" already exists`));
      break;
    case "restarted":
      lines.push(chalk.green(`✓ Server "${server.name}" restarted`));
      break;
    case "renamed":
      lines.push(chalk.green(`✓ Server renamed from "${result.previousName}" to "${server.name}"`));
      break;
    case "refreshed":
      lines.push(chalk.green(`↻ Server "${server.name}" refreshed (config changed)`));
      break;
  }

  lines.push(`  ${chalk.bold("Name:")}   ${server.name}`);
  lines.push(`  ${chalk.bold("Port:")}   ${server.port}`);
  lines.push(`  ${chalk.bold("URL:")}    ${chalk.cyan(url)}`);
  lines.push(`  ${chalk.bold("Status:")} ${formatStatus(status)}`);
  lines.push(`  ${chalk.bold("CWD:")}    ${server.cwd}`);

  // Show port reassignment if it happened
  if (result.portReassigned && result.originalPort !== undefined) {
    lines.push(`  ${chalk.yellow(`⚠ Port reassigned: ${result.originalPort} → ${server.port}`)}`);
  }

  // Show config drift details if present
  if (result.driftDetails && result.driftDetails.length > 0) {
    lines.push(`  ${chalk.bold("Config changes applied:")}`);
    for (const detail of result.driftDetails) {
      lines.push(`    ${chalk.dim("•")} ${detail}`);
    }
  }

  // Show user declined message if applicable
  if (result.userDeclinedRefresh) {
    lines.push(`  ${chalk.yellow("⚠ Config has changed but refresh was declined")}`);
  }

  return lines.join("\n");
}

/**
 * Format stop result output
 */
export interface StopResult {
  name: string;
  success: boolean;
  message?: string;
}

export function formatStopResult(results: StopResult[]): string {
  if (results.length === 0) {
    return chalk.yellow("No servers to stop");
  }

  const lines: string[] = [];

  for (const result of results) {
    if (result.success) {
      lines.push(chalk.green(`✓ Server "${result.name}" stopped`));
    } else {
      lines.push(chalk.red(`✖ Failed to stop "${result.name}": ${result.message}`));
    }
  }

  return lines.join("\n");
}

/**
 * Format error message
 */
export function formatError(message: string): string {
  return chalk.red(`✖ Error: ${message}`);
}

/**
 * Format success message
 */
export function formatSuccess(message: string): string {
  return chalk.green(`✓ ${message}`);
}

/**
 * Format info message
 */
export function formatInfo(message: string): string {
  return chalk.blue(`ℹ ${message}`);
}

/**
 * Format warning message
 */
export function formatWarning(message: string): string {
  return chalk.yellow(`⚠ ${message}`);
}

/**
 * Truncate a string for display
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Truncate a path for display
 */
function truncatePath(path: string, maxLength: number): string {
  if (path.length <= maxLength) {
    return path;
  }

  const parts = path.split("/");
  let result = "";

  // Start from the end and work backward
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts.slice(i).join("/");
    if (candidate.length <= maxLength - 3) {
      result = "..." + (i > 0 ? "/" : "") + candidate;
      break;
    }
  }

  if (!result) {
    // If even the last part is too long, just truncate
    result = "..." + path.slice(-(maxLength - 3));
  }

  return result;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

/**
 * Format uptime to human readable string
 */
function formatUptime(uptimeMs: number): string {
  const now = Date.now();
  const durationMs = now - uptimeMs;

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format server info as a boxed display
 */
export function formatServerInfo(info: InfoCommandResult): string {
  const lines: string[] = [];

  // Header
  lines.push(chalk.bold.cyan(`Server: ${info.name}`));
  lines.push("");

  // Status and basic info
  lines.push(`${chalk.bold("Status:")}      ${formatStatus(info.status)}`);
  lines.push(`${chalk.bold("URL:")}         ${chalk.cyan(info.url)}`);
  lines.push(`${chalk.bold("Port:")}        ${info.port}`);
  lines.push(`${chalk.bold("Hostname:")}    ${info.hostname}`);
  lines.push(`${chalk.bold("Protocol:")}    ${info.protocol}`);
  lines.push("");

  // Process info
  if (info.pid) {
    lines.push(`${chalk.bold("PID:")}         ${info.pid}`);
  }
  if (info.uptime) {
    lines.push(`${chalk.bold("Uptime:")}      ${formatUptime(info.uptime)}`);
  }
  if (info.restarts !== undefined) {
    lines.push(`${chalk.bold("Restarts:")}    ${info.restarts}`);
  }
  if (info.memory !== undefined) {
    lines.push(`${chalk.bold("Memory:")}      ${formatBytes(info.memory)}`);
  }
  if (info.cpu !== undefined) {
    lines.push(`${chalk.bold("CPU:")}         ${info.cpu.toFixed(1)}%`);
  }
  lines.push("");

  // Command info
  lines.push(`${chalk.bold("Command:")}     ${info.command}`);
  lines.push(`${chalk.bold("Resolved:")}    ${info.resolvedCommand}`);
  lines.push(`${chalk.bold("CWD:")}         ${info.cwd}`);
  lines.push(`${chalk.bold("PM2 Name:")}    ${info.pm2Name}`);
  lines.push("");

  // Optional fields
  if (info.description) {
    lines.push(`${chalk.bold("Description:")} ${info.description}`);
  }
  if (info.tags && info.tags.length > 0) {
    lines.push(`${chalk.bold("Tags:")}        ${info.tags.join(", ")}`);
  }

  // Log paths
  if (info.outLogPath) {
    lines.push(`${chalk.bold("Out Log:")}     ${info.outLogPath}`);
  }
  if (info.errLogPath) {
    lines.push(`${chalk.bold("Err Log:")}     ${info.errLogPath}`);
  }

  // Environment variables
  if (info.env && Object.keys(info.env).length > 0) {
    lines.push("");
    lines.push(chalk.bold("Environment:"));
    for (const [key, value] of Object.entries(info.env)) {
      lines.push(`  ${key}=${value}`);
    }
  }

  // Created at
  lines.push("");
  lines.push(`${chalk.bold("Created:")}     ${new Date(info.createdAt).toLocaleString()}`);

  return boxen(lines.join("\n"), {
    padding: 1,
    margin: 0,
    borderStyle: "round",
    borderColor: "cyan",
  });
}

/**
 * Format logs output
 */
export function formatLogs(result: LogsCommandResult): string {
  const lines: string[] = [];

  lines.push(chalk.bold.cyan(`Logs for: ${result.name}`));
  lines.push(`${chalk.bold("Status:")} ${formatStatus(result.status)}`);

  if (result.outLogPath) {
    lines.push(`${chalk.bold("Log file:")} ${result.outLogPath}`);
  }

  lines.push(`${chalk.bold("Lines:")} ${result.lines}`);
  lines.push("");
  lines.push(chalk.gray("─".repeat(60)));
  lines.push("");

  if (result.logs) {
    lines.push(result.logs);
  } else {
    lines.push(chalk.gray("(no logs available)"));
  }

  return lines.join("\n");
}

/**
 * Format restart result output
 */
export interface RestartResult {
  name: string;
  success: boolean;
  status?: ServerStatus;
  message?: string;
  configRefreshed?: boolean;
}

export function formatRestartResult(results: RestartResult[]): string {
  if (results.length === 0) {
    return chalk.yellow("No servers to restart");
  }

  const lines: string[] = [];

  for (const result of results) {
    if (result.success) {
      if (result.configRefreshed) {
        lines.push(chalk.green(`✓ Server "${result.name}" restarted with updated config`));
      } else {
        lines.push(chalk.green(`✓ Server "${result.name}" restarted`));
      }
      if (result.status) {
        lines.push(`  Status: ${formatStatus(result.status)}`);
      }
    } else {
      lines.push(chalk.red(`✖ Failed to restart "${result.name}": ${result.message}`));
    }
  }

  return lines.join("\n");
}

/**
 * Format refresh result output
 */
export interface RefreshResult {
  name: string;
  success: boolean;
  status?: ServerStatus;
  message?: string;
  driftDetails?: string;
  skipped?: boolean;
}

function formatRefreshResult(results: RefreshResult[], dryRun?: boolean): string {
  // Check if this is a "no drift" result
  if (results.length === 1 && results[0].skipped && results[0].name === "") {
    return chalk.blue(`ℹ ${results[0].message}`);
  }

  const lines: string[] = [];

  if (dryRun) {
    lines.push(chalk.yellow("Dry run mode - no changes made"));
    lines.push("");
  }

  for (const result of results) {
    if (result.skipped && dryRun) {
      lines.push(chalk.yellow(`⚠ Server "${result.name}" would be refreshed`));
      if (result.driftDetails) {
        lines.push(chalk.gray(`  ${result.driftDetails.split("\n").join("\n  ")}`));
      }
    } else if (result.success) {
      lines.push(chalk.green(`✓ Server "${result.name}" refreshed with updated config`));
      if (result.status) {
        lines.push(`  Status: ${formatStatus(result.status)}`);
      }
    } else {
      lines.push(chalk.red(`✖ Failed to refresh "${result.name}": ${result.message}`));
    }
  }

  return lines.join("\n");
}

/**
 * Format remove result output
 */
export interface RemoveResult {
  name: string;
  success: boolean;
  cancelled?: boolean;
  message?: string;
}

export function formatRemoveResult(results: RemoveResult[]): string {
  if (results.length === 0) {
    return chalk.yellow("No servers to remove");
  }

  const lines: string[] = [];

  for (const result of results) {
    if (result.success) {
      lines.push(chalk.green(`✓ Server "${result.name}" removed`));
    } else if (result.cancelled) {
      lines.push(chalk.yellow(`⚠ Removal of "${result.name}" cancelled`));
    } else {
      lines.push(chalk.red(`✖ Failed to remove "${result.name}": ${result.message}`));
    }
  }

  return lines.join("\n");
}

/**
 * Format config result output
 */
export interface ConfigResult {
  // For --show
  config?: Record<string, unknown>;
  configPath?: string | null;
  globalConfigPath?: string;

  // For --get
  key?: string;
  value?: unknown;

  // For --set
  updated?: boolean;
  refreshMessage?: string;

  // For --reset
  reset?: boolean;
  cancelled?: boolean;

  // For --refresh
  refreshResults?: RefreshResult[];
  dryRun?: boolean;

  // For --list-vars
  variables?: Record<string, string>;

  // For --add
  addedVar?: boolean;
  varName?: string;
  varValue?: string;

  // For --remove
  removedVar?: boolean;

  // For errors
  error?: string;
}

export function formatConfigResult(result: ConfigResult): string {
  const lines: string[] = [];

  // Handle error
  if (result.error) {
    return formatError(result.error);
  }

  // Handle --refresh / --refresh-all
  if (result.refreshResults) {
    return formatRefreshResult(result.refreshResults, result.dryRun);
  }

  // Handle --list-vars
  if (result.variables !== undefined) {
    const vars = result.variables;
    const varKeys = Object.keys(vars);

    if (varKeys.length === 0) {
      return formatInfo("No custom variables defined. Use 'servherd config --add <name> --value <value>' to add one.");
    }

    lines.push(chalk.bold.cyan("Custom Template Variables"));
    lines.push("");

    const table = new Table({
      head: [chalk.bold("Variable"), chalk.bold("Value")],
      style: { head: [], border: [] },
    });

    for (const [name, value] of Object.entries(vars)) {
      table.push([`{{${name}}}`, value]);
    }

    lines.push(table.toString());
    return lines.join("\n");
  }

  // Handle --add
  if (result.addedVar !== undefined) {
    if (result.addedVar) {
      return formatSuccess(`Variable "{{${result.varName}}}" set to "${result.varValue}"`);
    }
    return formatError(result.error || "Failed to add variable");
  }

  // Handle --remove
  if (result.removedVar !== undefined) {
    if (result.removedVar) {
      return formatSuccess(`Variable "{{${result.varName}}}" removed`);
    }
    return formatError(result.error || "Failed to remove variable");
  }

  // Handle --get
  if (result.key !== undefined && result.value !== undefined && result.updated === undefined && result.reset === undefined) {
    return `${chalk.bold(result.key)}: ${formatValue(result.value)}`;
  }

  // Handle --set
  if (result.updated !== undefined) {
    if (result.updated) {
      let message = formatSuccess(`Configuration "${result.key}" set to ${formatValue(result.value)}`);
      if (result.refreshMessage) {
        message += "\n" + chalk.blue(`ℹ ${result.refreshMessage}`);
      }
      return message;
    }
    return formatError(result.error || "Failed to update configuration");
  }

  // Handle --reset
  if (result.reset !== undefined) {
    if (result.reset) {
      return formatSuccess("Configuration reset to defaults");
    }
    if (result.cancelled) {
      return formatWarning("Reset cancelled");
    }
    return formatError("Failed to reset configuration");
  }

  // Handle --show (default)
  if (result.config) {
    lines.push(chalk.bold.cyan("Current Configuration"));
    lines.push("");

    if (result.configPath) {
      lines.push(`${chalk.bold("Loaded from:")} ${result.configPath}`);
    } else if (result.globalConfigPath) {
      lines.push(`${chalk.bold("Global config:")} ${result.globalConfigPath}`);
    }
    lines.push("");

    const table = new Table({
      head: [chalk.bold("Setting"), chalk.bold("Value")],
      style: { head: [], border: [] },
    });

    // Flatten config for display
    const flatConfig = flattenConfig(result.config);
    for (const [key, value] of Object.entries(flatConfig)) {
      table.push([key, formatValue(value)]);
    }

    lines.push(table.toString());

    return lines.join("\n");
  }

  return "";
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return chalk.gray("(not set)");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Flatten a nested config object for display
 */
function flattenConfig(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenConfig(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}
