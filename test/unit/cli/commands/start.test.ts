import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMockPM2 } from "../../../mocks/pm2.js";
import type { ServerEntry } from "../../../../src/types/registry.js";

// Mock PM2 before other imports
vi.mock("pm2", async () => {
  const { mockPM2Module } = await import("../../../mocks/pm2.js");
  return mockPM2Module;
});

// Mock ConfigService
const mockConfigService = {
  load: vi.fn(),
  get: vi.fn(),
};

// Mock RegistryService
const mockRegistryService = {
  load: vi.fn(),
  addServer: vi.fn(),
  findByCommandHash: vi.fn(),
  findByCwdAndName: vi.fn(),
  findByName: vi.fn(),
  updateServer: vi.fn(),
  listServers: vi.fn(),
  save: vi.fn(),
};

vi.mock("../../../../src/services/config.service.js", () => ({
  ConfigService: vi.fn().mockImplementation(() => mockConfigService),
}));

vi.mock("../../../../src/services/registry.service.js", () => ({
  RegistryService: vi.fn().mockImplementation(() => mockRegistryService),
}));

// Import after mocking
const { executeStart } = await import("../../../../src/cli/commands/start.js");

describe("start command", () => {
  const mockPM2 = getMockPM2();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPM2._reset();

    // Setup default config mock
    mockConfigService.load.mockResolvedValue({
      version: "1",
      hostname: "localhost",
      protocol: "http",
      portRange: { min: 3000, max: 9999 },
      tempDir: "/tmp/servherd",
      pm2: { logDir: "/tmp/servherd/logs", pidDir: "/tmp/servherd/pids" },
    });
    mockConfigService.get.mockReturnValue("localhost");

    // Setup default registry mock
    mockRegistryService.load.mockResolvedValue({ version: "1", servers: [] });
    mockRegistryService.findByCwdAndName.mockReturnValue(undefined);
    mockRegistryService.findByCommandHash.mockReturnValue(undefined);
    mockRegistryService.findByName.mockReturnValue(undefined);
    mockRegistryService.listServers.mockReturnValue([]);
  });

  it("should register new server and start it", async () => {
    const newServer: ServerEntry = {
      id: "test-id",
      name: "brave-tiger",
      command: "npm start --port {{port}}",
      resolvedCommand: "npm start --port 3456",
      cwd: "/project",
      port: 3456,
      protocol: "http",
      hostname: "localhost",
      env: {},
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-brave-tiger",
    };

    mockRegistryService.addServer.mockResolvedValue(newServer);

    const result = await executeStart({
      command: "npm start --port {{port}}",
      cwd: "/project",
    });

    expect(result.action).toBe("started");
    expect(mockRegistryService.addServer).toHaveBeenCalled();
    expect(mockPM2.start).toHaveBeenCalled();
  });

  it("should use existing server when already registered by command hash", async () => {
    const existingServer: ServerEntry = {
      id: "existing-id",
      name: "calm-panda",
      command: "npm start",
      resolvedCommand: "npm start",
      cwd: "/project",
      port: 3456,
      protocol: "http",
      hostname: "localhost",
      env: {},
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-calm-panda",
    };

    mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
    mockPM2._setProcesses([
      {
        pid: 12345,
        name: "servherd-calm-panda",
        pm2_env: {
          status: "online",
          pm_id: 0,
          name: "servherd-calm-panda",
          pm_uptime: Date.now(),
          created_at: Date.now(),
          restart_time: 0,
          unstable_restarts: 0,
          pm_cwd: "/project",
          pm_exec_path: "npm",
          exec_mode: "fork",
          node_args: [],
          pm_out_log_path: "",
          pm_err_log_path: "",
          pm_pid_path: "",
          env: {},
        },
      },
    ]);

    const result = await executeStart({
      command: "npm start",
      cwd: "/project",
    });

    expect(result.action).toBe("existing");
    expect(mockRegistryService.addServer).not.toHaveBeenCalled();
  });

  it("should restart stopped existing server", async () => {
    const existingServer: ServerEntry = {
      id: "existing-id",
      name: "calm-panda",
      command: "npm start",
      resolvedCommand: "npm start",
      cwd: "/project",
      port: 3456,
      protocol: "http",
      hostname: "localhost",
      env: {},
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-calm-panda",
    };

    mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
    mockPM2._setProcesses([
      {
        pid: 12345,
        name: "servherd-calm-panda",
        pm2_env: {
          status: "stopped",
          pm_id: 0,
          name: "servherd-calm-panda",
          pm_uptime: Date.now(),
          created_at: Date.now(),
          restart_time: 0,
          unstable_restarts: 0,
          pm_cwd: "/project",
          pm_exec_path: "npm",
          exec_mode: "fork",
          node_args: [],
          pm_out_log_path: "",
          pm_err_log_path: "",
          pm_pid_path: "",
          env: {},
        },
      },
    ]);

    const result = await executeStart({
      command: "npm start",
      cwd: "/project",
    });

    expect(result.action).toBe("restarted");
    expect(mockPM2.restart).toHaveBeenCalledWith("servherd-calm-panda", expect.any(Function));
  });

  it("should use specified name if provided", async () => {
    const newServer: ServerEntry = {
      id: "test-id",
      name: "my-server",
      command: "npm start",
      resolvedCommand: "npm start",
      cwd: "/project",
      port: 3456,
      protocol: "http",
      hostname: "localhost",
      env: {},
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-my-server",
    };

    mockRegistryService.addServer.mockResolvedValue(newServer);

    const result = await executeStart({
      command: "npm start",
      cwd: "/project",
      name: "my-server",
    });

    expect(result.action).toBe("started");
    expect(mockRegistryService.addServer).toHaveBeenCalledWith(
      expect.objectContaining({ name: "my-server" }),
    );
  });

  it("should substitute template variables in command", async () => {
    const newServer: ServerEntry = {
      id: "test-id",
      name: "brave-tiger",
      command: "npm start --port {{port}} --host {{hostname}}",
      resolvedCommand: "npm start --port 3456 --host localhost",
      cwd: "/project",
      port: 3456,
      protocol: "http",
      hostname: "localhost",
      env: {},
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-brave-tiger",
    };

    mockRegistryService.addServer.mockResolvedValue(newServer);

    await executeStart({
      command: "npm start --port {{port}} --host {{hostname}}",
      cwd: "/project",
    });

    // Verify template was resolved in the start call
    expect(mockPM2.start).toHaveBeenCalled();
  });

  it("should pass environment variables to registry", async () => {
    const newServer: ServerEntry = {
      id: "test-id",
      name: "brave-tiger",
      command: "npm start",
      resolvedCommand: "npm start",
      cwd: "/project",
      port: 3456,
      protocol: "http",
      hostname: "localhost",
      env: { MY_VAR: "value", DEBUG: "true" },
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-brave-tiger",
    };

    mockRegistryService.addServer.mockResolvedValue(newServer);

    await executeStart({
      command: "npm start",
      cwd: "/project",
      env: { MY_VAR: "value", DEBUG: "true" },
    });

    expect(mockRegistryService.addServer).toHaveBeenCalledWith(
      expect.objectContaining({
        env: { MY_VAR: "value", DEBUG: "true" },
      }),
    );
  });

  it("should substitute template variables in environment values", async () => {
    const newServer: ServerEntry = {
      id: "test-id",
      name: "brave-tiger",
      command: "npm start",
      resolvedCommand: "npm start",
      cwd: "/project",
      port: 3456,
      protocol: "http",
      hostname: "localhost",
      env: { STORYBOOK_PORT: "3456", BASE_URL: "http://localhost:3456" },
      createdAt: new Date().toISOString(),
      pm2Name: "servherd-brave-tiger",
    };

    mockRegistryService.addServer.mockResolvedValue(newServer);

    await executeStart({
      command: "npm start",
      cwd: "/project",
      env: { STORYBOOK_PORT: "{{port}}", BASE_URL: "{{url}}" },
    });

    // The env values should have templates substituted
    expect(mockRegistryService.addServer).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          STORYBOOK_PORT: expect.stringMatching(/^\d+$/), // Should be a number
        }),
      }),
    );
  });

  describe("--name option with existing server", () => {
    it("should rename existing server when name differs", async () => {
      const existingServer: ServerEntry = {
        id: "existing-id",
        name: "old-name",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3456,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-old-name",
      };

      // With new identity model: explicit -n looks up by cwd+name, not command hash
      // Since no server exists with name "new-name", a new server is created
      // (The old server with name "old-name" becomes orphaned)
      mockRegistryService.findByCwdAndName.mockReturnValue(undefined);
      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);

      const newServer: ServerEntry = {
        id: "new-id",
        name: "new-name",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3456,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-new-name",
      };
      mockRegistryService.addServer.mockResolvedValue(newServer);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        name: "new-name",
      });

      // New behavior: creates a new server with the specified name
      expect(result.action).toBe("started");
      expect(result.server.name).toBe("new-name");
      expect(mockRegistryService.addServer).toHaveBeenCalled();
      expect(mockPM2.start).toHaveBeenCalled();
    });

    it("should reuse existing server when name matches", async () => {
      const existingServer: ServerEntry = {
        id: "existing-id",
        name: "same-name",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3456,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-same-name",
      };

      // With new identity model: explicit -n looks up by cwd+name
      mockRegistryService.findByCwdAndName.mockReturnValue(existingServer);
      mockPM2._setProcesses([
        {
          pid: 12345,
          name: "servherd-same-name",
          pm2_env: {
            status: "online",
            pm_id: 0,
            name: "servherd-same-name",
            pm_uptime: Date.now(),
            created_at: Date.now(),
            restart_time: 0,
            unstable_restarts: 0,
            pm_cwd: "/project",
            pm_exec_path: "npm",
            exec_mode: "fork",
            node_args: [],
            pm_out_log_path: "",
            pm_err_log_path: "",
            pm_pid_path: "",
            env: {},
          },
        },
      ]);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        name: "same-name",
      });

      expect(result.action).toBe("existing");
      expect(mockRegistryService.updateServer).not.toHaveBeenCalled();
    });
  });

  describe("--port option", () => {
    it("should use specified port instead of deterministic port", async () => {
      const newServer: ServerEntry = {
        id: "test-id",
        name: "brave-tiger",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 8080,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-brave-tiger",
      };

      mockRegistryService.addServer.mockResolvedValue(newServer);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        port: 8080,
      });

      expect(result.server.port).toBe(8080);
      expect(mockRegistryService.addServer).toHaveBeenCalledWith(
        expect.objectContaining({ port: 8080 }),
      );
    });

    it("should reject port below configured minimum", async () => {
      await expect(
        executeStart({
          command: "npm start",
          cwd: "/project",
          port: 1000,
        }),
      ).rejects.toThrow("Port 1000 is outside configured range 3000-9999");
    });

    it("should reject port above configured maximum", async () => {
      await expect(
        executeStart({
          command: "npm start",
          cwd: "/project",
          port: 99999,
        }),
      ).rejects.toThrow("Port 99999 is outside configured range 3000-9999");
    });
  });

  describe("environment variable changes", () => {
    it("should restart online server when env variables change", async () => {
      const existingServer: ServerEntry = {
        id: "existing-id",
        name: "env-server",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3456,
        protocol: "http",
        hostname: "localhost",
        env: { API_URL: "http://localhost:3000" },
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-env-server",
      };

      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      mockPM2._setProcesses([
        {
          pid: 12345,
          name: "servherd-env-server",
          pm2_env: {
            status: "online",
            pm_id: 0,
            name: "servherd-env-server",
            pm_uptime: Date.now(),
            created_at: Date.now(),
            restart_time: 0,
            unstable_restarts: 0,
            pm_cwd: "/project",
            pm_exec_path: "npm",
            exec_mode: "fork",
            node_args: [],
            pm_out_log_path: "",
            pm_err_log_path: "",
            pm_pid_path: "",
            env: {},
          },
        },
      ]);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { API_URL: "http://localhost:4000" }, // Different value
      });

      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
      expect(mockPM2.delete).toHaveBeenCalledWith("servherd-env-server", expect.any(Function));
      expect(mockPM2.start).toHaveBeenCalled();
      expect(mockRegistryService.updateServer).toHaveBeenCalledWith("existing-id",
        expect.objectContaining({
          env: { API_URL: "http://localhost:4000" },
        }),
      );
    });

    it("should restart when adding new env variables", async () => {
      const existingServer: ServerEntry = {
        id: "existing-id",
        name: "env-server",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3456,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-env-server",
      };

      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      mockPM2._setProcesses([
        {
          pid: 12345,
          name: "servherd-env-server",
          pm2_env: {
            status: "online",
            pm_id: 0,
            name: "servherd-env-server",
            pm_uptime: Date.now(),
            created_at: Date.now(),
            restart_time: 0,
            unstable_restarts: 0,
            pm_cwd: "/project",
            pm_exec_path: "npm",
            exec_mode: "fork",
            node_args: [],
            pm_out_log_path: "",
            pm_err_log_path: "",
            pm_pid_path: "",
            env: {},
          },
        },
      ]);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { NEW_VAR: "value" },
      });

      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
    });

    it("should restart when removing env variables", async () => {
      const existingServer: ServerEntry = {
        id: "existing-id",
        name: "env-server",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3456,
        protocol: "http",
        hostname: "localhost",
        env: { OLD_VAR: "value" },
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-env-server",
      };

      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      mockPM2._setProcesses([
        {
          pid: 12345,
          name: "servherd-env-server",
          pm2_env: {
            status: "online",
            pm_id: 0,
            name: "servherd-env-server",
            pm_uptime: Date.now(),
            created_at: Date.now(),
            restart_time: 0,
            unstable_restarts: 0,
            pm_cwd: "/project",
            pm_exec_path: "npm",
            exec_mode: "fork",
            node_args: [],
            pm_out_log_path: "",
            pm_err_log_path: "",
            pm_pid_path: "",
            env: {},
          },
        },
      ]);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        // No env specified - should detect removal of OLD_VAR
      });

      expect(result.action).toBe("restarted");
      expect(result.envChanged).toBe(true);
      expect(result.server.env).toEqual({});
    });

    it("should not restart when env variables are the same", async () => {
      const existingServer: ServerEntry = {
        id: "existing-id",
        name: "env-server",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3456,
        protocol: "http",
        hostname: "localhost",
        env: { API_URL: "http://localhost:3000" },
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-env-server",
      };

      mockRegistryService.findByCommandHash.mockReturnValue(existingServer);
      mockPM2._setProcesses([
        {
          pid: 12345,
          name: "servherd-env-server",
          pm2_env: {
            status: "online",
            pm_id: 0,
            name: "servherd-env-server",
            pm_uptime: Date.now(),
            created_at: Date.now(),
            restart_time: 0,
            unstable_restarts: 0,
            pm_cwd: "/project",
            pm_exec_path: "npm",
            exec_mode: "fork",
            node_args: [],
            pm_out_log_path: "",
            pm_err_log_path: "",
            pm_pid_path: "",
            env: {},
          },
        },
      ]);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        env: { API_URL: "http://localhost:3000" }, // Same value
      });

      expect(result.action).toBe("existing");
      expect(result.envChanged).toBeUndefined();
    });
  });

  describe("--protocol option", () => {
    it("should override default protocol", async () => {
      const newServer: ServerEntry = {
        id: "test-id",
        name: "brave-tiger",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3456,
        protocol: "https",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-brave-tiger",
      };

      mockRegistryService.addServer.mockResolvedValue(newServer);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
        protocol: "https",
      });

      expect(result.server.protocol).toBe("https");
      expect(mockRegistryService.addServer).toHaveBeenCalledWith(
        expect.objectContaining({ protocol: "https" }),
      );
    });

    it("should use config protocol when not specified", async () => {
      mockConfigService.load.mockResolvedValue({
        version: "1",
        hostname: "localhost",
        protocol: "https",
        portRange: { min: 3000, max: 9999 },
        tempDir: "/tmp/servherd",
        pm2: { logDir: "/tmp/servherd/logs", pidDir: "/tmp/servherd/pids" },
      });

      const newServer: ServerEntry = {
        id: "test-id",
        name: "brave-tiger",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3456,
        protocol: "https",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-brave-tiger",
      };

      mockRegistryService.addServer.mockResolvedValue(newServer);

      const result = await executeStart({
        command: "npm start",
        cwd: "/project",
      });

      expect(result.server.protocol).toBe("https");
    });

    it("should generate https URL when protocol is https", async () => {
      const newServer: ServerEntry = {
        id: "test-id",
        name: "brave-tiger",
        command: "npm start --url {{url}}",
        resolvedCommand: "npm start --url https://localhost:3456",
        cwd: "/project",
        port: 3456,
        protocol: "https",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-brave-tiger",
      };

      mockRegistryService.addServer.mockResolvedValue(newServer);

      await executeStart({
        command: "npm start --url {{url}}",
        cwd: "/project",
        protocol: "https",
      });

      // The resolved command should contain https URL
      expect(mockRegistryService.updateServer).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          resolvedCommand: expect.stringContaining("https://"),
        }),
      );
    });
  });

  describe("CI mode", () => {
    it("should pass ciMode to configService.load when ciMode is true", async () => {
      const newServer: ServerEntry = {
        id: "test-id",
        name: "brave-tiger",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3456,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-brave-tiger",
      };

      mockRegistryService.addServer.mockResolvedValue(newServer);

      await executeStart({
        command: "npm start",
        cwd: "/project",
        ciMode: true,
      });

      // Verify configService.load was called with ciMode: true
      expect(mockConfigService.load).toHaveBeenCalledWith({ ciMode: true });
    });

    it("should not pass ciMode when ciMode is false or undefined", async () => {
      const newServer: ServerEntry = {
        id: "test-id",
        name: "brave-tiger",
        command: "npm start",
        resolvedCommand: "npm start",
        cwd: "/project",
        port: 3456,
        protocol: "http",
        hostname: "localhost",
        env: {},
        createdAt: new Date().toISOString(),
        pm2Name: "servherd-brave-tiger",
      };

      mockRegistryService.addServer.mockResolvedValue(newServer);

      await executeStart({
        command: "npm start",
        cwd: "/project",
      });

      // Verify configService.load was called with ciMode: undefined (not true)
      expect(mockConfigService.load).toHaveBeenCalledWith({ ciMode: undefined });
    });
  });
});
