/**
 * Shared formatting utilities for human-readable output
 */

/**
 * Format milliseconds as human-readable uptime
 * @param uptimeMs - Duration in milliseconds
 * @returns Human-readable string like "1d 2h", "3h 45m", "2m 30s", or "45s"
 */
export function formatUptime(uptimeMs: number): string {
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format bytes as human-readable size
 * @param bytes - Size in bytes
 * @returns Human-readable string like "1.50 KB", "2.00 MB", etc.
 */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return unitIndex === 0
    ? `${size} ${units[unitIndex]}`
    : `${size.toFixed(2)} ${units[unitIndex]}`;
}
