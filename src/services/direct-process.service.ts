/**
 * Direct Process Service
 * Spawns processes directly as children without using PM2.
 * Used in CI environments where processes should die with the parent.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import psTree from "ps-tree";
import { logger } from "../utils/logger.js";

export interface DirectProcessOptions {
  command: string;
  cwd: string;
  env?: Record<string, string>;
  /** Server name for logging purposes */
  name: string;
  /** Port the server will run on */
  port: number;
}

export interface DirectProcess {
  pid: number;
  process: ChildProcess;
  kill: () => Promise<void>;
}

/**
 * Get the log directory for direct processes
 */
function getLogDir(): string {
  const servherdHome = process.env.SERVHERD_HOME || homedir();
  return join(servherdHome, ".servherd", "logs", "direct");
}

/**
 * Kill a process and all its children using ps-tree
 * This ensures the entire process tree is terminated
 */
async function killProcessTree(pid: number, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  return new Promise((resolve) => {
    psTree(pid, (err, children) => {
      if (err) {
        logger.warn({ error: err, pid }, "Failed to get process tree, killing main process only");
      } else {
        // Kill children first (in reverse order - deepest first)
        for (const child of [...children].reverse()) {
          try {
            process.kill(parseInt(child.PID, 10), signal);
            logger.debug({ childPid: child.PID }, "Killed child process");
          } catch (e) {
            // Process may have already exited (ESRCH)
            const error = e as NodeJS.ErrnoException;
            if (error.code !== "ESRCH") {
              logger.warn({ error: e, childPid: child.PID }, "Failed to kill child process");
            }
          }
        }
      }

      // Kill the main process
      try {
        process.kill(pid, signal);
        logger.debug({ pid }, "Killed main process");
      } catch (e) {
        const error = e as NodeJS.ErrnoException;
        if (error.code !== "ESRCH") {
          logger.warn({ error: e, pid }, "Failed to kill main process");
        }
      }

      resolve();
    });
  });
}

/**
 * Parse a command string into executable and arguments
 */
function parseCommand(command: string): { executable: string; args: string[] } {
  const parts = command.trim().split(/\s+/);
  const executable = parts[0] || "node";
  const args = parts.slice(1);
  return { executable, args };
}

/**
 * Spawn a process directly without PM2
 * The process will be killed when the parent exits
 */
export function spawnDirect(options: DirectProcessOptions): DirectProcess {
  const { executable, args } = parseCommand(options.command);

  // Ensure log directory exists
  const logDir = getLogDir();
  mkdirSync(logDir, { recursive: true });

  // Create log files
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logBase = `${options.name}-${timestamp}`;
  const stdoutPath = join(logDir, `${logBase}-out.log`);
  const stderrPath = join(logDir, `${logBase}-err.log`);

  const stdoutStream = createWriteStream(stdoutPath, { flags: "a" });
  const stderrStream = createWriteStream(stderrPath, { flags: "a" });

  // Merge environment variables
  const env = {
    ...process.env,
    ...options.env,
    PORT: String(options.port),
  };

  logger.info(
    { name: options.name, command: options.command, cwd: options.cwd, port: options.port },
    "Starting process directly (no-daemon mode)",
  );

  const child = spawn(executable, args, {
    cwd: options.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    // Don't detach - we want this process to die with the parent
    detached: false,
  });

  // Pipe output to log files and console
  if (child.stdout) {
    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      stdoutStream.write(text);
      // Also write to parent's stdout for visibility
      process.stdout.write(`[${options.name}] ${text}`);
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      stderrStream.write(text);
      // Also write to parent's stderr for visibility
      process.stderr.write(`[${options.name}] ${text}`);
    });
  }

  child.on("error", (error) => {
    logger.error({ error, name: options.name }, "Process error");
  });

  child.on("exit", (code, signal) => {
    stdoutStream.end();
    stderrStream.end();
    logger.info({ name: options.name, code, signal }, "Process exited");
  });

  const kill = async (): Promise<void> => {
    if (child.pid) {
      logger.info({ name: options.name, pid: child.pid }, "Killing process tree");
      await killProcessTree(child.pid, "SIGTERM");

      // Give processes time to exit gracefully, then force kill
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(async () => {
          if (!child.killed && child.pid) {
            logger.warn({ name: options.name, pid: child.pid }, "Process did not exit gracefully, sending SIGKILL");
            await killProcessTree(child.pid, "SIGKILL");
          }
          resolve();
        }, 5000);

        child.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  };

  logger.info({ name: options.name, pid: child.pid }, "Process started");

  return {
    pid: child.pid!,
    process: child,
    kill,
  };
}

/**
 * Service for managing directly spawned processes
 */
export class DirectProcessService {
  private processes: Map<string, DirectProcess> = new Map();
  private cleanupRegistered = false;

  /**
   * Start a process directly (without PM2)
   */
  start(options: DirectProcessOptions): DirectProcess {
    const directProcess = spawnDirect(options);
    this.processes.set(options.name, directProcess);

    // Register cleanup handlers on first process
    if (!this.cleanupRegistered) {
      this.registerCleanupHandlers();
      this.cleanupRegistered = true;
    }

    return directProcess;
  }

  /**
   * Stop a specific process
   */
  async stop(name: string): Promise<void> {
    const proc = this.processes.get(name);
    if (proc) {
      await proc.kill();
      this.processes.delete(name);
    }
  }

  /**
   * Stop all managed processes
   */
  async stopAll(): Promise<void> {
    const promises = Array.from(this.processes.values()).map((proc) => proc.kill());
    await Promise.all(promises);
    this.processes.clear();
  }

  /**
   * Get the number of running processes
   */
  get count(): number {
    return this.processes.size;
  }

  /**
   * Check if a process is running
   */
  has(name: string): boolean {
    return this.processes.has(name);
  }

  /**
   * Register cleanup handlers for process exit
   */
  private registerCleanupHandlers(): void {
    const cleanup = async (signal: string): Promise<void> => {
      logger.info({ signal, processCount: this.processes.size }, "Received signal, cleaning up processes");
      await this.stopAll();
      process.exit(0);
    };

    // Handle various exit signals
    process.on("SIGINT", () => cleanup("SIGINT"));
    process.on("SIGTERM", () => cleanup("SIGTERM"));
    process.on("SIGHUP", () => cleanup("SIGHUP"));

    // Handle uncaught exceptions
    process.on("uncaughtException", async (error) => {
      logger.error({ error }, "Uncaught exception, cleaning up processes");
      await this.stopAll();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", async (reason) => {
      logger.error({ reason }, "Unhandled rejection, cleaning up processes");
      await this.stopAll();
      process.exit(1);
    });

    // Handle normal exit
    process.on("beforeExit", async () => {
      if (this.processes.size > 0) {
        logger.info({ processCount: this.processes.size }, "Process exiting, cleaning up");
        await this.stopAll();
      }
    });

    logger.debug("Cleanup handlers registered for direct process management");
  }
}
