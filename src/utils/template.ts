/**
 * Template variable substitution engine for command templates
 * Supports {{port}}, {{hostname}}, {{url}}, {{https-cert}}, {{https-key}} and other variables
 */

import type { GlobalConfig } from "../types/config.js";

export interface TemplateVariables {
  port?: number | string;
  hostname?: string;
  url?: string;
  "https-cert"?: string;
  "https-key"?: string;
  [key: string]: string | number | undefined;
}

// Regex to match template variables like {{port}}, {{ port }}, or {{https-cert}}
const TEMPLATE_REGEX = /\{\{\s*([\w-]+)\s*\}\}/g;

/**
 * Render a template string by substituting variables
 * @param template - The template string containing {{variable}} placeholders
 * @param variables - Object containing variable values to substitute
 * @returns The rendered string with variables replaced
 */
export function renderTemplate(template: string, variables: TemplateVariables): string {
  return template.replace(TEMPLATE_REGEX, (match, varName: string) => {
    const value = variables[varName];
    if (value !== undefined) {
      return String(value);
    }
    // Leave unresolved variables unchanged
    return match;
  });
}

/**
 * Extract all unique variable names from a template string
 * @param template - The template string to analyze
 * @returns Array of unique variable names found in the template
 */
export function extractVariables(template: string): string[] {
  const variables = new Set<string>();
  let match;

  // Reset regex state
  TEMPLATE_REGEX.lastIndex = 0;

  while ((match = TEMPLATE_REGEX.exec(template)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * Parse an array of KEY=VALUE strings into a Record
 * @param envStrings - Array of strings in KEY=VALUE format
 * @returns Record with parsed key-value pairs
 * @throws Error if a string is not in valid KEY=VALUE format
 */
export function parseEnvStrings(envStrings: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const str of envStrings) {
    const equalsIndex = str.indexOf("=");
    if (equalsIndex === -1) {
      throw new Error(`Invalid environment variable format: "${str}". Expected KEY=VALUE format.`);
    }

    const key = str.slice(0, equalsIndex);
    const value = str.slice(equalsIndex + 1);

    if (!key) {
      throw new Error(`Invalid environment variable format: "${str}". Key cannot be empty.`);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Render template variables in all values of an env object
 * @param env - Record of environment variables with potential template values
 * @param variables - Template variables to substitute
 * @returns New record with all values having templates substituted
 */
export function renderEnvTemplates(
  env: Record<string, string>,
  variables: TemplateVariables,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    result[key] = renderTemplate(value, variables);
  }

  return result;
}

/**
 * Generate template variables from configuration
 * @param config - Global configuration object
 * @param port - The port number for this server
 * @returns TemplateVariables object ready for template substitution
 */
export function getTemplateVariables(
  config: GlobalConfig,
  port: number,
): TemplateVariables {
  return {
    port,
    hostname: config.hostname,
    url: `${config.protocol}://${config.hostname}:${port}`,
    "https-cert": config.httpsCert ?? "",
    "https-key": config.httpsKey ?? "",
  };
}

/**
 * Mapping from template variable names to their corresponding config keys
 * Variables not in this map are auto-generated (port, url) and can't be configured
 */
export const TEMPLATE_VAR_TO_CONFIG_KEY: Record<string, keyof GlobalConfig | null> = {
  "port": null,           // Auto-assigned, not configurable
  "hostname": "hostname",
  "url": null,            // Auto-generated from protocol/hostname/port
  "https-cert": "httpsCert",
  "https-key": "httpsKey",
};

/**
 * Human-readable prompts for each configurable template variable
 */
export const TEMPLATE_VAR_PROMPTS: Record<string, string> = {
  "hostname": "Server hostname (e.g., localhost, 0.0.0.0):",
  "https-cert": "Path to HTTPS certificate file:",
  "https-key": "Path to HTTPS private key file:",
};

/**
 * Information about a missing template variable
 */
export interface MissingVariable {
  /** The template variable name (e.g., "https-cert") */
  templateVar: string;
  /** The config key to set (e.g., "httpsCert"), or null if not configurable */
  configKey: keyof GlobalConfig | null;
  /** Human-readable prompt for the user */
  prompt: string;
  /** Whether this variable can be configured by the user */
  configurable: boolean;
}

/**
 * Find template variables that are used but have empty or missing values
 * @param template - The template string to analyze
 * @param variables - The current template variables
 * @returns Array of MissingVariable objects for variables that need values
 */
export function findMissingVariables(
  template: string,
  variables: TemplateVariables,
): MissingVariable[] {
  const usedVars = extractVariables(template);
  const missing: MissingVariable[] = [];

  for (const varName of usedVars) {
    const value = variables[varName];

    // Check if the value is empty, undefined, or an empty string
    if (value === undefined || value === "" || value === null) {
      const configKey = TEMPLATE_VAR_TO_CONFIG_KEY[varName] ?? null;
      const configurable = configKey !== null;
      const prompt = TEMPLATE_VAR_PROMPTS[varName] ?? `Value for ${varName}:`;

      missing.push({
        templateVar: varName,
        configKey,
        prompt,
        configurable,
      });
    }
  }

  return missing;
}

/**
 * Format missing variables as a user-friendly error message
 * @param missing - Array of missing variables
 * @returns Formatted error message string
 */
export function formatMissingVariablesError(missing: MissingVariable[]): string {
  if (missing.length === 0) {
    return "";
  }

  const lines: string[] = [
    "The following template variables are used but not configured:",
    "",
  ];

  for (const v of missing) {
    if (v.configurable) {
      lines.push(`  {{${v.templateVar}}} - Set with: servherd config --set ${v.configKey} --value <value>`);
    } else {
      lines.push(`  {{${v.templateVar}}} - This variable is auto-generated and cannot be configured directly`);
    }
  }

  return lines.join("\n");
}

/**
 * Format missing variables as an MCP-friendly error message
 * @param missing - Array of missing variables
 * @returns Formatted error message for MCP tool response
 */
export function formatMissingVariablesForMCP(missing: MissingVariable[]): string {
  if (missing.length === 0) {
    return "";
  }

  const configurable = missing.filter(v => v.configurable);

  if (configurable.length === 0) {
    return "Template uses auto-generated variables that have no value. This may indicate an internal error.";
  }

  const lines: string[] = [
    "Cannot start server: required configuration is missing.",
    "",
    "The command uses template variables that are not configured:",
  ];

  for (const v of configurable) {
    lines.push(`  - {{${v.templateVar}}}: Use servherd_config tool with set="${v.configKey}" and value="<path or value>"`);
  }

  lines.push("");
  lines.push("Please configure these values first, then retry the start command.");

  return lines.join("\n");
}
