import { z } from "zod";

export const ServerStatusSchema = z.enum(["online", "stopped", "errored", "unknown"]);

/**
 * Snapshot of config values used when server was started.
 * Used to detect config drift.
 */
export const ConfigSnapshotSchema = z.object({
  hostname: z.string().optional(),
  httpsCert: z.string().optional(),
  httpsKey: z.string().optional(),
});

export type ConfigSnapshot = z.infer<typeof ConfigSnapshotSchema>;

export const ServerEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  command: z.string(),
  resolvedCommand: z.string(),
  cwd: z.string(),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["http", "https"]),
  hostname: z.string(),
  env: z.record(z.string()),
  createdAt: z.string(),
  pm2Name: z.string(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  // Config tracking for drift detection
  usedConfigKeys: z.array(z.string()).optional(),
  configSnapshot: ConfigSnapshotSchema.optional(),
});

export const RegistrySchema = z.object({
  version: z.string(),
  servers: z.array(ServerEntrySchema),
});

export type ServerStatus = z.infer<typeof ServerStatusSchema>;
export type ServerEntry = z.infer<typeof ServerEntrySchema>;
export type Registry = z.infer<typeof RegistrySchema>;

export interface ServerFilter {
  name?: string;
  tag?: string;
  cwd?: string;
  cmd?: string;
  running?: boolean;
}

export interface AddServerOptions {
  command: string;
  cwd: string;
  port: number;
  name?: string;
  protocol?: "http" | "https";
  hostname?: string;
  env?: Record<string, string>;
  tags?: string[];
  description?: string;
  usedConfigKeys?: string[];
  configSnapshot?: ConfigSnapshot;
}
