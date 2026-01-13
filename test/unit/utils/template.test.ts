import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  extractVariables,
  parseEnvStrings,
  renderEnvTemplates,
  getTemplateVariables,
  findMissingVariables,
  formatMissingVariablesError,
  formatMissingVariablesForMCP,
  usesServerLookup,
  type TemplateContext,
} from "../../../src/utils/template.js";
import type { GlobalConfig } from "../../../src/types/config.js";
import type { ServerEntry } from "../../../src/types/registry.js";

describe("TemplateEngine", () => {
  describe("renderTemplate", () => {
    it("should substitute {{port}} variable", () => {
      const result = renderTemplate("npm start --port {{port}}", { port: 3000 });
      expect(result).toBe("npm start --port 3000");
    });

    it("should substitute {{hostname}} variable", () => {
      const result = renderTemplate("npm start --host {{hostname}}", { hostname: "localhost" });
      expect(result).toBe("npm start --host localhost");
    });

    it("should substitute multiple variables", () => {
      const result = renderTemplate("npm start --port {{port}} --host {{hostname}}", {
        port: 3000,
        hostname: "localhost",
      });
      expect(result).toBe("npm start --port 3000 --host localhost");
    });

    it("should substitute repeated variables", () => {
      const result = renderTemplate("echo {{port}} {{port}} {{port}}", { port: 8080 });
      expect(result).toBe("echo 8080 8080 8080");
    });

    it("should handle missing variables by leaving them unchanged", () => {
      const result = renderTemplate("npm start --port {{port}}", {});
      expect(result).toBe("npm start --port {{port}}");
    });

    it("should handle templates with no variables", () => {
      const result = renderTemplate("npm start", { port: 3000 });
      expect(result).toBe("npm start");
    });

    it("should handle empty template", () => {
      const result = renderTemplate("", { port: 3000 });
      expect(result).toBe("");
    });

    it("should handle {{url}} variable", () => {
      const result = renderTemplate("open {{url}}", { url: "http://localhost:3000" });
      expect(result).toBe("open http://localhost:3000");
    });

    it("should handle whitespace in template syntax", () => {
      const result = renderTemplate("npm start --port {{ port }}", { port: 3000 });
      expect(result).toBe("npm start --port 3000");
    });

    it("should handle string port values", () => {
      const result = renderTemplate("npm start --port {{port}}", { port: "3000" });
      expect(result).toBe("npm start --port 3000");
    });
  });

  describe("extractVariables", () => {
    it("should extract single variable", () => {
      const vars = extractVariables("npm start --port {{port}}");
      expect(vars).toEqual(["port"]);
    });

    it("should extract multiple variables", () => {
      const vars = extractVariables("npm start --port {{port}} --host {{hostname}}");
      expect(vars).toEqual(["port", "hostname"]);
    });

    it("should extract unique variables only", () => {
      const vars = extractVariables("echo {{port}} {{port}} {{port}}");
      expect(vars).toEqual(["port"]);
    });

    it("should return empty array for templates with no variables", () => {
      const vars = extractVariables("npm start");
      expect(vars).toEqual([]);
    });

    it("should return empty array for empty template", () => {
      const vars = extractVariables("");
      expect(vars).toEqual([]);
    });

    it("should handle whitespace in variable syntax", () => {
      const vars = extractVariables("npm start --port {{ port }}");
      expect(vars).toEqual(["port"]);
    });

    it("should extract url variable", () => {
      const vars = extractVariables("open {{url}}");
      expect(vars).toEqual(["url"]);
    });
  });

  describe("parseEnvStrings", () => {
    it("should parse single KEY=VALUE string", () => {
      const result = parseEnvStrings(["PORT=3000"]);
      expect(result).toEqual({ PORT: "3000" });
    });

    it("should parse multiple KEY=VALUE strings", () => {
      const result = parseEnvStrings(["PORT=3000", "HOST=localhost", "DEBUG=true"]);
      expect(result).toEqual({
        PORT: "3000",
        HOST: "localhost",
        DEBUG: "true",
      });
    });

    it("should handle values with equals signs", () => {
      const result = parseEnvStrings(["CONFIG=key=value"]);
      expect(result).toEqual({ CONFIG: "key=value" });
    });

    it("should handle empty values", () => {
      const result = parseEnvStrings(["EMPTY="]);
      expect(result).toEqual({ EMPTY: "" });
    });

    it("should handle values with template variables", () => {
      const result = parseEnvStrings(["PORT={{port}}", "URL={{url}}"]);
      expect(result).toEqual({ PORT: "{{port}}", URL: "{{url}}" });
    });

    it("should handle empty array", () => {
      const result = parseEnvStrings([]);
      expect(result).toEqual({});
    });

    it("should throw error for missing equals sign", () => {
      expect(() => parseEnvStrings(["INVALID"])).toThrow(
        "Invalid environment variable format: \"INVALID\". Expected KEY=VALUE format.",
      );
    });

    it("should throw error for empty key", () => {
      expect(() => parseEnvStrings(["=value"])).toThrow(
        "Invalid environment variable format: \"=value\". Key cannot be empty.",
      );
    });

    it("should handle values with special characters", () => {
      const result = parseEnvStrings(["URL=http://localhost:3000/api?foo=bar"]);
      expect(result).toEqual({ URL: "http://localhost:3000/api?foo=bar" });
    });
  });

  describe("renderEnvTemplates", () => {
    it("should render template variables in env values", () => {
      const result = renderEnvTemplates(
        { PORT: "{{port}}", HOST: "{{hostname}}" },
        { port: 3000, hostname: "localhost" },
      );
      expect(result).toEqual({ PORT: "3000", HOST: "localhost" });
    });

    it("should handle mixed template and literal values", () => {
      const result = renderEnvTemplates(
        { PORT: "{{port}}", DEBUG: "true", URL: "{{url}}" },
        { port: 3000, url: "http://localhost:3000" },
      );
      expect(result).toEqual({
        PORT: "3000",
        DEBUG: "true",
        URL: "http://localhost:3000",
      });
    });

    it("should handle values with embedded templates", () => {
      const result = renderEnvTemplates(
        { BASE_URL: "http://{{hostname}}:{{port}}/api" },
        { hostname: "localhost", port: 3000 },
      );
      expect(result).toEqual({ BASE_URL: "http://localhost:3000/api" });
    });

    it("should leave unresolved templates unchanged", () => {
      const result = renderEnvTemplates(
        { PORT: "{{port}}", UNKNOWN: "{{unknown}}" },
        { port: 3000 },
      );
      expect(result).toEqual({ PORT: "3000", UNKNOWN: "{{unknown}}" });
    });

    it("should handle empty env object", () => {
      const result = renderEnvTemplates({}, { port: 3000 });
      expect(result).toEqual({});
    });

    it("should not mutate original env object", () => {
      const original = { PORT: "{{port}}" };
      renderEnvTemplates(original, { port: 3000 });
      expect(original).toEqual({ PORT: "{{port}}" });
    });
  });

  describe("getTemplateVariables", () => {
    const baseConfig: GlobalConfig = {
      version: "1",
      hostname: "localhost",
      protocol: "http",
      portRange: { min: 3000, max: 9999 },
      tempDir: "/tmp/servherd",
      pm2: { logDir: "/tmp/servherd/logs", pidDir: "/tmp/servherd/pids" },
    };

    it("should generate basic template variables", () => {
      const vars = getTemplateVariables(baseConfig, 8080);

      expect(vars.port).toBe(8080);
      expect(vars.hostname).toBe("localhost");
      expect(vars.url).toBe("http://localhost:8080");
    });

    it("should use https:// in URL when protocol is https", () => {
      const httpsConfig = { ...baseConfig, protocol: "https" as const };
      const vars = getTemplateVariables(httpsConfig, 8080);

      expect(vars.url).toBe("https://localhost:8080");
    });

    it("should include empty https-cert and https-key when not configured", () => {
      const vars = getTemplateVariables(baseConfig, 8080);

      expect(vars["https-cert"]).toBe("");
      expect(vars["https-key"]).toBe("");
    });

    it("should include https-cert and https-key when configured", () => {
      const configWithHttps = {
        ...baseConfig,
        protocol: "https" as const,
        httpsCert: "/path/to/cert.pem",
        httpsKey: "/path/to/key.pem",
      };
      const vars = getTemplateVariables(configWithHttps, 8080);

      expect(vars["https-cert"]).toBe("/path/to/cert.pem");
      expect(vars["https-key"]).toBe("/path/to/key.pem");
    });

    it("should render {{https-cert}} variable in template", () => {
      const configWithHttps = {
        ...baseConfig,
        httpsCert: "/path/to/cert.pem",
        httpsKey: "/path/to/key.pem",
      };
      const vars = getTemplateVariables(configWithHttps, 8080);
      const result = renderTemplate("--cert {{https-cert}}", vars);

      expect(result).toBe("--cert /path/to/cert.pem");
    });

    it("should render {{https-key}} variable in template", () => {
      const configWithHttps = {
        ...baseConfig,
        httpsCert: "/path/to/cert.pem",
        httpsKey: "/path/to/key.pem",
      };
      const vars = getTemplateVariables(configWithHttps, 8080);
      const result = renderTemplate("--key {{https-key}}", vars);

      expect(result).toBe("--key /path/to/key.pem");
    });

    it("should support custom hostname in URL", () => {
      const customConfig = { ...baseConfig, hostname: "myserver.local" };
      const vars = getTemplateVariables(customConfig, 9000);

      expect(vars.url).toBe("http://myserver.local:9000");
      expect(vars.hostname).toBe("myserver.local");
    });

    it("should include custom variables from config", () => {
      const configWithVars = {
        ...baseConfig,
        variables: {
          "my-token": "secret123",
          "api-key": "abc456",
        },
      };
      const vars = getTemplateVariables(configWithVars, 8080);

      expect(vars["my-token"]).toBe("secret123");
      expect(vars["api-key"]).toBe("abc456");
    });

    it("should render custom variables in templates", () => {
      const configWithVars = {
        ...baseConfig,
        variables: { "auth-token": "bearer-xyz" },
      };
      const vars = getTemplateVariables(configWithVars, 8080);
      const result = renderTemplate("--token {{auth-token}}", vars);

      expect(result).toBe("--token bearer-xyz");
    });

    it("should allow built-in variables to take precedence over custom variables", () => {
      // This tests that if somehow a custom var with reserved name got through,
      // the built-in would still win
      const configWithVars = {
        ...baseConfig,
        variables: {
          "port": "9999", // Should not override built-in port
        },
      };
      const vars = getTemplateVariables(configWithVars, 8080);

      // Built-in port should take precedence
      expect(vars.port).toBe(8080);
    });

    it("should handle empty variables object", () => {
      const configWithEmptyVars = {
        ...baseConfig,
        variables: {},
      };
      const vars = getTemplateVariables(configWithEmptyVars, 8080);

      expect(vars.port).toBe(8080);
      expect(vars.hostname).toBe("localhost");
    });

    it("should handle undefined variables", () => {
      const configWithoutVars = {
        ...baseConfig,
        variables: undefined,
      };
      const vars = getTemplateVariables(configWithoutVars, 8080);

      expect(vars.port).toBe(8080);
      expect(vars.hostname).toBe("localhost");
    });
  });

  describe("findMissingVariables", () => {
    it("should return empty array when no variables are used", () => {
      const missing = findMissingVariables("npm start", { port: 3000 });
      expect(missing).toEqual([]);
    });

    it("should return empty array when all variables have values", () => {
      const missing = findMissingVariables("--port {{port}} --host {{hostname}}", {
        port: 3000,
        hostname: "localhost",
      });
      expect(missing).toEqual([]);
    });

    it("should detect missing https-cert variable", () => {
      const missing = findMissingVariables("--cert {{https-cert}}", {
        "https-cert": "",
      });

      expect(missing).toHaveLength(1);
      expect(missing[0].templateVar).toBe("https-cert");
      expect(missing[0].configKey).toBe("httpsCert");
      expect(missing[0].configurable).toBe(true);
    });

    it("should detect missing https-key variable", () => {
      const missing = findMissingVariables("--key {{https-key}}", {
        "https-key": "",
      });

      expect(missing).toHaveLength(1);
      expect(missing[0].templateVar).toBe("https-key");
      expect(missing[0].configKey).toBe("httpsKey");
      expect(missing[0].configurable).toBe(true);
    });

    it("should detect multiple missing variables", () => {
      const missing = findMissingVariables("--cert {{https-cert}} --key {{https-key}}", {
        "https-cert": "",
        "https-key": "",
      });

      expect(missing).toHaveLength(2);
      expect(missing.map(m => m.templateVar)).toContain("https-cert");
      expect(missing.map(m => m.templateVar)).toContain("https-key");
    });

    it("should not detect port as missing since it cannot be configured", () => {
      const missing = findMissingVariables("--port {{port}}", {});

      expect(missing).toHaveLength(1);
      expect(missing[0].templateVar).toBe("port");
      expect(missing[0].configurable).toBe(false);
      expect(missing[0].configKey).toBeNull();
    });

    it("should not detect url as missing since it cannot be configured", () => {
      const missing = findMissingVariables("open {{url}}", {});

      expect(missing).toHaveLength(1);
      expect(missing[0].templateVar).toBe("url");
      expect(missing[0].configurable).toBe(false);
    });

    it("should detect hostname as configurable", () => {
      const missing = findMissingVariables("--host {{hostname}}", {
        hostname: "",
      });

      expect(missing).toHaveLength(1);
      expect(missing[0].templateVar).toBe("hostname");
      expect(missing[0].configKey).toBe("hostname");
      expect(missing[0].configurable).toBe(true);
    });

    it("should provide human-readable prompt for each variable", () => {
      const missing = findMissingVariables("--cert {{https-cert}}", {
        "https-cert": "",
      });

      expect(missing[0].prompt).toContain("HTTPS certificate");
    });

    it("should handle undefined variables", () => {
      const missing = findMissingVariables("--cert {{https-cert}}", {});

      expect(missing).toHaveLength(1);
      expect(missing[0].templateVar).toBe("https-cert");
    });

    it("should detect missing custom variable as isCustomVar", () => {
      const missing = findMissingVariables("--token {{my-custom-token}}", {});

      expect(missing).toHaveLength(1);
      expect(missing[0].templateVar).toBe("my-custom-token");
      expect(missing[0].isCustomVar).toBe(true);
      expect(missing[0].configurable).toBe(true);
      expect(missing[0].configKey).toBeNull();
    });

    it("should not flag custom variable as missing when it has a value", () => {
      const missing = findMissingVariables("--token {{my-token}}", {
        "my-token": "secret123",
      });

      expect(missing).toEqual([]);
    });

    it("should detect built-in variables as not custom", () => {
      const missing = findMissingVariables("--host {{hostname}}", {
        hostname: "",
      });

      expect(missing).toHaveLength(1);
      expect(missing[0].isCustomVar).toBe(false);
    });

    it("should detect multiple custom variables", () => {
      const missing = findMissingVariables("--token {{api-token}} --key {{api-key}}", {});

      expect(missing).toHaveLength(2);
      expect(missing.every(m => m.isCustomVar)).toBe(true);
    });
  });

  describe("formatMissingVariablesError", () => {
    it("should return empty string when no missing variables", () => {
      const result = formatMissingVariablesError([]);
      expect(result).toBe("");
    });

    it("should format configurable variable with set command", () => {
      const missing = [{
        templateVar: "https-cert",
        configKey: "httpsCert" as const,
        prompt: "Path to HTTPS certificate file:",
        configurable: true,
        isCustomVar: false,
      }];

      const result = formatMissingVariablesError(missing);

      expect(result).toContain("{{https-cert}}");
      expect(result).toContain("servherd config --set httpsCert --value");
    });

    it("should format non-configurable variable appropriately", () => {
      const missing = [{
        templateVar: "port",
        configKey: null,
        prompt: "Port:",
        configurable: false,
        isCustomVar: false,
      }];

      const result = formatMissingVariablesError(missing);

      expect(result).toContain("{{port}}");
      expect(result).toContain("auto-generated");
    });

    it("should format multiple missing variables", () => {
      const missing = [
        {
          templateVar: "https-cert",
          configKey: "httpsCert" as const,
          prompt: "Path to HTTPS certificate file:",
          configurable: true,
          isCustomVar: false,
        },
        {
          templateVar: "https-key",
          configKey: "httpsKey" as const,
          prompt: "Path to HTTPS key file:",
          configurable: true,
          isCustomVar: false,
        },
      ];

      const result = formatMissingVariablesError(missing);

      expect(result).toContain("{{https-cert}}");
      expect(result).toContain("{{https-key}}");
    });

    it("should format custom variable with --add command", () => {
      const missing = [{
        templateVar: "my-api-token",
        configKey: null,
        prompt: "Value for my-api-token:",
        configurable: true,
        isCustomVar: true,
      }];

      const result = formatMissingVariablesError(missing);

      expect(result).toContain("{{my-api-token}}");
      expect(result).toContain("servherd config --add my-api-token --value");
    });

    it("should distinguish between built-in and custom variables", () => {
      const missing = [
        {
          templateVar: "https-cert",
          configKey: "httpsCert" as const,
          prompt: "Path to HTTPS certificate file:",
          configurable: true,
          isCustomVar: false,
        },
        {
          templateVar: "my-token",
          configKey: null,
          prompt: "Value for my-token:",
          configurable: true,
          isCustomVar: true,
        },
      ];

      const result = formatMissingVariablesError(missing);

      expect(result).toContain("--set httpsCert");
      expect(result).toContain("--add my-token");
    });
  });

  describe("formatMissingVariablesForMCP", () => {
    it("should return empty string when no missing variables", () => {
      const result = formatMissingVariablesForMCP([]);
      expect(result).toBe("");
    });

    it("should format configurable variable with MCP tool guidance", () => {
      const missing = [{
        templateVar: "https-cert",
        configKey: "httpsCert" as const,
        prompt: "Path to HTTPS certificate file:",
        configurable: true,
        isCustomVar: false,
      }];

      const result = formatMissingVariablesForMCP(missing);

      expect(result).toContain("Cannot start server");
      expect(result).toContain("servherd_config");
      expect(result).toContain("set=\"httpsCert\"");
      expect(result).toContain("{{https-cert}}");
    });

    it("should guide AI to configure values first", () => {
      const missing = [{
        templateVar: "https-cert",
        configKey: "httpsCert" as const,
        prompt: "Path to HTTPS certificate file:",
        configurable: true,
        isCustomVar: false,
      }];

      const result = formatMissingVariablesForMCP(missing);

      expect(result).toContain("configure these values first");
      expect(result).toContain("retry the start command");
    });

    it("should handle only non-configurable variables", () => {
      const missing = [{
        templateVar: "port",
        configKey: null,
        prompt: "Port:",
        configurable: false,
        isCustomVar: false,
      }];

      const result = formatMissingVariablesForMCP(missing);

      expect(result).toContain("auto-generated");
      expect(result).toContain("internal error");
    });

    it("should format multiple missing variables for AI", () => {
      const missing = [
        {
          templateVar: "https-cert",
          configKey: "httpsCert" as const,
          prompt: "Path to HTTPS certificate file:",
          configurable: true,
          isCustomVar: false,
        },
        {
          templateVar: "https-key",
          configKey: "httpsKey" as const,
          prompt: "Path to HTTPS key file:",
          configurable: true,
          isCustomVar: false,
        },
      ];

      const result = formatMissingVariablesForMCP(missing);

      expect(result).toContain("{{https-cert}}");
      expect(result).toContain("{{https-key}}");
      expect(result).toContain("set=\"httpsCert\"");
      expect(result).toContain("set=\"httpsKey\"");
    });

    it("should format custom variable with add parameter for MCP", () => {
      const missing = [{
        templateVar: "my-api-token",
        configKey: null,
        prompt: "Value for my-api-token:",
        configurable: true,
        isCustomVar: true,
      }];

      const result = formatMissingVariablesForMCP(missing);

      expect(result).toContain("{{my-api-token}}");
      expect(result).toContain("add=\"my-api-token\"");
      expect(result).toContain("addValue=");
    });

    it("should distinguish between built-in and custom variables for MCP", () => {
      const missing = [
        {
          templateVar: "https-cert",
          configKey: "httpsCert" as const,
          prompt: "Path to HTTPS certificate file:",
          configurable: true,
          isCustomVar: false,
        },
        {
          templateVar: "my-token",
          configKey: null,
          prompt: "Value for my-token:",
          configurable: true,
          isCustomVar: true,
        },
      ];

      const result = formatMissingVariablesForMCP(missing);

      expect(result).toContain("set=\"httpsCert\"");
      expect(result).toContain("add=\"my-token\"");
    });
  });

  describe("usesServerLookup", () => {
    it("should detect {{$ ...}} syntax", () => {
      expect(usesServerLookup("{{$ \"backend\" \"port\"}}")).toBe(true);
      expect(usesServerLookup("{{$ svc=\"backend\" prop=\"port\"}}")).toBe(true);
    });

    it("should return false for regular templates", () => {
      expect(usesServerLookup("{{port}}")).toBe(false);
      expect(usesServerLookup("npm start --port {{port}}")).toBe(false);
    });

    it("should return false for empty template", () => {
      expect(usesServerLookup("")).toBe(false);
    });
  });

  describe("$ helper (server lookup)", () => {
    // Mock server entries for testing
    const mockServers: Record<string, ServerEntry> = {
      backend: {
        id: "backend-id",
        name: "backend",
        command: "node server.js",
        resolvedCommand: "node server.js --port 9042",
        cwd: "/project",
        port: 9042,
        createdAt: new Date().toISOString(),
        status: "online",
      } as ServerEntry,
      frontend: {
        id: "frontend-id",
        name: "frontend",
        command: "vite",
        resolvedCommand: "vite --port 9043",
        cwd: "/project",
        port: 9043,
        createdAt: new Date().toISOString(),
        status: "online",
      } as ServerEntry,
    };

    const createContext = (cwd = "/project"): TemplateContext => ({
      cwd,
      lookupServer: (name: string, lookupCwd?: string) => {
        const server = mockServers[name];
        if (server && server.cwd === lookupCwd) {
          return server;
        }
        return undefined;
      },
    });

    it("should resolve server port with positional args", () => {
      const result = renderTemplate(
        "API_PORT={{$ \"backend\" \"port\"}}",
        {},
        createContext(),
      );
      expect(result).toBe("API_PORT=9042");
    });

    it("should resolve server port with hash args", () => {
      const result = renderTemplate(
        "{{$ service=\"backend\" prop=\"port\"}}",
        {},
        createContext(),
      );
      expect(result).toBe("9042");
    });

    it("should support svc alias for service", () => {
      const result = renderTemplate(
        "{{$ svc=\"backend\" prop=\"port\"}}",
        {},
        createContext(),
      );
      expect(result).toBe("9042");
    });

    it("should support property alias for prop", () => {
      const result = renderTemplate(
        "{{$ service=\"backend\" property=\"port\"}}",
        {},
        createContext(),
      );
      expect(result).toBe("9042");
    });

    it("should resolve different properties", () => {
      const result = renderTemplate(
        "NAME={{$ \"backend\" \"name\"}} PORT={{$ \"backend\" \"port\"}}",
        {},
        createContext(),
      );
      expect(result).toBe("NAME=backend PORT=9042");
    });

    it("should look up different servers", () => {
      const result = renderTemplate(
        "BACKEND={{$ \"backend\" \"port\"}} FRONTEND={{$ \"frontend\" \"port\"}}",
        {},
        createContext(),
      );
      expect(result).toBe("BACKEND=9042 FRONTEND=9043");
    });

    it("should use cwd from hash arg if provided", () => {
      const context: TemplateContext = {
        lookupServer: (name: string, cwd?: string) => {
          if (name === "backend" && cwd === "/other-project") {
            return { ...mockServers.backend, port: 8888 } as ServerEntry;
          }
          return undefined;
        },
      };
      const result = renderTemplate(
        "{{$ service=\"backend\" prop=\"port\" cwd=\"/other-project\"}}",
        {},
        context,
      );
      expect(result).toBe("8888");
    });

    it("should combine with regular variables", () => {
      const result = renderTemplate(
        "PORT={{port}} BACKEND={{$ \"backend\" \"port\"}}",
        { port: 3000 },
        createContext(),
      );
      expect(result).toBe("PORT=3000 BACKEND=9042");
    });

    it("should throw error when server not found", () => {
      expect(() =>
        renderTemplate(
          "{{$ \"nonexistent\" \"port\"}}",
          {},
          createContext(),
        ),
      ).toThrow("Server \"nonexistent\" not found");
    });

    it("should throw error when property not found", () => {
      expect(() =>
        renderTemplate(
          "{{$ \"backend\" \"nonexistent\"}}",
          {},
          createContext(),
        ),
      ).toThrow("Property \"nonexistent\" not found");
    });

    it("should throw error when no service name provided", () => {
      expect(() =>
        renderTemplate(
          "{{$ prop=\"port\"}}",
          {},
          createContext(),
        ),
      ).toThrow("$ helper requires a service name");
    });

    it("should throw error when no property name provided", () => {
      expect(() =>
        renderTemplate(
          "{{$ service=\"backend\"}}",
          {},
          createContext(),
        ),
      ).toThrow("$ helper requires a property name");
    });

    it("should throw error when no context provided", () => {
      expect(() =>
        renderTemplate(
          "{{$ \"backend\" \"port\"}}",
          {},
          // No context provided
        ),
      ).toThrow("$ helper requires a server lookup function");
    });

    it("should throw error when no cwd available", () => {
      const context: TemplateContext = {
        lookupServer: () => undefined,
        // No cwd
      };
      expect(() =>
        renderTemplate(
          "{{$ \"backend\" \"port\"}}",
          {},
          context,
        ),
      ).toThrow("$ helper requires a cwd");
    });
  });
});
