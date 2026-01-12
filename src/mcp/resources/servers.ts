import { RegistryService } from "../../services/registry.service.js";
import { ProcessService } from "../../services/process.service.js";
import type { ServerStatus } from "../../types/registry.js";
import { executeLogs } from "../../cli/commands/logs.js";

export interface ServerResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * List all available server resources
 */
export async function listServerResources(): Promise<ServerResource[]> {
  const registryService = new RegistryService();

  try {
    await registryService.load();
    const servers = registryService.listServers();

    const resources: ServerResource[] = [];

    for (const server of servers) {
      // Add server resource
      resources.push({
        uri: `servherd://servers/${server.name}`,
        name: server.name,
        description: server.description || `Server at ${server.cwd}`,
        mimeType: "application/json",
      });

      // Add logs resource
      resources.push({
        uri: `servherd://servers/${server.name}/logs`,
        name: `${server.name} logs`,
        description: `Output logs for server ${server.name}`,
        mimeType: "text/plain",
      });
    }

    return resources;
  } catch {
    // Return empty list if registry can't be loaded
    return [];
  }
}

/**
 * Read a server resource by URI
 */
export async function readServerResource(uri: string): Promise<string> {
  // Parse URI
  const match = uri.match(/^servherd:\/\/servers\/([^/]+)(\/logs)?$/);

  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const serverName = match[1];
  const isLogs = match[2] === "/logs";

  if (isLogs) {
    return readServerLogs(serverName);
  }

  return readServerDetails(serverName);
}

/**
 * Read server details as JSON
 */
async function readServerDetails(name: string): Promise<string> {
  const registryService = new RegistryService();
  const processService = new ProcessService();

  try {
    await registryService.load();
    await processService.connect();

    const server = registryService.findByName(name);

    if (!server) {
      throw new Error(`Server "${name}" not found`);
    }

    // Get process status
    let status: ServerStatus = "unknown";
    let pid: number | undefined;
    let uptime: number | undefined;
    let memory: number | undefined;
    let cpu: number | undefined;

    try {
      const procDesc = await processService.describe(server.pm2Name);

      if (procDesc) {
        const pm2Env = procDesc.pm2_env;

        status = pm2Env.status === "online" ? "online"
          : pm2Env.status === "stopped" || pm2Env.status === "stopping" ? "stopped"
            : pm2Env.status === "errored" ? "errored"
              : "unknown";

        pid = procDesc.pid;
        uptime = pm2Env.pm_uptime;

        if (procDesc.monit) {
          memory = procDesc.monit.memory;
          cpu = procDesc.monit.cpu;
        }
      }
    } catch {
      // Ignore PM2 errors, just report unknown status
    }

    const serverDetails = {
      name: server.name,
      status,
      port: server.port,
      url: `${server.protocol}://${server.hostname}:${server.port}`,
      cwd: server.cwd,
      command: server.command,
      resolvedCommand: server.resolvedCommand,
      hostname: server.hostname,
      protocol: server.protocol,
      tags: server.tags,
      description: server.description,
      env: server.env,
      createdAt: server.createdAt,
      pm2Name: server.pm2Name,
      pid,
      uptime,
      memory,
      cpu,
    };

    return JSON.stringify(serverDetails, null, 2);
  } finally {
    processService.disconnect();
  }
}

/**
 * Read server logs
 */
async function readServerLogs(name: string): Promise<string> {
  const result = await executeLogs({
    name,
    lines: 100, // Get more lines for resource reading
  });

  if (!result.logs || result.logs.trim() === "") {
    return "(no logs available)";
  }

  return result.logs;
}
