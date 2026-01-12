import { watch, createReadStream } from "fs";
import { stat } from "fs/promises";
import { createInterface } from "readline";

/**
 * Follow a log file and emit new lines as they are written.
 * Similar to `tail -f` behavior.
 *
 * @param logPath - Path to the log file to follow
 * @param signal - AbortSignal to stop following
 * @param onLine - Callback for each new line
 * @returns Promise that resolves when following is stopped
 */
export async function followLog(
  logPath: string,
  signal: AbortSignal,
  onLine: (line: string) => void,
): Promise<void> {
  // If already aborted, return immediately
  if (signal.aborted) {
    return;
  }

  // Get initial file size to start reading from the end
  let position: number;
  try {
    const stats = await stat(logPath);
    position = stats.size;
  } catch {
    // If file doesn't exist yet, start from 0
    position = 0;
  }

  /**
   * Read new lines from the file starting at the current position.
   */
  const readNewLines = async (): Promise<void> => {
    if (signal.aborted) {
      return;
    }

    try {
      const currentStats = await stat(logPath);
      const currentSize = currentStats.size;

      // File was truncated or no new content
      if (currentSize <= position) {
        // If file was truncated, reset position
        if (currentSize < position) {
          position = 0;
        }
        return;
      }

      // Read new content
      const stream = createReadStream(logPath, {
        start: position,
        encoding: "utf-8",
      });

      const rl = createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (signal.aborted) {
          stream.destroy();
          break;
        }
        // Only emit non-empty lines
        if (line.trim()) {
          onLine(line);
        }
      }

      // Update position to end of file
      position = currentSize;
    } catch {
      // Ignore errors reading the file (it may have been deleted/rotated)
    }
  };

  return new Promise<void>((resolve) => {
    // Set up file watcher
    const watcher = watch(logPath, async (eventType) => {
      if (signal.aborted) {
        return;
      }
      if (eventType === "change") {
        await readNewLines();
      }
    });

    // Handle watcher errors (e.g., file doesn't exist)
    watcher.on("error", () => {
      // Ignore errors - the file may be rotated or deleted
    });

    // Clean up on abort
    const abortHandler = () => {
      watcher.close();
      resolve();
    };

    if (signal.aborted) {
      abortHandler();
    } else {
      signal.addEventListener("abort", abortHandler);
    }
  });
}
