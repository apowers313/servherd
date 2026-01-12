/**
 * JSON output formatting utilities for CLI commands.
 */

import { isServherdError } from "../../types/errors.js";

/**
 * Standard JSON output wrapper for successful operations.
 */
export interface JsonOutput<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Format data as a successful JSON response.
 */
export function formatAsJson<T>(data: T): string {
  const output: JsonOutput<T> = {
    success: true,
    data,
  };
  return JSON.stringify(output, null, 2);
}

/**
 * Format an error as a JSON response.
 */
export function formatErrorAsJson(error: unknown): string {
  if (isServherdError(error)) {
    const output: JsonOutput<null> = {
      success: false,
      data: null,
      error: {
        code: error.getCodeName(),
        message: error.message,
      },
    };
    return JSON.stringify(output, null, 2);
  }

  const message = error instanceof Error ? error.message : String(error);
  const output: JsonOutput<null> = {
    success: false,
    data: null,
    error: {
      code: "UNKNOWN_ERROR",
      message,
    },
  };
  return JSON.stringify(output, null, 2);
}
