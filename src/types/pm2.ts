/**
 * PM2-related type definitions
 */

export interface PM2StartOptions {
  name: string;
  script: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  instances?: number;
  autorestart?: boolean;
  watch?: boolean;
  max_memory_restart?: string | number;
  output?: string;
  error?: string;
  /** Format for log timestamps (moment.js format, e.g., "YYYY-MM-DD HH:mm:ss Z") */
  log_date_format?: string;
}

export interface PM2ProcessEnv {
  status: "online" | "stopped" | "errored" | "stopping" | "launching" | "one-launch-status";
  pm_id: number;
  name: string;
  pm_uptime: number;
  created_at: number;
  restart_time: number;
  unstable_restarts: number;
  pm_cwd: string;
  pm_exec_path: string;
  exec_mode: "fork" | "cluster";
  node_args: string[];
  pm_out_log_path: string;
  pm_err_log_path: string;
  pm_pid_path: string;
  env: Record<string, string>;
}

export interface PM2Monit {
  memory: number;
  cpu: number;
}

export interface PM2ProcessDescription {
  pid: number;
  name: string;
  pm2_env: PM2ProcessEnv;
  monit?: PM2Monit;
}

export interface PM2Process {
  name: string;
  pm_id: number;
}

export type PM2Callback<T> = (err: Error | null, result?: T) => void;
