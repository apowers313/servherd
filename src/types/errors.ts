/**
 * Error codes for servherd operations.
 * Grouped by category:
 * - 1xxx: Server-related errors
 * - 2xxx: Port-related errors
 * - 3xxx: PM2/Process-related errors
 * - 4xxx: Configuration errors
 * - 5xxx: Registry errors
 * - 6xxx: Template errors
 * - 7xxx: Command/CLI errors
 * - 9xxx: Unknown/Other errors
 */
export enum ServherdErrorCode {
  // Server errors (1xxx)
  SERVER_NOT_FOUND = 1001,
  SERVER_ALREADY_EXISTS = 1002,
  SERVER_NOT_RUNNING = 1003,
  SERVER_ALREADY_RUNNING = 1004,

  // Port errors (2xxx)
  PORT_UNAVAILABLE = 2001,
  PORT_OUT_OF_RANGE = 2002,
  PORT_ALLOCATION_FAILED = 2003,

  // PM2/Process errors (3xxx)
  PM2_CONNECTION_FAILED = 3001,
  PM2_START_FAILED = 3002,
  PM2_STOP_FAILED = 3003,
  PM2_DELETE_FAILED = 3004,
  PM2_RESTART_FAILED = 3005,
  PM2_DESCRIBE_FAILED = 3006,

  // Configuration errors (4xxx)
  CONFIG_LOAD_FAILED = 4001,
  CONFIG_SAVE_FAILED = 4002,
  CONFIG_INVALID = 4003,
  CONFIG_KEY_NOT_FOUND = 4004,
  CONFIG_VALIDATION_FAILED = 4005,

  // Registry errors (5xxx)
  REGISTRY_LOAD_FAILED = 5001,
  REGISTRY_SAVE_FAILED = 5002,
  REGISTRY_CORRUPT = 5003,

  // Template errors (6xxx)
  TEMPLATE_INVALID = 6001,
  TEMPLATE_MISSING_VARIABLE = 6002,

  // Command/CLI errors (7xxx)
  COMMAND_INVALID = 7001,
  COMMAND_MISSING_ARGUMENT = 7002,
  COMMAND_CONFLICT = 7003,
  INTERACTIVE_NOT_AVAILABLE = 7004,

  // Unknown/Other errors (9xxx)
  UNKNOWN_ERROR = 9999,
}

/**
 * Map of error codes to their string names for display purposes.
 */
const ERROR_CODE_NAMES: Record<ServherdErrorCode, string> = {
  [ServherdErrorCode.SERVER_NOT_FOUND]: "SERVER_NOT_FOUND",
  [ServherdErrorCode.SERVER_ALREADY_EXISTS]: "SERVER_ALREADY_EXISTS",
  [ServherdErrorCode.SERVER_NOT_RUNNING]: "SERVER_NOT_RUNNING",
  [ServherdErrorCode.SERVER_ALREADY_RUNNING]: "SERVER_ALREADY_RUNNING",
  [ServherdErrorCode.PORT_UNAVAILABLE]: "PORT_UNAVAILABLE",
  [ServherdErrorCode.PORT_OUT_OF_RANGE]: "PORT_OUT_OF_RANGE",
  [ServherdErrorCode.PORT_ALLOCATION_FAILED]: "PORT_ALLOCATION_FAILED",
  [ServherdErrorCode.PM2_CONNECTION_FAILED]: "PM2_CONNECTION_FAILED",
  [ServherdErrorCode.PM2_START_FAILED]: "PM2_START_FAILED",
  [ServherdErrorCode.PM2_STOP_FAILED]: "PM2_STOP_FAILED",
  [ServherdErrorCode.PM2_DELETE_FAILED]: "PM2_DELETE_FAILED",
  [ServherdErrorCode.PM2_RESTART_FAILED]: "PM2_RESTART_FAILED",
  [ServherdErrorCode.PM2_DESCRIBE_FAILED]: "PM2_DESCRIBE_FAILED",
  [ServherdErrorCode.CONFIG_LOAD_FAILED]: "CONFIG_LOAD_FAILED",
  [ServherdErrorCode.CONFIG_SAVE_FAILED]: "CONFIG_SAVE_FAILED",
  [ServherdErrorCode.CONFIG_INVALID]: "CONFIG_INVALID",
  [ServherdErrorCode.CONFIG_KEY_NOT_FOUND]: "CONFIG_KEY_NOT_FOUND",
  [ServherdErrorCode.CONFIG_VALIDATION_FAILED]: "CONFIG_VALIDATION_FAILED",
  [ServherdErrorCode.REGISTRY_LOAD_FAILED]: "REGISTRY_LOAD_FAILED",
  [ServherdErrorCode.REGISTRY_SAVE_FAILED]: "REGISTRY_SAVE_FAILED",
  [ServherdErrorCode.REGISTRY_CORRUPT]: "REGISTRY_CORRUPT",
  [ServherdErrorCode.TEMPLATE_INVALID]: "TEMPLATE_INVALID",
  [ServherdErrorCode.TEMPLATE_MISSING_VARIABLE]: "TEMPLATE_MISSING_VARIABLE",
  [ServherdErrorCode.COMMAND_INVALID]: "COMMAND_INVALID",
  [ServherdErrorCode.COMMAND_MISSING_ARGUMENT]: "COMMAND_MISSING_ARGUMENT",
  [ServherdErrorCode.COMMAND_CONFLICT]: "COMMAND_CONFLICT",
  [ServherdErrorCode.INTERACTIVE_NOT_AVAILABLE]: "INTERACTIVE_NOT_AVAILABLE",
  [ServherdErrorCode.UNKNOWN_ERROR]: "UNKNOWN_ERROR",
};

