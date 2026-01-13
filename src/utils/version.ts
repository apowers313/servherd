import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedVersion: string | null = null;

/**
 * Get the version from package.json.
 * The version is cached after the first read for performance.
 */
export function getVersion(): string {
  if (!cachedVersion) {
    const packagePath = path.join(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
    cachedVersion = pkg.version;
  }
  return cachedVersion!;
}
