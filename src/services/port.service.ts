import detectPort from "detect-port";
import { pathExists, readJson, writeJson, ensureDir } from "fs-extra/esm";
import * as path from "path";
import type { GlobalConfig } from "../types/config.js";
import { ServherdError, ServherdErrorCode } from "../types/errors.js";
import { logger } from "../utils/logger.js";

/**
 * Result of port assignment, including whether a different port was assigned
 */
export interface PortAssignmentResult {
  port: number;
  reassigned: boolean;
}

/**
 * CI ports file schema for persistence
 */
interface CiPortsData {
  ports: number[];
  timestamp: number;
}

/**
 * Service for deterministic port generation and port availability checking
 * using FNV-1a hashing and detect-port library
 */
export class PortService {
  private portRange: { min: number; max: number };
  private usedPorts: Set<number> = new Set();
  private tempDir: string;

  constructor(config: GlobalConfig) {
    this.portRange = config.portRange;
    this.tempDir = config.tempDir;
  }

  /**
   * Track a port as used (for CI mode sequential allocation)
   * @param port - Port number to mark as used
   */
  trackUsedPort(port: number): void {
    this.usedPorts.add(port);
  }

  /**
   * Clear all tracked used ports
   */
  clearUsedPorts(): void {
    this.usedPorts.clear();
  }

  /**
   * Get the set of CI used ports (for testing and inspection)
   * @returns Set of port numbers marked as used in CI mode
   */
  getCiUsedPorts(): Set<number> {
    return new Set(this.usedPorts);
  }

  /**
   * Load CI used ports from persistence file
   * Cleans up stale entries (older than 1 hour)
   */
  async loadCiUsedPorts(): Promise<void> {
    const ciPortsFile = path.join(this.tempDir, "ci-ports.json");

    try {
      if (await pathExists(ciPortsFile)) {
        const data = await readJson(ciPortsFile) as CiPortsData;

        // Clean up stale entries (older than 1 hour)
        const ONE_HOUR = 3600000;
        if (Date.now() - data.timestamp < ONE_HOUR) {
          for (const port of data.ports) {
            this.usedPorts.add(port);
          }
          logger.debug({ ports: data.ports }, "Loaded CI ports from file");
        } else {
          logger.debug("CI ports file is stale, ignoring");
        }
      }
    } catch (error) {
      logger.warn({ error }, "Failed to load CI ports file, starting fresh");
      // Continue with empty set - don't fail on corrupted file
    }
  }

  /**
   * Save CI used ports to persistence file
   */
  async saveCiUsedPorts(): Promise<void> {
    const ciPortsFile = path.join(this.tempDir, "ci-ports.json");

    try {
      await ensureDir(this.tempDir);
      const data: CiPortsData = {
        ports: Array.from(this.usedPorts),
        timestamp: Date.now(),
      };
      await writeJson(ciPortsFile, data);
      logger.debug({ ports: data.ports }, "Saved CI ports to file");
    } catch (error) {
      logger.warn({ error }, "Failed to save CI ports file");
      // Don't fail the operation if we can't persist
    }
  }

  /**
   * Generate a deterministic port number based on cwd and command
   * Uses FNV-1a hash to ensure consistent port assignment for the same inputs
   * @param cwd - Working directory of the server
   * @param command - Command used to start the server
   * @returns A port number within the configured range
   */
  generatePort(cwd: string, command: string): number {
    const hash = this.computeHash(cwd, command);
    const range = this.portRange.max - this.portRange.min + 1;
    return this.portRange.min + (hash % range);
  }

  /**
   * Compute FNV-1a hash of the combined input string
   * FNV-1a is a fast, non-cryptographic hash with good distribution
   * @param cwd - Working directory
   * @param command - Command string
   * @returns A positive 32-bit integer hash
   */
  computeHash(cwd: string, command: string): number {
    const input = `${cwd}:${command}`;
    return this.fnv1aHash(input);
  }

