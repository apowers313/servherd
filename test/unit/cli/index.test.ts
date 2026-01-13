import { describe, it, expect } from "vitest";
import { createProgram } from "../../../src/cli/index.js";
import { getVersion } from "../../../src/utils/version.js";

describe("CLI", () => {
  describe("createProgram", () => {
    it("should create a commander program", () => {
      const program = createProgram();
      expect(program).toBeDefined();
      expect(program.name()).toBe("servherd");
    });

    it("should have version defined", () => {
      const program = createProgram();
      expect(program.version()).toBe(getVersion());
    });

    it("should have start command", () => {
      const program = createProgram();
      const startCmd = program.commands.find((cmd) => cmd.name() === "start");
      expect(startCmd).toBeDefined();
    });

    it("should have stop command", () => {
      const program = createProgram();
      const stopCmd = program.commands.find((cmd) => cmd.name() === "stop");
      expect(stopCmd).toBeDefined();
    });

    it("should have list command", () => {
      const program = createProgram();
      const listCmd = program.commands.find((cmd) => cmd.name() === "list");
      expect(listCmd).toBeDefined();
    });

    it("should have ls alias for list command", () => {
      const program = createProgram();
      const listCmd = program.commands.find((cmd) => cmd.name() === "list");
      expect(listCmd?.aliases()).toContain("ls");
    });
  });

  describe("argument parsing", () => {
    it("should pass through double -- to command arguments", async () => {
      const program = createProgram();
      const startCmd = program.commands.find((cmd) => cmd.name() === "start");

      let capturedArgs: string[] = [];

      // Replace the action handler to capture arguments
      // Commander passes variadic args as the first element in an array
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (startCmd as any)._actionHandler = (commandArgs: string[][]) => {
        capturedArgs = commandArgs[0];
      };

      // Simulate: servherd start -- mycmd arg -- arg-to-mycmd
      await program.parseAsync(["node", "servherd", "start", "--", "mycmd", "arg", "--", "arg-to-mycmd"]);

      // The second -- should be preserved as part of the command arguments
      expect(capturedArgs).toEqual(["mycmd", "arg", "--", "arg-to-mycmd"]);
    });

    it("should handle commands with multiple -- separators", async () => {
      const program = createProgram();
      const startCmd = program.commands.find((cmd) => cmd.name() === "start");

      let capturedArgs: string[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (startCmd as any)._actionHandler = (commandArgs: string[][]) => {
        capturedArgs = commandArgs[0];
      };

      // Simulate: servherd start -- npm run test -- --coverage -- --verbose
      await program.parseAsync(["node", "servherd", "start", "--", "npm", "run", "test", "--", "--coverage", "--", "--verbose"]);

      expect(capturedArgs).toEqual(["npm", "run", "test", "--", "--coverage", "--", "--verbose"]);
    });
  });
});
