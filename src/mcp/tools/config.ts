import { z } from "zod";
import { executeConfig } from "../../cli/commands/config.js";
import type { ConfigResult } from "../../cli/output/formatters.js";

export const configToolName = "servherd_config";

export const configToolDescription =
  "View or modify servherd global configuration settings. " +
  "Use this tool to check current settings, change configuration values like hostname or port range, or reset to defaults. " +
  "Can show all configuration values, get a specific setting by key, set a new value, or reset all settings to defaults. " +
  "Returns the action performed, success status, relevant configuration data, and a descriptive message. " +
  "Configuration changes persist across sessions and affect all future server operations.";

export const configToolSchema = z.object({
  show: z.boolean().optional().describe("Set to true to show all configuration values"),
  get: z.string().optional().describe("Get a specific configuration value by key, e.g., 'hostname', 'protocol', or 'portRange.min'"),
  set: z.string().optional().describe("Configuration key to set, e.g., 'hostname' or 'portRange.max'. Requires 'value' parameter"),
  value: z.string().optional().describe("Value to set for the key, e.g., '127.0.0.1' for hostname or '9999' for portRange.max"),
  reset: z.boolean().optional().describe("Set to true to reset all configuration to default values"),
});

export type ConfigToolInput = z.infer<typeof configToolSchema>;

export interface ConfigToolResult {
  action: "show" | "get" | "set" | "reset";
  success: boolean;
  config?: Record<string, unknown>;
  key?: string;
  value?: unknown;
  error?: string;
  message: string;
}

export async function handleConfigTool(input: ConfigToolInput): Promise<ConfigToolResult> {
  // Determine action
  let action: "show" | "get" | "set" | "reset" = "show";

  if (input.get) {
    action = "get";
  } else if (input.set) {
    action = "set";
  } else if (input.reset) {
    action = "reset";
  }

  // For reset, we force it since MCP can't prompt
  const result: ConfigResult = await executeConfig({
    show: action === "show",
    get: input.get,
    set: input.set,
    value: input.value,
    reset: input.reset,
    force: input.reset ? true : undefined, // Force reset without prompting in MCP context
  });

  // Handle errors
  if (result.error) {
    return {
      action,
      success: false,
      error: result.error,
      message: result.error,
    };
  }

  // Handle cancelled reset
  if (result.cancelled) {
    return {
      action: "reset",
      success: false,
      message: "Reset was cancelled",
    };
  }

  // Build response based on action
  switch (action) {
    case "get":
      return {
        action: "get",
        success: true,
        key: result.key,
        value: result.value,
        message: `${result.key} = ${JSON.stringify(result.value)}`,
      };

    case "set":
      return {
        action: "set",
        success: result.updated === true,
        key: result.key,
        value: result.value,
        message: result.updated ? `Set ${result.key} to ${JSON.stringify(result.value)}` : "Failed to set value",
      };

    case "reset":
      return {
        action: "reset",
        success: result.reset === true,
        config: result.config as Record<string, unknown>,
        message: "Configuration reset to defaults",
      };

    case "show":
    default:
      return {
        action: "show",
        success: true,
        config: result.config as Record<string, unknown>,
        message: `Configuration loaded from ${result.configPath || "defaults"}`,
      };
  }
}
