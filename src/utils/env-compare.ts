/**
 * Utility functions for comparing environment variable configurations.
 * Used to detect when a server needs to be restarted due to env changes.
 */

/**
 * Check if environment variables have changed between two env objects.
 *
 * This function performs a deep comparison of environment variable objects
 * to determine if they are semantically equivalent. It handles:
 * - undefined/null values (treated as empty object)
 * - Different key counts
 * - Different key names
 * - Different values for same keys
 * - Key ordering (order does not affect comparison)
 *
 * @param oldEnv - The current/stored environment variables
 * @param newEnv - The new environment variables from the command
 * @returns true if the environment has changed, false if they are equivalent
 *
 * @example
 * // Returns true - value changed
 * hasEnvChanged({ API: "old" }, { API: "new" })
 *
 * @example
 * // Returns true - key added
 * hasEnvChanged({}, { NEW: "value" })
 *
 * @example
 * // Returns true - key removed
 * hasEnvChanged({ OLD: "value" }, {})
 *
 * @example
 * // Returns false - same content, different order
 * hasEnvChanged({ A: "1", B: "2" }, { B: "2", A: "1" })
 */
export function hasEnvChanged(
  oldEnv: Record<string, string> | undefined,
  newEnv: Record<string, string> | undefined,
): boolean {
  // Normalize undefined/null/empty to empty object for comparison
  const old = oldEnv ?? {};
  const next = newEnv ?? {};

  const oldKeys = Object.keys(old).sort();
  const newKeys = Object.keys(next).sort();

  // Different number of keys means env has changed
  if (oldKeys.length !== newKeys.length) {
    return true;
  }

  // Different key names means env has changed
  if (oldKeys.join(",") !== newKeys.join(",")) {
    return true;
  }

  // Check if any values differ
  for (const key of oldKeys) {
    if (old[key] !== next[key]) {
      return true;
    }
  }

  return false;
}
