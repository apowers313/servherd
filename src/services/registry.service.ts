import { pathExists, readJson, ensureDir, writeJson } from "fs-extra/esm";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import micromatch from "micromatch";
import { RegistrySchema, type Registry, type ServerEntry, type ServerFilter, type AddServerOptions } from "../types/registry.js";
import { generateName } from "../utils/names.js";
import { logger } from "../utils/logger.js";

const DEFAULT_REGISTRY: Registry = {
  version: "1",
  servers: [],
};

/**
 * Service for managing the server registry
 */
export class RegistryService {
  private registry: Registry;
  private registryDir: string;
  private registryPath: string;

  constructor() {
    this.registry = { ...DEFAULT_REGISTRY, servers: [] };
    this.registryDir = path.join(os.homedir(), ".servherd");
    this.registryPath = path.join(this.registryDir, "registry.json");
  }

  /**
   * Load registry from file
   */
  async load(): Promise<Registry> {
    try {
      const exists = await pathExists(this.registryPath);
      if (exists) {
        const fileRegistry = await readJson(this.registryPath);
        // Validate the loaded registry
        const parsed = RegistrySchema.safeParse(fileRegistry);
        if (parsed.success) {
          this.registry = parsed.data;
        } else {
          logger.warn({ error: parsed.error }, "Invalid registry file, using empty registry");
          this.registry = { ...DEFAULT_REGISTRY, servers: [] };
        }
      } else {
        this.registry = { ...DEFAULT_REGISTRY, servers: [] };
      }
    } catch {
      logger.warn("Failed to load registry file, using empty registry");
      this.registry = { ...DEFAULT_REGISTRY, servers: [] };
    }

    return this.registry;
  }

  /**
   * Save registry to file
   */
  async save(): Promise<void> {
    await ensureDir(this.registryDir);
    await writeJson(this.registryPath, this.registry, { spaces: 2 });
  }

  /**
   * Add a new server to the registry
   */
  async addServer(options: AddServerOptions): Promise<ServerEntry> {
    const existingNames = new Set(this.registry.servers.map((s) => s.name));
    const name = options.name || generateName(existingNames);
    const id = crypto.randomUUID();

    const entry: ServerEntry = {
      id,
      name,
      command: options.command,
      resolvedCommand: options.command, // Will be resolved with actual port later
      cwd: options.cwd,
      port: options.port,
      protocol: options.protocol || "http",
      hostname: options.hostname || "localhost",
      env: options.env || {},
      createdAt: new Date().toISOString(),
      pm2Name: `servherd-${name}`,
      tags: options.tags,
      description: options.description,
      usedConfigKeys: options.usedConfigKeys,
      configSnapshot: options.configSnapshot,
    };

    this.registry.servers.push(entry);
    await this.save();

    return entry;
  }

  /**
   * Find server by name
   */
  findByName(name: string): ServerEntry | undefined {
    return this.registry.servers.find((s) => s.name === name);
  }

  /**
   * Find server by ID
   */
  findById(id: string): ServerEntry | undefined {
    return this.registry.servers.find((s) => s.id === id);
  }

  /**
   * Find server by cwd and command (for detecting duplicate registrations)
   */
  findByCommandHash(cwd: string, command: string): ServerEntry | undefined {
    return this.registry.servers.find((s) => s.cwd === cwd && s.command === command);
  }

  /**
   * Update an existing server entry
   */
  async updateServer(id: string, updates: Partial<ServerEntry>): Promise<void> {
    const index = this.registry.servers.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error(`Server with id ${id} not found`);
    }

    this.registry.servers[index] = {
      ...this.registry.servers[index],
      ...updates,
    };

    await this.save();
  }

  /**
   * Remove a server from the registry
   */
  async removeServer(id: string): Promise<void> {
    const index = this.registry.servers.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error(`Server with id ${id} not found`);
    }

    this.registry.servers.splice(index, 1);
    await this.save();
  }

  /**
   * List servers with optional filtering
   */
  listServers(filter?: ServerFilter): ServerEntry[] {
    let servers = [...this.registry.servers];

    if (filter?.name) {
      servers = servers.filter((s) => s.name === filter.name);
    }

    if (filter?.tag) {
      servers = servers.filter((s) => s.tags?.includes(filter.tag as string));
    }

    if (filter?.cwd) {
      servers = servers.filter((s) => s.cwd === filter.cwd);
    }

    if (filter?.cmd) {
      const pattern = filter.cmd;
      servers = servers.filter((s) => micromatch.isMatch(s.command, pattern));
    }

    return servers;
  }

  /**
   * Get the registry file path
   */
  getRegistryPath(): string {
    return this.registryPath;
  }
}
