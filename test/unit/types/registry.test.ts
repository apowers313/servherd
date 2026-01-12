import { describe, it, expect } from "vitest";
import {
  ServerEntrySchema,
  RegistrySchema,
  ServerStatusSchema,
  type ServerEntry,
} from "../../../src/types/registry.js";

describe("ServerEntrySchema", () => {
  const validEntry: ServerEntry = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "brave-tiger",
    command: "npm start --port {{port}}",
    resolvedCommand: "npm start --port 3000",
    cwd: "/home/user/project",
    port: 3000,
    protocol: "http",
    hostname: "localhost",
    env: {},
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-brave-tiger",
  };

  it("should validate a complete server entry", () => {
    expect(() => ServerEntrySchema.parse(validEntry)).not.toThrow();
  });

  it("should reject ports outside valid range (too high)", () => {
    const entry = { ...validEntry, port: 70000 };
    expect(() => ServerEntrySchema.parse(entry)).toThrow();
  });

  it("should reject ports outside valid range (negative)", () => {
    const entry = { ...validEntry, port: -1 };
    expect(() => ServerEntrySchema.parse(entry)).toThrow();
  });

  it("should reject invalid protocol", () => {
    const entry = { ...validEntry, protocol: "ftp" };
    expect(() => ServerEntrySchema.parse(entry)).toThrow();
  });

  it("should accept entry with optional tags", () => {
    const entry = { ...validEntry, tags: ["frontend", "storybook"] };
    expect(() => ServerEntrySchema.parse(entry)).not.toThrow();
  });

  it("should accept entry with optional description", () => {
    const entry = { ...validEntry, description: "My test server" };
    const result = ServerEntrySchema.parse(entry);
    expect(result.description).toBe("My test server");
  });

  it("should accept https protocol", () => {
    const entry = { ...validEntry, protocol: "https" };
    expect(() => ServerEntrySchema.parse(entry)).not.toThrow();
  });

  it("should validate env as record of strings", () => {
    const entry = { ...validEntry, env: { NODE_ENV: "development", PORT: "3000" } };
    expect(() => ServerEntrySchema.parse(entry)).not.toThrow();
  });
});

describe("ServerStatusSchema", () => {
  it("should accept valid status values", () => {
    expect(() => ServerStatusSchema.parse("online")).not.toThrow();
    expect(() => ServerStatusSchema.parse("stopped")).not.toThrow();
    expect(() => ServerStatusSchema.parse("errored")).not.toThrow();
    expect(() => ServerStatusSchema.parse("unknown")).not.toThrow();
  });

  it("should reject invalid status values", () => {
    expect(() => ServerStatusSchema.parse("running")).toThrow();
    expect(() => ServerStatusSchema.parse("paused")).toThrow();
  });
});

describe("RegistrySchema", () => {
  const validEntry: ServerEntry = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "brave-tiger",
    command: "npm start",
    resolvedCommand: "npm start",
    cwd: "/project",
    port: 3000,
    protocol: "http",
    hostname: "localhost",
    env: {},
    createdAt: new Date().toISOString(),
    pm2Name: "servherd-brave-tiger",
  };

  it("should validate a complete registry", () => {
    const registry = {
      version: "1",
      servers: [validEntry],
    };
    expect(() => RegistrySchema.parse(registry)).not.toThrow();
  });

  it("should validate an empty registry", () => {
    const registry = {
      version: "1",
      servers: [],
    };
    expect(() => RegistrySchema.parse(registry)).not.toThrow();
  });

  it("should validate registry with multiple servers", () => {
    const registry = {
      version: "1",
      servers: [
        validEntry,
        { ...validEntry, id: "another-id", name: "calm-panda", port: 3001 },
      ],
    };
    expect(() => RegistrySchema.parse(registry)).not.toThrow();
  });
});