/**
 * Details that can be attached to a ServherdError for additional context.
 */
export interface ServherdErrorDetails {
  exitCode?: number;
  stderr?: string;
  stdout?: string;
  cause?: Error;
  serverName?: string;
  port?: number;
  command?: string;
  path?: string;
  [key: string]: unknown;
}

/**
 * Custom error class for servherd operations.
 * Includes error codes for programmatic handling and optional details.
 */
export class ServherdError extends Error {
  public readonly code: ServherdErrorCode;
  public readonly details?: ServherdErrorDetails;

  constructor(
    code: ServherdErrorCode,
    message: string,
    details?: ServherdErrorDetails,
  ) {
    super(message);
    this.name = "ServherdError";
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServherdError);
    }
  }

  /**
   * Serialize error to JSON for logging or API responses.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }

  /**
   * Get the string name of the error code.
   */
  getCodeName(): string {
    return ERROR_CODE_NAMES[this.code] || "UNKNOWN_ERROR";
  }
}

/**
 * Type guard to check if an error is a ServherdError.
 */
export function isServherdError(error: unknown): error is ServherdError {
  return error instanceof ServherdError;
}

/**
 * Format an error for CLI display.
 * Includes color codes and proper formatting for terminal output.
 */
export function formatErrorForCLI(error: unknown): string {
  if (isServherdError(error)) {
    let message = `\x1b[31mError [${error.code}]: ${error.message}\x1b[0m`;
    if (error.details) {
      if (error.details.stderr) {
        message += `\n\x1b[90m${error.details.stderr}\x1b[0m`;
      }
      if (error.details.stdout) {
        message += `\n\x1b[90m${error.details.stdout}\x1b[0m`;
      }
    }
    return message;
  }

  if (error instanceof Error) {
    return `\x1b[31mError: ${error.message}\x1b[0m`;
  }

  return "\x1b[31mUnknown error occurred\x1b[0m";
}

/**
 * MCP tool response content item.
 */
interface MCPContentItem {
  type: "text";
  text: string;
}

/**
 * MCP tool error response format.
 */
interface MCPErrorResponse {
  isError: true;
  content: MCPContentItem[];
}

/**
 * Format an error for MCP tool response.
 * Returns a structured error response compatible with MCP protocol.
 */
export function formatErrorForMCP(error: unknown): MCPErrorResponse {
  if (isServherdError(error)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error.getCodeName(),
            code: error.code,
            message: error.message,
            details: error.details,
          }, null, 2),
        },
      ],
    };
  }

  if (error instanceof Error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "UNKNOWN_ERROR",
            code: ServherdErrorCode.UNKNOWN_ERROR,
            message: error.message,
          }, null, 2),
        },
      ],
    };
  }

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: "UNKNOWN_ERROR",
          code: ServherdErrorCode.UNKNOWN_ERROR,
          message: "An unknown error occurred",
        }, null, 2),
      },
    ],
  };
}
