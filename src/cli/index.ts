import { Command } from "commander";
import { startAction } from "./commands/start.js";
import { stopAction } from "./commands/stop.js";
import { listAction } from "./commands/list.js";
import { infoAction } from "./commands/info.js";
import { logsAction } from "./commands/logs.js";
import { restartAction } from "./commands/restart.js";
import { removeAction } from "./commands/remove.js";
import { configAction } from "./commands/config.js";
import { mcpAction } from "./commands/mcp.js";

/**
 * Create the CLI program
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("servherd")
    .description("CLI tool and MCP server for managing development servers across projects")
    .version("0.1.0")
    .option("--json", "Output results as JSON")
    .option("--ci", "Force CI mode behavior (sequential port allocation, no interactive prompts)")
    .option("--no-ci", "Force non-CI mode behavior (overrides CI environment detection)");

  // Start command
  program
    .command("start")
    .description("Start a development server")
    .argument("[command...]", "Command to run (use -- to separate from options)")
    .option("-n, --name <name>", "Name for the server")
    .option("-p, --port <port>", "Port for the server (overrides deterministic assignment)", parseInt)
    .option("--protocol <protocol>", "Protocol to use (http or https)", (value) => {
      if (value !== "http" && value !== "https") {
        throw new Error("Protocol must be 'http' or 'https'");
      }
      return value as "http" | "https";
    })
    .option("-t, --tag <tag...>", "Tags for the server")
    .option("-d, --description <description>", "Description of the server")
    .option("-e, --env <KEY=VALUE...>", "Environment variables (supports {{port}}, {{hostname}}, {{url}}, {{https-cert}}, {{https-key}} templates)")
    .action(async (commandArgs: string[], options, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await startAction(commandArgs, { ...options, json: globalOpts.json });
    });

  // Stop command
  program
    .command("stop")
    .description("Stop a development server")
    .argument("[name]", "Name of the server to stop")
    .option("-a, --all", "Stop all servers")
    .option("-t, --tag <tag>", "Stop servers with this tag")
    .option("-f, --force", "Force stop using SIGKILL")
    .action(async (name: string | undefined, options, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await stopAction(name, { ...options, json: globalOpts.json });
    });

  // List command
  program
    .command("list")
    .alias("ls")
    .description("List all managed servers")
    .option("-r, --running", "Only show running servers")
    .option("-s, --stopped", "Only show stopped servers")
    .option("-t, --tag <tag>", "Filter by tag")
    .option("-c, --cwd <path>", "Filter by working directory")
    .option("--cmd <pattern>", "Filter by command pattern (glob syntax, e.g., '*storybook*')")
    .action(async (options, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await listAction({ ...options, json: globalOpts.json });
    });

  // Info command
  program
    .command("info")
    .description("Show detailed information about a server")
    .argument("<name>", "Name of the server")
    .action(async (name: string, options, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await infoAction(name, { json: globalOpts.json });
    });

  // Logs command
  program
    .command("logs")
    .description("View server logs")
    .argument("[name]", "Name of the server")
    .option("-n, --lines <number>", "Number of lines to show (from end)", "50")
    .option("-e, --error", "Show error logs instead of output logs")
    .option("-f, --follow", "Follow logs in real-time")
    .option("--since <time>", "Show logs since time (e.g., 1h, 30m, 2024-01-15)")
    .option("--head <number>", "Show first N lines (instead of last)")
    .option("--flush", "Clear logs instead of displaying")
    .option("-a, --all", "Apply to all servers (with --flush)")
    .action(async (name: string | undefined, options, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await logsAction(name, {
        lines: options.lines ? parseInt(options.lines, 10) : undefined,
        error: options.error,
        follow: options.follow,
        since: options.since,
        head: options.head ? parseInt(options.head, 10) : undefined,
        flush: options.flush,
        all: options.all,
        json: globalOpts.json,
      });
    });

  // Restart command
  program
    .command("restart")
    .description("Restart a development server")
    .argument("[name]", "Name of the server to restart")
    .option("-a, --all", "Restart all servers")
    .option("-t, --tag <tag>", "Restart servers with this tag")
    .action(async (name: string | undefined, options, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await restartAction(name, { ...options, json: globalOpts.json });
    });

  // Remove command
  program
    .command("remove")
    .alias("rm")
    .description("Remove a server from the registry (stops it first)")
    .argument("[name]", "Name of the server to remove")
    .option("-a, --all", "Remove all servers")
    .option("-t, --tag <tag>", "Remove servers with this tag")
    .option("-f, --force", "Skip confirmation prompt")
    .action(async (name: string | undefined, options, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await removeAction(name, { ...options, json: globalOpts.json });
    });

  // Config command
  program
    .command("config")
    .description("View and modify configuration")
    .option("-s, --show", "Show current configuration (default)")
    .option("-g, --get <key>", "Get a specific configuration value")
    .option("--set <key>", "Set a configuration value (use with --value)")
    .option("--value <value>", "Value to set (use with --set)")
    .option("-r, --reset", "Reset configuration to defaults")
    .option("-f, --force", "Skip confirmation prompt for reset")
    .option("--refresh <name>", "Refresh a specific server with config drift")
    .option("--refresh-all", "Refresh all servers with config drift")
    .option("-t, --tag <tag>", "Refresh servers with this tag (use with --refresh-all)")
    .option("--dry-run", "Show what would be refreshed without making changes")
    .action(async (options, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await configAction({ ...options, json: globalOpts.json });
    });

  // MCP command
  program
    .command("mcp")
    .description("Start the MCP server (for use with Claude Code or other MCP clients)")
    .action(async () => {
      await mcpAction();
    });

  return program;
}

/**
 * Run the CLI
 */
export async function runCLI(args: string[] = process.argv): Promise<void> {
  const program = createProgram();
  await program.parseAsync(args);
}
