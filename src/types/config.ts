import { z } from "zod";

export const PortRangeSchema = z.object({
  min: z.number().int().min(1).max(65535),
  max: z.number().int().min(1).max(65535),
}).refine((data) => data.min <= data.max, {
  message: "Port range min must be less than or equal to max",
});

export const PM2ConfigSchema = z.object({
  logDir: z.string(),
  pidDir: z.string(),
});

/**
 * Controls how servers are refreshed when config values change.
 * - "manual": Requires explicit `servherd refresh` command
 * - "prompt": Prompts user to restart affected servers when config changes via CLI
 * - "auto": Automatically restarts affected servers when config changes via CLI
 * - "on-start": Uses new config values on next start/restart (default, safest)
 */
export const RefreshOnChangeSchema = z.enum(["manual", "prompt", "auto", "on-start"]);
export type RefreshOnChange = z.infer<typeof RefreshOnChangeSchema>;

export const GlobalConfigSchema = z.object({
  version: z.string(),
  hostname: z.string(),
  protocol: z.enum(["http", "https"]),
  portRange: PortRangeSchema,
  tempDir: z.string(),
  pm2: PM2ConfigSchema,
  httpsCert: z.string().optional(),
  httpsKey: z.string().optional(),
  refreshOnChange: RefreshOnChangeSchema.optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

export type PortRange = z.infer<typeof PortRangeSchema>;
export type PM2Config = z.infer<typeof PM2ConfigSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

export const DEFAULT_CONFIG: GlobalConfig = {
  version: "1",
  hostname: "0.0.0.0",
  protocol: "http",
  portRange: { min: 3000, max: 9999 },
  tempDir: "/tmp/servherd",
  pm2: {
    logDir: "/tmp/servherd/logs",
    pidDir: "/tmp/servherd/pids",
  },
  httpsCert: undefined,
  httpsKey: undefined,
  refreshOnChange: "on-start",
  variables: {},
};
