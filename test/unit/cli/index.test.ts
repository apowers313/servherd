import { describe, it, expect } from "vitest";
import { createProgram } from "../../../src/cli/index.js";

describe("CLI", () => {
  describe("createProgram", () => {
    it("should create a commander program", () => {
      const program = createProgram();
      expect(program).toBeDefined();
      expect(program.name()).toBe("servherd");
    });

    it("should have version defined", () => {
      const program = createProgram();
      expect(program.version()).toBe("0.1.0");
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
});
