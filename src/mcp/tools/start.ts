import { z } from "zod";
import { executeStart } from "../../cli/commands/start.js";
import type { StartCommandResult } from "../../cli/commands/start.js";
import { ConfigService } from "../../services/config.service.js";
import {
  findMissingVariables,
  getTemplateVariables,
  formatMissingVariablesForMCP,
} from "../../utils/template.js";
import { ServherdError, ServherdErrorCode } from "../../types/errors.js";
import { CIDetector } from "../../utils/ci-detector.js";

export const startToolName = "servherd_start";

export const startToolDescription =
  "Start a development server with automatic port assignment and process management. " +
  "Server identity is determined by working directory + name. " +
  "Without a name, a deterministic name is generated from command + env variables, so different command/env = different server. " +
  "With an explicit name, you can update the command/env for an existing server (it will restart with the new config). " +
  "The command can include {{port}}, {{hostname}}, and {{url}} template variables that will be substituted with actual values. " +
  "Returns the server name, assigned port, full URL, and status (started, existing, or restarted).";

export const startToolSchema = z.object({
  command: z.string().describe("The command to run, e.g., 'npm start --port {{port}}' or 'python -m http.server {{port}}'"),
  cwd: z.string().optional().describe("Working directory for the server, e.g., '/home/user/my-project'. Defaults to current directory"),
  name: z.string().optional().describe("Human-readable name for the server, e.g., 'frontend-dev' or 'api-server'. With explicit name, you can update command/env and the same server will be reused. Auto-generated deterministically from command+env if not provided"),
  port: z.number().optional().describe("Explicit port number to use instead of auto-assigned"),
  protocol: z.enum(["http", "https"]).optional().describe("Protocol to use (http or https). Defaults to global config setting"),
  tags: z.array(z.string()).optional().describe("Tags for filtering/grouping servers, e.g., ['frontend', 'development']"),
  description: z.string().optional().describe("Description of the server's purpose, e.g., 'React development server for the dashboard'"),
  env: z.record(z.string()).optional().describe("Environment variables, e.g., {\"NODE_ENV\": \"development\", \"API_URL\": \"http://localhost:{{port}}\"}"),
});

export type StartToolInput = z.infer<typeof startToolSchema>;

export interface StartToolResult {
  action: "started" | "existing" | "restarted" | "renamed" | "refreshed";
  name: string;
  port: number;
  url: string;
  status: string;
  message: string;
  portReassigned?: boolean;
  originalPort?: number;
  previousName?: string;
  /** Whether config drift was detected and applied */
  configDrift?: boolean;
  /** Details of config drift that was applied */
  driftDetails?: string[];
}

export async function handleStartTool(input: StartToolInput): Promise<StartToolResult> {
  // Check if running in CI mode - this affects config loading
  const isCI = CIDetector.isCI();

  // Load config and check for missing template variables before starting
  // In CI mode, skip config files and use defaults for consistent builds
  const configService = new ConfigService();
  const config = await configService.load({ ciMode: isCI });

  // Use a placeholder port (0) to check for missing config-based variables
  // The actual port will be assigned by PortService during executeStart
  const templateVars = getTemplateVariables(config, 0);
  const missingVars = findMissingVariables(input.command, templateVars);

  // Filter to only configurable missing variables (ignore port/url which are auto-generated)
  const configurableMissing = missingVars.filter(v => v.configurable);

  if (configurableMissing.length > 0) {
    const errorMessage = formatMissingVariablesForMCP(configurableMissing);
    throw new ServherdError(
      ServherdErrorCode.CONFIG_VALIDATION_FAILED,
      errorMessage,
    );
  }

  const result: StartCommandResult = await executeStart({
    command: input.command,
    cwd: input.cwd,
    name: input.name,
    port: input.port,
    protocol: input.protocol,
    tags: input.tags,
    description: input.description,
    env: input.env,
    ciMode: isCI,
  });

  const url = `${result.server.protocol}://${result.server.hostname}:${result.server.port}`;

  let message: string;
  switch (result.action) {
    case "started":
      message = `Server "${result.server.name}" started at ${url}`;
      break;
    case "existing":
      message = `Server "${result.server.name}" is already running at ${url}`;
      break;
    case "restarted":
      message = `Server "${result.server.name}" restarted at ${url}`;
      break;
    case "renamed":
      message = `Server renamed from "${result.previousName}" to "${result.server.name}" at ${url}`;
      break;
    case "refreshed":
      message = `Server "${result.server.name}" refreshed with new config at ${url}`;
      break;
  }

  // Add port reassignment info to message if applicable
  if (result.portReassigned) {
    message += ` (port ${result.originalPort} was unavailable, reassigned to ${result.server.port})`;
  }

  // Add drift details to message if applicable
  if (result.driftDetails && result.driftDetails.length > 0) {
    message += `. Config changes: ${result.driftDetails.join(", ")}`;
  }

  return {
    action: result.action,
    name: result.server.name,
    port: result.server.port,
    url,
    status: result.status,
    message,
    portReassigned: result.portReassigned,
    originalPort: result.originalPort,
    previousName: result.previousName,
    configDrift: result.configDrift,
    driftDetails: result.driftDetails,
  };
}
