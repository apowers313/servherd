import { ServherdError, ServherdErrorCode, isServherdError } from "../types/errors.js";

/**
 * Create a ServherdError from an unknown error.
 * Useful for wrapping errors from external libraries.
 */
export function wrapError(
  error: unknown,
  code: ServherdErrorCode,
  message?: string,
): ServherdError {
  if (isServherdError(error)) {
    return error;
  }

  const originalMessage = error instanceof Error ? error.message : String(error);
  const finalMessage = message || originalMessage;

  return new ServherdError(code, finalMessage, {
    cause: error instanceof Error ? error : undefined,
    stderr: error instanceof Error ? error.message : undefined,
  });
}

/**
 * Assert that a condition is true, throwing a ServherdError if not.
 */
export function assertServherd(
  condition: unknown,
  code: ServherdErrorCode,
  message: string,
): asserts condition {
  if (!condition) {
    throw new ServherdError(code, message);
  }
}

/**
 * Try to execute a function, returning a result object.
 * Useful for operations where you want to handle errors gracefully.
 */
export async function tryAsync<T>(
  fn: () => Promise<T>,
): Promise<{ success: true; value: T } | { success: false; error: ServherdError }> {
  try {
    const value = await fn();
    return { success: true, value };
  } catch (error) {
    const wrappedError = wrapError(
      error,
      ServherdErrorCode.UNKNOWN_ERROR,
    );
    return { success: false, error: wrappedError };
  }
}