  /**
   * Check if a port is available for use
   * @param port - Port number to check
   * @returns true if port is available, false otherwise
   */
  async isPortAvailable(port: number): Promise<boolean> {
    const availablePort = await detectPort(port);
    return availablePort === port;
  }

  /**
   * Get an available port, starting from the preferred port
   * If preferred is not available, searches for next available in range
   * @param preferred - Preferred port number to try first
   * @returns Object with assigned port and whether it was reassigned
   */
  async getAvailablePort(preferred: number): Promise<PortAssignmentResult> {
    // Try preferred port first
    if (await this.isPortAvailable(preferred)) {
      return { port: preferred, reassigned: false };
    }

    // Find next available port in range (from preferred+1 to max)
    for (let port = preferred + 1; port <= this.portRange.max; port++) {
      if (await this.isPortAvailable(port)) {
        return { port, reassigned: true };
      }
    }

    // Wrap around and check from min to preferred-1
    for (let port = this.portRange.min; port < preferred; port++) {
      if (await this.isPortAvailable(port)) {
        return { port, reassigned: true };
      }
    }

    throw new ServherdError(
      ServherdErrorCode.PORT_ALLOCATION_FAILED,
      `No available ports in range ${this.portRange.min}-${this.portRange.max}`,
    );
  }

  /**
   * Assign a port for a server, checking availability
   * @param cwd - Working directory of the server
   * @param command - Command used to start the server
   * @param explicitPort - Optional explicit port to use (takes precedence)
   * @param ciMode - If true, use sequential port allocation instead of deterministic
   * @returns Object with assigned port and whether it was reassigned
   */
  async assignPort(
    cwd: string,
    command: string,
    explicitPort?: number,
    ciMode: boolean = false,
  ): Promise<PortAssignmentResult> {
    if (explicitPort !== undefined) {
      this.validatePortInRange(explicitPort);
      return this.getAvailablePort(explicitPort);
    }

    if (ciMode) {
      return this.getNextAvailableSequential();
    }

    const preferred = this.generatePort(cwd, command);
    return this.getAvailablePort(preferred);
  }

  /**
   * Get next available port sequentially from the configured range
   * Used in CI mode to avoid hash collisions and ensure predictable behavior
   * @returns Object with assigned port and whether it was reassigned
   */
  private async getNextAvailableSequential(): Promise<PortAssignmentResult> {
    let skippedPorts = false;

    for (let port = this.portRange.min; port <= this.portRange.max; port++) {
      // Skip ports we've already allocated in this session
      if (this.usedPorts.has(port)) {
        skippedPorts = true;
        continue;
      }

      if (await this.isPortAvailable(port)) {
        // If we skipped any ports (either tracked or unavailable), mark as reassigned
        return { port, reassigned: skippedPorts };
      }

      skippedPorts = true;
    }

    throw new ServherdError(
      ServherdErrorCode.PORT_ALLOCATION_FAILED,
      `No available ports in range ${this.portRange.min}-${this.portRange.max}`,
    );
  }

  /**
   * Validate that a port is within the configured range
   * @param port - Port number to validate
   * @throws ServherdError if port is outside range
   */
  validatePortInRange(port: number): void {
    if (port < this.portRange.min || port > this.portRange.max) {
      throw new ServherdError(
        ServherdErrorCode.PORT_OUT_OF_RANGE,
        `Port ${port} is outside configured range ${this.portRange.min}-${this.portRange.max}`,
      );
    }
  }

  /**
   * FNV-1a hash implementation
   * @param str - String to hash
   * @returns A positive 32-bit integer
   */
  private fnv1aHash(str: string): number {
    // FNV-1a parameters for 32-bit hash
    const FNV_PRIME = 0x01000193;
    const FNV_OFFSET_BASIS = 0x811c9dc5;

    let hash = FNV_OFFSET_BASIS;

    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      // Multiply by FNV prime and keep 32-bit
      hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }

    // Ensure positive integer
    return hash >>> 0;
  }
}
