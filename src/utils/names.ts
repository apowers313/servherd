import { FlexiHumanHash } from "flexi-human-hash";

const fhh = new FlexiHumanHash("{{adjective}}-{{noun}}");

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
