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
} from "../../../src/utils/template.js";
import type { GlobalConfig } from "../../../src/types/config.js";

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
        },
        {
          templateVar: "https-key",
          configKey: "httpsKey" as const,
          prompt: "Path to HTTPS key file:",
          configurable: true,
        },
      ];

      const result = formatMissingVariablesError(missing);

      expect(result).toContain("{{https-cert}}");
      expect(result).toContain("{{https-key}}");
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
        },
        {
          templateVar: "https-key",
          configKey: "httpsKey" as const,
          prompt: "Path to HTTPS key file:",
          configurable: true,
        },
      ];

      const result = formatMissingVariablesForMCP(missing);

      expect(result).toContain("{{https-cert}}");
      expect(result).toContain("{{https-key}}");
      expect(result).toContain("set=\"httpsCert\"");
      expect(result).toContain("set=\"httpsKey\"");
    });
  });
});
