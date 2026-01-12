import { vi } from "vitest";
import type { PM2ProcessDescription, PM2StartOptions, PM2Process } from "../../src/types/pm2.js";

export interface MockPM2 {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  restart: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  describe: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  _reset: () => void;
  _setProcesses: (processes: PM2ProcessDescription[]) => void;
  _getProcesses: () => PM2ProcessDescription[];
}

/**
 * Create a mock PM2ProcessDescription
 */
export function createMockProcess(overrides: Partial<PM2ProcessDescription> = {}): PM2ProcessDescription {
  const name = overrides.name ?? "servherd-test";
  return {
    pid: overrides.pid ?? 12345,
    name,
    pm2_env: {
      status: "online",
      pm_id: 0,
      name,
      pm_uptime: Date.now() - 60000,
      created_at: Date.now() - 120000,
      restart_time: 0,
      unstable_restarts: 0,
      pm_cwd: "/project",
      pm_exec_path: "npm",
      exec_mode: "fork",
      node_args: [],
      pm_out_log_path: "/tmp/servherd/logs/out.log",
      pm_err_log_path: "/tmp/servherd/logs/err.log",
      pm_pid_path: "/tmp/servherd/pids/pid",
      env: {},
      ...(overrides.pm2_env as Partial<PM2ProcessDescription["pm2_env"]>),
    },
    monit: overrides.monit ?? {
      memory: 50000000,
      cpu: 1.5,
    },
  };
}

// Module-level state for the mock
let mockProcesses: PM2ProcessDescription[] = [];
let isConnected = false;

/**
 * Create a mock PM2 module - use this in vi.mock factory
 */
export function createMockPM2Factory(): MockPM2 {
  const mock: MockPM2 = {
    connect: vi.fn((callback: (err?: Error) => void) => {
      isConnected = true;
      callback();
    }),

    disconnect: vi.fn(() => {
      isConnected = false;
    }),

    start: vi.fn((options: PM2StartOptions, callback: (err?: Error, proc?: PM2Process[]) => void) => {
      if (!isConnected) {
        callback(new Error("Not connected to PM2"));
        return;
      }

      const proc = createMockProcess({
        name: options.name,
        pm2_env: {
          status: "online",
          pm_id: mockProcesses.length,
          name: options.name,
          pm_uptime: Date.now(),
          created_at: Date.now(),
          restart_time: 0,
          unstable_restarts: 0,
          pm_cwd: options.cwd || process.cwd(),
          pm_exec_path: options.script,
          exec_mode: "fork",
          node_args: [],
          pm_out_log_path: "/tmp/servherd/logs/out.log",
          pm_err_log_path: "/tmp/servherd/logs/err.log",
          pm_pid_path: "/tmp/servherd/pids/pid",
          env: options.env || {},
        } as PM2ProcessDescription["pm2_env"],
      });

      mockProcesses.push(proc);

      callback(undefined, [{ name: options.name, pm_id: proc.pm2_env.pm_id }]);
    }),

    stop: vi.fn((name: string, callback: (err?: Error, proc?: PM2Process[]) => void) => {
      if (!isConnected) {
        callback(new Error("Not connected to PM2"));
        return;
      }

      const idx = mockProcesses.findIndex((p) => p.name === name);
      if (idx === -1) {
        callback(new Error(`Process ${name} not found`));
        return;
      }

      mockProcesses[idx].pm2_env.status = "stopped";
      callback(undefined, [{ name, pm_id: mockProcesses[idx].pm2_env.pm_id }]);
    }),

    restart: vi.fn((name: string, callback: (err?: Error, proc?: PM2Process[]) => void) => {
      if (!isConnected) {
        callback(new Error("Not connected to PM2"));
        return;
      }

      const idx = mockProcesses.findIndex((p) => p.name === name);
      if (idx === -1) {
        callback(new Error(`Process ${name} not found`));
        return;
      }

      mockProcesses[idx].pm2_env.status = "online";
      mockProcesses[idx].pm2_env.restart_time++;
      callback(undefined, [{ name, pm_id: mockProcesses[idx].pm2_env.pm_id }]);
    }),

    delete: vi.fn((name: string, callback: (err?: Error, proc?: PM2Process[]) => void) => {
      if (!isConnected) {
        callback(new Error("Not connected to PM2"));
        return;
      }

      const idx = mockProcesses.findIndex((p) => p.name === name);
      if (idx === -1) {
        callback(new Error(`Process ${name} not found`));
        return;
      }

      const pm_id = mockProcesses[idx].pm2_env.pm_id;
      mockProcesses.splice(idx, 1);
      callback(undefined, [{ name, pm_id }]);
    }),

    describe: vi.fn((name: string, callback: (err?: Error, procDesc?: PM2ProcessDescription[]) => void) => {
      if (!isConnected) {
        callback(new Error("Not connected to PM2"));
        return;
      }

      const proc = mockProcesses.find((p) => p.name === name);
      if (!proc) {
        callback(undefined, []);
        return;
      }

      callback(undefined, [proc]);
    }),

    list: vi.fn((callback: (err?: Error, procList?: PM2ProcessDescription[]) => void) => {
      if (!isConnected) {
        callback(new Error("Not connected to PM2"));
        return;
      }

      callback(undefined, [...mockProcesses]);
    }),

    flush: vi.fn((nameOrAll: string, callback: (err?: Error) => void) => {
      if (!isConnected) {
        callback(new Error("Not connected to PM2"));
        return;
      }

      // PM2 flush clears logs - we just acknowledge it worked
      // In the real PM2, it truncates the log files
      callback();
    }),

    _reset: () => {
      mockProcesses = [];
      isConnected = false;
      mock.connect.mockClear();
      mock.disconnect.mockClear();
      mock.start.mockClear();
      mock.stop.mockClear();
      mock.restart.mockClear();
      mock.delete.mockClear();
      mock.describe.mockClear();
      mock.list.mockClear();
      mock.flush.mockClear();
    },

    _setProcesses: (processes: PM2ProcessDescription[]) => {
      mockProcesses = [...processes];
    },

    _getProcesses: () => [...mockProcesses],
  };

  return mock;
}

// Pre-create a singleton mock instance for use in tests
const globalMock = createMockPM2Factory();

// Export the pm2 mock module structure
export const mockPM2Module = {
  default: globalMock,
};

// Export helper for accessing the mock in tests
export function getMockPM2(): MockPM2 {
  return globalMock;
}

// Legacy export for backward compatibility
export const createMockPM2 = getMockPM2;
