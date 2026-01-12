import { ServherdError, ServherdErrorCode } from "../types/errors.js";

/**
 * Duration unit multipliers in milliseconds.
 */
const DURATION_MULTIPLIERS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Parse a time filter string into a Date object.
 * Supports duration format (1h, 30m, 2d, 1w, 30s) or ISO date strings.
 *
 * @param input - Time filter string to parse
 * @returns Date object representing the cutoff time
 * @throws ServherdError if the format is invalid
 */
export function parseTimeFilter(input: string): Date {
  if (!input) {
    throw new ServherdError(
      ServherdErrorCode.COMMAND_INVALID,
      "Invalid time format: empty string. Use duration (1h, 30m) or ISO date (2024-01-15)",
    );
  }

  // Try duration format (e.g., 1h, 30m, 2d, 1w, 30s)
  const durationMatch = input.match(/^(\d+)([smhdw])$/);
  if (durationMatch) {
    const value = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2];
    const now = new Date();

    return new Date(now.getTime() - value * DURATION_MULTIPLIERS[unit]);
  }

  // Try ISO date/datetime
  const date = new Date(input);
  if (!isNaN(date.getTime())) {
    return date;
  }

  throw new ServherdError(
    ServherdErrorCode.COMMAND_INVALID,
    `Invalid time format: ${input}. Use duration (1h, 30m) or ISO date (2024-01-15)`,
  );
}

/**
 * Filter log lines by timestamp, keeping only those after the given date.
 * Lines without timestamps (or where the parser returns null) are included.
 *
 * @param lines - Array of log lines to filter
 * @param since - Only include logs from this date onward
 * @param parseTimestamp - Function to extract a Date from a log line (returns null if no timestamp)
 * @returns Filtered array of log lines
 */
export function filterLogsByTime(
  lines: string[],
  since: Date,
  parseTimestamp: (line: string) => Date | null,
): string[] {
  return lines.filter((line) => {
    const timestamp = parseTimestamp(line);
    // Include lines without timestamps, or lines >= since
    return timestamp === null || timestamp >= since;
  });
}
