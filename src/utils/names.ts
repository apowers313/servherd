import { createHash } from "crypto";
import { FlexiHumanHash } from "flexi-human-hash";

// Shared instance for random name generation
const fhh = new FlexiHumanHash("{{adjective}}-{{noun}}");

/**
 * Normalize command + env into a consistent hashable string.
 * Used to generate deterministic server names.
 * @param command - The command string
 * @param env - Optional environment variables
 * @returns A normalized string suitable for hashing
 */
export function normalizeForHash(command: string, env?: Record<string, string>): string {
  // Normalize command: trim and collapse multiple spaces
  const normalizedCommand = command.trim().replace(/\s+/g, " ");

  // Normalize env: sort keys, create deterministic string
  let envString = "";
  if (env && Object.keys(env).length > 0) {
    envString = Object.keys(env)
      .sort()
      .map((key) => `${key}=${env[key] ?? ""}`)
      .join("&");
  }

  // Combine with pipe separator
  return envString ? `${normalizedCommand}|${envString}` : normalizedCommand;
}

/**
 * Generate a deterministic name from command and environment.
 * Same inputs always produce the same name.
 * Uses crypto hash for determinism, then FlexiHumanHash for human-readable output.
 * @param command - The command string
 * @param env - Optional environment variables
 * @returns A deterministic human-readable name in adjective-noun format
 */
export function generateDeterministicName(command: string, env?: Record<string, string>): string {
  const hashInput = normalizeForHash(command, env);
  // Create a deterministic hash first
  const hashHex = createHash("sha256").update(hashInput).digest("hex");
  // Create a fresh FlexiHumanHash instance for deterministic output
  // (the library has internal state that causes non-determinism with reused instances)
  const deterministicFhh = new FlexiHumanHash("{{adjective}}-{{noun}}");
  return deterministicFhh.hash(hashHex);
}

/**
 * Generate a human-readable name in adjective-noun format
 * @param existing - Set of existing names to avoid duplicates
 * @param maxAttempts - Maximum number of attempts to generate a unique name
 * @returns A unique human-readable name
 */
export function generateName(existing?: Set<string>, maxAttempts = 100): string {
  for (let i = 0; i < maxAttempts; i++) {
    const name = fhh.hash();

    if (!existing || !existing.has(name)) {
      return name;
    }
  }

  // Fallback: add a unique suffix if we can't find a unique name
  const baseName = fhh.hash();
  const timestamp = Date.now().toString(36).slice(-4);
  return `${baseName}-${timestamp}`;
}
