import { RegistryService } from "../../services/registry.service.js";
import { ProcessService } from "../../services/process.service.js";
import type { ServerStatus } from "../../types/registry.js";
import { formatServerInfo } from "../output/formatters.js";
import { formatAsJson, formatErrorAsJson } from "../output/json-formatter.js";
import { logger } from "../../utils/logger.js";
import { ServherdError, ServherdErrorCode } from "../../types/errors.js";

export interface InfoCommandOptions {
  name: string;
}

export interface InfoCommandResult {
  name: string;
  status: ServerStatus;
  url: string;
  cwd: string;
  command: string;
  resolvedCommand: string;
  port: number;
  hostname: string;
  protocol: string;
  pid?: number;
  uptime?: number;
  restarts?: number;
  memory?: number;
  cpu?: number;
  tags?: string[];
  description?: string;
  env?: Record<string, string>;
  createdAt: string;
  pm2Name: string;
  outLogPath?: string;
  errLogPath?: string;
}

/**
 * Execute the info command
 */
export async function executeInfo(options: InfoCommandOptions): Promise<InfoCommandResult> {
  const registryService = new RegistryService();
  const processService = new ProcessService();

  try {
    // Load registry
    await registryService.load();

    // Find server by name
    const server = registryService.findByName(options.name);

    if (!server) {
      throw new ServherdError(
        ServherdErrorCode.SERVER_NOT_FOUND,
        `Server "${options.name}" not found`,
      );
    }

    // Connect to PM2 to get process details
    await processService.connect();

    // Get process info from PM2
    const procDesc = await processService.describe(server.pm2Name);

    // Build result
    const result: InfoCommandResult = {
      name: server.name,
      status: "unknown",
      url: `${server.protocol}://${server.hostname}:${server.port}`,
      cwd: server.cwd,
      command: server.command,
      resolvedCommand: server.resolvedCommand,
      port: server.port,
      hostname: server.hostname,
      protocol: server.protocol,
      tags: server.tags,
      description: server.description,
      env: server.env,
      createdAt: server.createdAt,
      pm2Name: server.pm2Name,
    };

    if (procDesc) {
      // Process exists in PM2
      const pm2Env = procDesc.pm2_env;

      result.status = pm2Env.status === "online" ? "online"
        : pm2Env.status === "stopped" || pm2Env.status === "stopping" ? "stopped"
          : pm2Env.status === "errored" ? "errored"
            : "unknown";

      result.pid = procDesc.pid;
      result.uptime = pm2Env.pm_uptime;
      result.restarts = pm2Env.restart_time;
      result.outLogPath = pm2Env.pm_out_log_path;
      result.errLogPath = pm2Env.pm_err_log_path;

      if (procDesc.monit) {
        result.memory = procDesc.monit.memory;
        result.cpu = procDesc.monit.cpu;
      }
    }

    return result;
  } finally {
    processService.disconnect();
  }
}

/**
 * CLI action handler for info command
 */
export async function infoAction(name: string, options?: { json?: boolean }): Promise<void> {
  try {
    if (!name) {
      if (options?.json) {
        console.log(formatErrorAsJson(new Error("Server name is required")));
      } else {
        console.error("Error: Server name is required");
      }
      process.exitCode = 1;
      return;
    }

    const result = await executeInfo({ name });

    if (options?.json) {
      console.log(formatAsJson(result));
    } else {
      console.log(formatServerInfo(result));
    }
  } catch (error) {
    if (options?.json) {
      console.log(formatErrorAsJson(error));
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
    }
    logger.error({ error }, "Info command failed");
    process.exitCode = 1;
  }
}
