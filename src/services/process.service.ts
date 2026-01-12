import pm2 from "pm2";
import type { PM2ProcessDescription, PM2StartOptions, PM2Process } from "../types/pm2.js";
import type { ServerStatus } from "../types/registry.js";
import { logger } from "../utils/logger.js";

const SERVHERD_PREFIX = "servherd-";

/**
 * Service for managing processes via PM2
 */
export class ProcessService {
  private connected = false;

  /**
   * Connect to PM2 daemon
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.connect((err) => {
        if (err) {
          logger.error({ error: err }, "Failed to connect to PM2");
          reject(err);
          return;
        }
        this.connected = true;
        logger.debug("Connected to PM2");
        resolve();
      });
    });
  }

  /**
   * Disconnect from PM2 daemon
   */
  disconnect(): void {
    pm2.disconnect();
    this.connected = false;
    logger.debug("Disconnected from PM2");
  }

  /**
   * Ensure connected to PM2
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error("Not connected to PM2. Call connect() first.");
    }
  }

  /**
   * Start a new process
   */
  async start(options: PM2StartOptions): Promise<PM2Process[]> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      pm2.start(
        {
          name: options.name,
          script: options.script,
          args: options.args,
          cwd: options.cwd,
          env: options.env,
          instances: options.instances,
          autorestart: options.autorestart ?? false,
          watch: options.watch ?? false,
          max_memory_restart: options.max_memory_restart,
          output: options.output,
          error: options.error,
          // Enable ISO timestamps in logs by default
          log_date_format: options.log_date_format ?? "YYYY-MM-DDTHH:mm:ss.SSSZ",
        },
        (err, proc) => {
          if (err) {
            logger.error({ error: err, name: options.name }, "Failed to start process");
            reject(err);
            return;
          }
          logger.info({ name: options.name }, "Process started");
          resolve(proc as PM2Process[]);
        },
      );
    });
  }

  /**
   * Stop a process by name
   */
  async stop(name: string): Promise<PM2Process[]> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      pm2.stop(name, (err, proc) => {
        if (err) {
          logger.error({ error: err, name }, "Failed to stop process");
          reject(err);
          return;
        }
        logger.info({ name }, "Process stopped");
        resolve(proc as PM2Process[]);
      });
    });
  }

  /**
   * Restart a process by name
   */
  async restart(name: string): Promise<PM2Process[]> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      pm2.restart(name, (err, proc) => {
        if (err) {
          logger.error({ error: err, name }, "Failed to restart process");
          reject(err);
          return;
        }
        logger.info({ name }, "Process restarted");
        resolve(proc as PM2Process[]);
      });
    });
  }

  /**
   * Delete a process by name
   */
  async delete(name: string): Promise<PM2Process[]> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      pm2.delete(name, (err, proc) => {
        if (err) {
          logger.error({ error: err, name }, "Failed to delete process");
          reject(err);
          return;
        }
        logger.info({ name }, "Process deleted");
        resolve(proc as PM2Process[]);
      });
    });
  }

  /**
   * Get process description
   */
  async describe(name: string): Promise<PM2ProcessDescription | undefined> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      pm2.describe(name, (err, procDesc) => {
        if (err) {
          logger.error({ error: err, name }, "Failed to describe process");
          reject(err);
          return;
        }

        const desc = procDesc as PM2ProcessDescription[] | undefined;
        if (!desc || desc.length === 0) {
          resolve(undefined);
          return;
        }

        resolve(desc[0]);
      });
    });
  }

  /**
   * List all PM2 processes
   */
  async list(): Promise<PM2ProcessDescription[]> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      pm2.list((err, procList) => {
        if (err) {
          logger.error({ error: err }, "Failed to list processes");
          reject(err);
          return;
        }
        resolve((procList as PM2ProcessDescription[]) || []);
      });
    });
  }

  /**
   * List only servherd-managed processes
   */
  async listServherdProcesses(): Promise<PM2ProcessDescription[]> {
    const allProcesses = await this.list();
    return allProcesses.filter((p) => p.name.startsWith(SERVHERD_PREFIX));
  }

  /**
   * Get the status of a process
   */
  async getStatus(name: string): Promise<ServerStatus> {
    try {
      const proc = await this.describe(name);
      if (!proc) {
        return "unknown";
      }

      const status = proc.pm2_env.status;

      // Map PM2 status to ServerStatus
      switch (status) {
        case "online":
          return "online";
        case "stopped":
        case "stopping":
          return "stopped";
        case "errored":
          return "errored";
        default:
          return "unknown";
      }
    } catch {
      return "unknown";
    }
  }

  /**
   * Check if connected to PM2
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Flush (clear) logs for a process or all processes.
   * @param name - Process name to flush logs for, or undefined/all for all processes
   */
  async flush(name?: string): Promise<void> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      const pm2Name = name ?? "all";
      pm2.flush(pm2Name, (err) => {
        if (err) {
          logger.error({ error: err, name: pm2Name }, "Failed to flush logs");
          reject(err);
          return;
        }
        logger.info({ name: pm2Name }, "Logs flushed");
        resolve();
      });
    });
  }
}
