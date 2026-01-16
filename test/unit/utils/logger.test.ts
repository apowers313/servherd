import { describe, it, expect } from "vitest";
import { createLogger, type LoggerOptions } from "../../../src/utils/logger.js";

describe("createLogger", () => {
  it("should create a pino logger instance", () => {
    const logger = createLogger({ level: "info" });
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.debug).toBeDefined();
  });

  it("should respect log level configuration", () => {
    const logger = createLogger({ level: "error" });
    expect(logger.level).toBe("error");
  });

  it("should default to info level when not specified", () => {
    const logger = createLogger({});
    expect(logger.level).toBe("info");
  });

  it("should accept debug level", () => {
    const logger = createLogger({ level: "debug" });
    expect(logger.level).toBe("debug");
  });

  it("should accept warn level", () => {
    const logger = createLogger({ level: "warn" });
    expect(logger.level).toBe("warn");
  });

  it("should accept silent level", () => {
    const logger = createLogger({ level: "silent" });
    expect(logger.level).toBe("silent");
  });

  it("should have child method for creating child loggers", () => {
    const logger = createLogger({ level: "info" });
    expect(logger.child).toBeDefined();
    const childLogger = logger.child({ module: "test" });
    expect(childLogger.info).toBeDefined();
  });

  it("should create non-pretty logger when pretty is explicitly false", () => {
    const logger = createLogger({ level: "info", pretty: false });
    expect(logger.level).toBe("info");
    expect(logger.info).toBeDefined();
  });
});

describe("LoggerOptions", () => {
  it("should accept valid logger options", () => {
    const options: LoggerOptions = {
      level: "debug",
      pretty: true,
    };
    expect(options.level).toBe("debug");
    expect(options.pretty).toBe(true);
  });
});
