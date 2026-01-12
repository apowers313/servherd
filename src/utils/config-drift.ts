/**
 * Utilities for detecting configuration drift in servers.
 * Drift occurs when config values have changed since a server was started.
 */

import type { GlobalConfig } from "../types/config.js";
import type { ServerEntry, ConfigSnapshot } from "../types/registry.js";
import { extractVariables, TEMPLATE_VAR_TO_CONFIG_KEY } from "./template.js";

/**
 * Information about a drifted config value
 */
export interface DriftedValue {
  /** The config key that has drifted */
  configKey: string;
  /** The template variable name */
  templateVar: string;
  /** The value when server was started */
  startedWith: string | undefined;
  /** The current config value */
  currentValue: string | undefined;
}

/**
 * Result of drift detection for a server
 */
export interface DriftResult {
  /** Whether the server has config drift */
  hasDrift: boolean;
  /** List of drifted values */
  driftedValues: DriftedValue[];
}

/**
 * Extract the config keys used by a command template
 * @param command - The command template string
 * @returns Array of config keys used (e.g., ["hostname", "httpsCert"])
 */
export function extractUsedConfigKeys(command: string): string[] {
  const templateVars = extractVariables(command);
  const configKeys: string[] = [];

  for (const varName of templateVars) {
    const configKey = TEMPLATE_VAR_TO_CONFIG_KEY[varName];
    if (configKey) {
      configKeys.push(configKey);
    }
  }

  return [...new Set(configKeys)]; // Deduplicate
}

/**
 * Create a config snapshot containing only the values used by a server
 * @param config - Current global config
 * @param usedConfigKeys - Config keys used by the server
 * @returns Config snapshot with only relevant values
 */
export function createConfigSnapshot(
  config: GlobalConfig,
  usedConfigKeys: string[],
): ConfigSnapshot {
  const snapshot: ConfigSnapshot = {};

  for (const key of usedConfigKeys) {
    if (key === "hostname") {
      snapshot.hostname = config.hostname;
    } else if (key === "httpsCert") {
      snapshot.httpsCert = config.httpsCert;
    } else if (key === "httpsKey") {
      snapshot.httpsKey = config.httpsKey;
    }
  }

  return snapshot;
}

/**
 * Detect config drift for a server
 * @param server - Server entry from registry
 * @param currentConfig - Current global config
 * @returns Drift detection result
 */
export function detectDrift(
  server: ServerEntry,
  currentConfig: GlobalConfig,
): DriftResult {
  const driftedValues: DriftedValue[] = [];

  // If no snapshot exists, we can't detect drift
  if (!server.configSnapshot || !server.usedConfigKeys) {
    return { hasDrift: false, driftedValues: [] };
  }

  for (const configKey of server.usedConfigKeys) {
    let startedWith: string | undefined;
    let currentValue: string | undefined;
    let templateVar: string | undefined;

    if (configKey === "hostname") {
      startedWith = server.configSnapshot.hostname;
      currentValue = currentConfig.hostname;
      templateVar = "hostname";
    } else if (configKey === "httpsCert") {
      startedWith = server.configSnapshot.httpsCert;
      currentValue = currentConfig.httpsCert;
      templateVar = "https-cert";
    } else if (configKey === "httpsKey") {
      startedWith = server.configSnapshot.httpsKey;
      currentValue = currentConfig.httpsKey;
      templateVar = "https-key";
    }

    if (templateVar && startedWith !== currentValue) {
      driftedValues.push({
        configKey,
        templateVar,
        startedWith,
        currentValue,
      });
    }
  }

  return {
    hasDrift: driftedValues.length > 0,
    driftedValues,
  };
}

/**
 * Find all servers that use a specific config key
 * @param servers - Array of server entries
 * @param configKey - The config key to search for
 * @returns Array of servers using that config key
 */
export function findServersUsingConfigKey(
  servers: ServerEntry[],
  configKey: string,
): ServerEntry[] {
  return servers.filter(server =>
    server.usedConfigKeys?.includes(configKey),
  );
}

/**
 * Find all servers with config drift
 * @param servers - Array of server entries
 * @param currentConfig - Current global config
 * @returns Array of servers with drift and their drift details
 */
export function findServersWithDrift(
  servers: ServerEntry[],
  currentConfig: GlobalConfig,
): Array<{ server: ServerEntry; drift: DriftResult }> {
  const results: Array<{ server: ServerEntry; drift: DriftResult }> = [];

  for (const server of servers) {
    const drift = detectDrift(server, currentConfig);
    if (drift.hasDrift) {
      results.push({ server, drift });
    }
  }

  return results;
}

/**
 * Format drift information for display
 * @param drift - Drift result to format
 * @returns Formatted string describing the drift
 */
export function formatDrift(drift: DriftResult): string {
  if (!drift.hasDrift) {
    return "No config drift";
  }

  const lines = drift.driftedValues.map(d => {
    const started = d.startedWith ?? "(not set)";
    const current = d.currentValue ?? "(not set)";
    return `  ${d.configKey}: "${started}" → "${current}"`;
  });

  return `Config drift detected:\n${lines.join("\n")}`;
}
