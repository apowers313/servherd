/**
 * Template variable substitution engine for command templates
 * Supports {{port}}, {{hostname}}, {{url}}, {{https-cert}}, {{https-key}} and other variables
 * Also supports {{$ "service" "prop"}} for cross-server lookups
 */

import Handlebars from "handlebars";
import type { GlobalConfig } from "../types/config.js";
import type { ServerEntry } from "../types/registry.js";

export interface TemplateVariables {
  port?: number | string;
  hostname?: string;
  url?: string;
  "https-cert"?: string;
  "https-key"?: string;
  [key: string]: string | number | undefined;
}

/**
 * Context for template rendering, including server lookup capabilities
 */
export interface TemplateContext {
  /**
   * Function to look up another server by name within a working directory
   * Returns the server entry or undefined if not found
   */
  lookupServer?: (name: string, cwd?: string) => ServerEntry | undefined;
  /**
   * Default working directory for server lookups
   */
  cwd?: string;
}

/**
 * Register the $ helper for cross-server lookups
 * Supports both positional and hash arguments:
 *   {{$ "service-name" "property"}}
 *   {{$ service="service-name" prop="property" cwd="/path"}}
 */
function registerServerLookupHelper(context: TemplateContext): void {
  Handlebars.registerHelper("$", function (...args: unknown[]) {
    const options = args.pop() as Handlebars.HelperOptions;

    let service: string | undefined;
    let prop: string | undefined;
    let cwd: string | undefined;

    if (args.length >= 2) {
      // Positional: {{$ "backend" "port"}}
      [service, prop, cwd] = args as [string, string, string | undefined];
    } else {
      // Hash: {{$ service="backend" prop="port"}}
      const h = options.hash as Record<string, string>;
      service = h.service || h.svc;
      prop = h.prop || h.property;
      cwd = h.cwd;
    }

    // Use provided cwd or fall back to context cwd
    const effectiveCwd = cwd || context.cwd;

    if (!service) {
      throw new Error("$ helper requires a service name (positional or service=/svc= hash argument)");
    }
    if (!prop) {
      throw new Error("$ helper requires a property name (positional or prop=/property= hash argument)");
    }
    if (!context.lookupServer) {
      throw new Error("$ helper requires a server lookup function in template context");
    }
    if (!effectiveCwd) {
      throw new Error("$ helper requires a cwd (via hash argument or template context)");
    }

    const server = context.lookupServer(service, effectiveCwd);
    if (!server) {
      throw new Error(`Server "${service}" not found in ${effectiveCwd}`);
    }

    const value = server[prop as keyof ServerEntry];
    if (value === undefined) {
      throw new Error(`Property "${prop}" not found on server "${service}"`);
    }

    return String(value);
  });
}

/**
 * Unregister the $ helper (for cleanup between renders with different contexts)
 */
function unregisterServerLookupHelper(): void {
  Handlebars.unregisterHelper("$");
}

/**
 * Render a template string by substituting variables
 * @param template - The template string containing {{variable}} placeholders
 * @param variables - Object containing variable values to substitute
 * @param context - Optional context for advanced features like server lookups
 * @returns The rendered string with variables replaced
 */
export function renderTemplate(
  template: string,
  variables: TemplateVariables,
  context?: TemplateContext,
): string {
  try {
    // Always register $ helper (it will throw if used without proper context)
    registerServerLookupHelper(context ?? {});

    // Register helperMissing to preserve undefined variables as-is
    // This maintains backwards compatibility with the old regex-based approach
    Handlebars.registerHelper("helperMissing", function (...args: unknown[]) {
      // helperMissing receives the options object with a 'name' property (not in official types)
      const options = args[args.length - 1] as { name: string };
      // Return the original handlebars expression
      return `{{${options.name}}}`;
    });

    const compiled = Handlebars.compile(template, { noEscape: true, strict: false });
    return compiled(variables);
  } finally {
    // Always unregister to avoid context leaking between renders
    Handlebars.unregisterHelper("helperMissing");
    unregisterServerLookupHelper();
  }
}

// Legacy regex for extractVariables (still needed for analysis functions)
const TEMPLATE_REGEX = /\{\{\s*([\w-]+)\s*\}\}/g;

// Regex to detect $ helper usage
const SERVER_LOOKUP_REGEX = /\{\{\s*\$\s+/;

/**
 * Extract all unique variable names from a template string
 * Note: This only extracts simple {{varName}} variables, not $ helper calls
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
 * Check if a template uses the $ helper for server lookups
 * @param template - The template string to analyze
 * @returns True if the template contains {{$ ...}} syntax
 */
export function usesServerLookup(template: string): boolean {
  return SERVER_LOOKUP_REGEX.test(template);
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
 * @param context - Optional context for advanced features like server lookups
 * @returns New record with all values having templates substituted
 */
export function renderEnvTemplates(
  env: Record<string, string>,
  variables: TemplateVariables,
  context?: TemplateContext,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    result[key] = renderTemplate(value, variables, context);
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
    // User-defined custom variables (spread first so built-ins take precedence)
    ...(config.variables ?? {}),
    // Built-in variables
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
 * Config keys that affect servers implicitly (not via template variables)
 * These are always tracked in the config snapshot
 */
export const IMPLICIT_CONFIG_DEPENDENCIES = {
  portRange: true,   // Affects all servers - port must be in range
  protocol: true,    // Affects servers using {{url}} - changes the URL scheme
} as const;

/**
 * Check if a command template uses the {{url}} variable
 * Servers using {{url}} implicitly depend on protocol
 */
export function usesUrlVariable(command: string): boolean {
  return extractVariables(command).includes("url");
}

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
  /** Whether this is a custom user-defined variable */
  isCustomVar: boolean;
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
      const isBuiltIn = varName in TEMPLATE_VAR_TO_CONFIG_KEY;
      const configurable = configKey !== null;
      const isCustomVar = !isBuiltIn;
      const prompt = TEMPLATE_VAR_PROMPTS[varName] ?? `Value for ${varName}:`;

      missing.push({
        templateVar: varName,
        configKey,
        prompt,
        configurable: configurable || isCustomVar, // Custom vars are always configurable via --add
        isCustomVar,
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
    if (v.isCustomVar) {
      lines.push(`  {{${v.templateVar}}} - Add with: servherd config --add ${v.templateVar} --value <value>`);
    } else if (v.configurable) {
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
    if (v.isCustomVar) {
      lines.push(`  - {{${v.templateVar}}}: Use servherd_config tool with add="${v.templateVar}" and addValue="<value>"`);
    } else {
      lines.push(`  - {{${v.templateVar}}}: Use servherd_config tool with set="${v.configKey}" and value="<path or value>"`);
    }
  }

  lines.push("");
  lines.push("Please configure these values first, then retry the start command.");

  return lines.join("\n");
}
