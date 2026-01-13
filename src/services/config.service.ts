import { cosmiconfig, type CosmiconfigResult } from "cosmiconfig";
import { ensureDir, writeJson } from "fs-extra/esm";
import { chmod } from "fs/promises";
import * as path from "path";
import * as os from "os";
import { DEFAULT_CONFIG, GlobalConfigSchema, type GlobalConfig } from "../types/config.js";
import { logger } from "../utils/logger.js";

const MODULE_NAME = "servherd";

/**
 * Configuration search locations (in order of precedence):
 * 1. Project-local configs (searched from cwd upward):
 *    - package.json "servherd" key
 *    - .servherdrc (JSON or YAML)
 *    - .servherdrc.json
 *    - .servherdrc.yaml / .servherdrc.yml
 *    - .servherdrc.js / .servherdrc.cjs
 *    - servherd.config.js / servherd.config.cjs
 * 2. Global config: ~/.servherd/config.json
 * 3. Environment variables (highest priority)
 */

/**
 * Service for managing global configuration using cosmiconfig
 */
export class ConfigService {
  private config: GlobalConfig;
  private globalConfigDir: string;
  private globalConfigPath: string;
  private loadedFilepath: string | null = null;
  private explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      "package.json",
      `.${MODULE_NAME}rc`,
      `.${MODULE_NAME}rc.json`,
      `.${MODULE_NAME}rc.yaml`,
      `.${MODULE_NAME}rc.yml`,
      `.${MODULE_NAME}rc.js`,
      `.${MODULE_NAME}rc.cjs`,
      `${MODULE_NAME}.config.js`,
      `${MODULE_NAME}.config.cjs`,
    ],
  });

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    const homeDir = process.env.SERVHERD_HOME || os.homedir();
    this.globalConfigDir = path.join(homeDir, ".servherd");
    this.globalConfigPath = path.join(this.globalConfigDir, "config.json");
  }

  /**
   * Load configuration from multiple sources with the following priority:
   * 1. Environment variables (highest)
   * 2. Project-local config file (if found)
   * 3. Global config file (~/.servherd/config.json)
   * 4. Default values (lowest)
   */
  async load(searchFrom?: string): Promise<GlobalConfig> {
    let baseConfig = { ...DEFAULT_CONFIG };

    // First, try to load global config
    const globalResult = await this.loadGlobalConfig();
    if (globalResult) {
      baseConfig = this.mergeConfigs(baseConfig, globalResult);
    }

    // Then, search for project-local config (overrides global)
    const projectResult = await this.searchProjectConfig(searchFrom);
    if (projectResult?.config && typeof projectResult.config === "object") {
      // Accept partial configs without strict validation - merge will handle defaults
      baseConfig = this.mergeConfigs(baseConfig, projectResult.config);
      this.loadedFilepath = projectResult.filepath;
      logger.debug({ filepath: projectResult.filepath }, "Loaded project config");
    }

    // Finally, apply environment variable overrides (highest priority)
    this.config = this.applyEnvironmentOverrides(baseConfig);

    return this.config;
  }

  /**
   * Load the global config file from ~/.servherd/config.json
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadGlobalConfig(): Promise<Record<string, any> | null> {
    try {
      const result = await this.explorer.load(this.globalConfigPath);
      if (result?.config) {
        const parsed = GlobalConfigSchema.deepPartial().safeParse(result.config);
        if (parsed.success) {
          logger.debug({ filepath: this.globalConfigPath }, "Loaded global config");
          return parsed.data;
        }
        logger.warn({ error: parsed.error }, "Invalid global config file, ignoring");
      }
    } catch {
      // Global config doesn't exist or is unreadable, that's fine
      logger.debug("No global config found");
    }
    return null;
  }

  /**
   * Search for project-local config starting from the given directory
   */
  private async searchProjectConfig(searchFrom?: string): Promise<CosmiconfigResult | null> {
    try {
      const result = await this.explorer.search(searchFrom);
      // Don't return if it's the global config (we handle that separately)
      if (result?.filepath === this.globalConfigPath) {
        return null;
      }
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Merge partial config into base config (supports deeply partial configs)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mergeConfigs(base: GlobalConfig, partial: Record<string, any>): GlobalConfig {
    return {
      ...base,
      ...partial,
      portRange: {
        ...base.portRange,
        ...(partial.portRange || {}),
      },
      pm2: {
        ...base.pm2,
        ...(partial.pm2 || {}),
      },
    };
  }

  /**
   * Save configuration to the global config file
   * Sets file permissions to 600 (owner read/write only) to protect sensitive data
   */
  async save(config: GlobalConfig): Promise<void> {
    await ensureDir(this.globalConfigDir);
    // Set directory permissions to 700 (owner only)
    await chmod(this.globalConfigDir, 0o700);
    await writeJson(this.globalConfigPath, config, { spaces: 2 });
    // Set file permissions to 600 (owner read/write only) to protect secrets
    await chmod(this.globalConfigPath, 0o600);
    this.config = config;
  }

  /**
   * Get a configuration value
   */
  get<K extends keyof GlobalConfig>(key: K): GlobalConfig[K] {
    return this.config[key];
  }

  /**
   * Set a configuration value and persist to the global config file
   */
  async set<K extends keyof GlobalConfig>(key: K, value: GlobalConfig[K]): Promise<void> {
    this.config[key] = value;
    await this.save(this.config);
  }

  /**
   * Get default configuration
   */
  getDefaults(): GlobalConfig {
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Get the global config file path
   */
  getConfigPath(): string {
    return this.globalConfigPath;
  }

  /**
   * Get the path of the currently loaded config file (if any)
   */
  getLoadedConfigPath(): string | null {
    return this.loadedFilepath;
  }

  /**
   * Get all supported config file names for documentation
   */
  getSupportedConfigFiles(): string[] {
    return [
      "package.json (\"servherd\" key)",
      ".servherdrc",
      ".servherdrc.json",
      ".servherdrc.yaml",
      ".servherdrc.yml",
      ".servherdrc.js",
      ".servherdrc.cjs",
      "servherd.config.js",
      "servherd.config.cjs",
      "~/.servherd/config.json (global)",
    ];
  }

  /**
   * Apply environment variable overrides to configuration
   */
  applyEnvironmentOverrides(config: GlobalConfig): GlobalConfig {
    const result = { ...config };

    if (process.env.SERVHERD_HOSTNAME) {
      result.hostname = process.env.SERVHERD_HOSTNAME;
    }

    if (process.env.SERVHERD_PROTOCOL) {
      const protocol = process.env.SERVHERD_PROTOCOL;
      if (protocol === "http" || protocol === "https") {
        result.protocol = protocol;
      }
    }

    if (process.env.SERVHERD_PORT_MIN) {
      const min = parseInt(process.env.SERVHERD_PORT_MIN, 10);
      if (!isNaN(min)) {
        result.portRange = { ...result.portRange, min };
      }
    }

    if (process.env.SERVHERD_PORT_MAX) {
      const max = parseInt(process.env.SERVHERD_PORT_MAX, 10);
      if (!isNaN(max)) {
        result.portRange = { ...result.portRange, max };
      }
    }

    if (process.env.SERVHERD_TEMP_DIR) {
      result.tempDir = process.env.SERVHERD_TEMP_DIR;
    }

    if (process.env.SERVHERD_HTTPS_CERT) {
      result.httpsCert = process.env.SERVHERD_HTTPS_CERT;
    }

    if (process.env.SERVHERD_HTTPS_KEY) {
      result.httpsKey = process.env.SERVHERD_HTTPS_KEY;
    }

    return result;
  }

  /**
   * Clear the cosmiconfig cache (useful for testing or after config changes)
   */
  clearCache(): void {
    this.explorer.clearCaches();
  }
}
