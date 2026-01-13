import { z } from "zod";
import { executeConfig } from "../../cli/commands/config.js";
import type { ConfigResult } from "../../cli/output/formatters.js";

export const configToolName = "servherd_config";

export const configToolDescription =
  "View or modify servherd global configuration settings. " +
  "Use this tool to check current settings, change configuration values like hostname or port range, or reset to defaults. " +
  "Can show all configuration values, get a specific setting by key, set a new value, or reset all settings to defaults. " +
  "Also supports custom template variables: add custom variables with 'add' and 'addValue', remove them with 'remove', or list them with 'listVars'. " +
  "Custom variables can be used in server commands like {{my-custom-var}}. " +
  "Returns the action performed, success status, relevant configuration data, and a descriptive message. " +
  "Configuration changes persist across sessions and affect all future server operations.";

export const configToolSchema = z.object({
  show: z.boolean().optional().describe("Set to true to show all configuration values"),
  get: z.string().optional().describe("Get a specific configuration value by key, e.g., 'hostname', 'protocol', or 'portRange.min'"),
  set: z.string().optional().describe("Configuration key to set, e.g., 'hostname' or 'portRange.max'. Requires 'value' parameter"),
  value: z.string().optional().describe("Value to set for the key, e.g., '127.0.0.1' for hostname or '9999' for portRange.max"),
  reset: z.boolean().optional().describe("Set to true to reset all configuration to default values"),
  add: z.string().optional().describe("Name of a custom template variable to add, e.g., 'my-api-key'. Requires 'addValue' parameter"),
  addValue: z.string().optional().describe("Value for the custom variable being added"),
  remove: z.string().optional().describe("Name of a custom template variable to remove"),
  listVars: z.boolean().optional().describe("Set to true to list all custom template variables"),
});

export type ConfigToolInput = z.infer<typeof configToolSchema>;

export interface ConfigToolResult {
  action: "show" | "get" | "set" | "reset" | "add" | "remove" | "listVars";
  success: boolean;
  config?: Record<string, unknown>;
  variables?: Record<string, string>;
  key?: string;
  value?: unknown;
  varName?: string;
  varValue?: string;
  error?: string;
  message: string;
}

export async function handleConfigTool(input: ConfigToolInput): Promise<ConfigToolResult> {
  // Determine action
  let action: "show" | "get" | "set" | "reset" | "add" | "remove" | "listVars" = "show";

  if (input.listVars) {
    action = "listVars";
  } else if (input.add) {
    action = "add";
  } else if (input.remove) {
    action = "remove";
  } else if (input.get) {
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
    value: action === "add" ? input.addValue : input.value,
    reset: input.reset,
    force: input.reset ? true : undefined, // Force reset without prompting in MCP context
    add: input.add,
    remove: input.remove,
    listVars: input.listVars,
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
    case "listVars":
      return {
        action: "listVars",
        success: true,
        variables: result.variables,
        message: Object.keys(result.variables ?? {}).length > 0
          ? `Found ${Object.keys(result.variables ?? {}).length} custom variable(s)`
          : "No custom variables defined",
      };

    case "add":
      return {
        action: "add",
        success: result.addedVar === true,
        varName: result.varName,
        varValue: result.varValue,
        message: result.addedVar
          ? `Added variable {{${result.varName}}} = "${result.varValue}"`
          : "Failed to add variable",
      };

    case "remove":
      return {
        action: "remove",
        success: result.removedVar === true,
        varName: result.varName,
        message: result.removedVar
          ? `Removed variable {{${result.varName}}}`
          : "Failed to remove variable",
      };

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
