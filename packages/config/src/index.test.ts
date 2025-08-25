import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

// Mock filesystem operations
vi.mock("node:fs");
vi.mock("node:os");
vi.mock("node:url");

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockHomedir = vi.mocked(homedir);
const mockFileURLToPath = vi.mocked(fileURLToPath);

describe("Config Package", () => {
  // Store original process.env and restore after each test
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mocks
    mockHomedir.mockReturnValue("/home/user");
    mockFileURLToPath.mockReturnValue("/mock/current/path");

    // Reset environment variables - but keep NODE_ENV stable
    process.env = {
      NODE_ENV: "test", // This is what vitest sets
      ...originalEnv,
    };
    delete process.env.ANTHROPIC_API_KEY; // Ensure clean slate

    // Clear module cache to force re-import
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("Schema Validation", () => {
    it("should validate a complete valid config", async () => {
      process.env = {
        ANTHROPIC_API_KEY: "sk-test123",
        OPENAI_API_KEY: "sk-openai123",
        CJODE_DEFAULT_MODEL: "claude-3-sonnet",
        CJODE_SERVER_PORT: "3000",
        CJODE_SERVER_HOST: "localhost",
        NODE_ENV: "development",
      };

      // Mock no files exist to rely on process.env only
      mockExistsSync.mockReturnValue(false);

      const { configSchema } = await import("./index.js");
      const result = configSchema.parse(process.env);

      expect(result).toMatchObject({
        ANTHROPIC_API_KEY: "sk-test123",
        OPENAI_API_KEY: "sk-openai123",
        CJODE_DEFAULT_MODEL: "claude-3-sonnet",
        CJODE_SERVER_PORT: 3000,
        CJODE_SERVER_HOST: "localhost",
        NODE_ENV: "development",
      });
    });

    it("should apply defaults for optional fields", async () => {
      process.env = {
        ANTHROPIC_API_KEY: "sk-test123",
      };

      mockExistsSync.mockReturnValue(false);

      const { configSchema } = await import("./index.js");
      const result = configSchema.parse(process.env);

      expect(result).toMatchObject({
        ANTHROPIC_API_KEY: "sk-test123",
        CJODE_DEFAULT_MODEL: "claude-3-sonnet-20241022",
        CJODE_SERVER_PORT: 3001,
        CJODE_SERVER_HOST: "127.0.0.1",
        NODE_ENV: "production",
      });
    });

    it("should fail validation when required fields are missing", async () => {
      const testEnv = {
        // Missing ANTHROPIC_API_KEY
        NODE_ENV: "development",
      };

      mockExistsSync.mockReturnValue(false);

      const { configSchema } = await import("./index.js");

      expect(() => configSchema.parse(testEnv)).toThrow(/expected string, received undefined/);
    });

    it("should coerce port numbers from strings", async () => {
      process.env = {
        ANTHROPIC_API_KEY: "sk-test123",
        CJODE_SERVER_PORT: "8080",
        PORT: "9000",
      };

      mockExistsSync.mockReturnValue(false);

      const { configSchema } = await import("./index.js");
      const result = configSchema.parse(process.env);

      expect(result.CJODE_SERVER_PORT).toBe(8080);
      expect(result.PORT).toBe(9000);
    });

    it("should validate port number ranges", async () => {
      const testEnv = {
        ANTHROPIC_API_KEY: "sk-test123",
        CJODE_SERVER_PORT: "99999", // Invalid port
      };

      mockExistsSync.mockReturnValue(false);

      const { configSchema } = await import("./index.js");

      expect(() => configSchema.parse(testEnv)).toThrow(/Too big/);
    });
  });

  describe("Environment Variable Precedence", () => {
    it("should prioritize process.env over all other sources", async () => {
      process.env = {
        ANTHROPIC_API_KEY: "process-env-key",
        CJODE_SERVER_PORT: "4000",
      };

      // Mock global config file with different values
      mockExistsSync.mockImplementation((path) => {
        return path.toString().includes(".config/cjode/.env");
      });

      mockReadFileSync.mockImplementation((path) => {
        if (path.toString().includes(".config/cjode/.env")) {
          return "ANTHROPIC_API_KEY=global-key\nCJODE_SERVER_PORT=5000";
        }
        return "";
      });

      const { loadConfig } = await import("./index.js");
      const config = loadConfig();

      expect(config.ANTHROPIC_API_KEY).toBe("process-env-key");
      expect(config.CJODE_SERVER_PORT).toBe(4000);
    });

    it("should use global config when process.env is not set", async () => {
      process.env = {
        // Only set required env that's not in global config
      };

      mockExistsSync.mockImplementation((path) => {
        return path.toString().includes(".config/cjode/.env");
      });

      mockReadFileSync.mockImplementation((path) => {
        if (path.toString().includes(".config/cjode/.env")) {
          return "ANTHROPIC_API_KEY=global-key\nCJODE_SERVER_PORT=5000\nOPENAI_API_KEY=global-openai";
        }
        return "";
      });

      const { loadConfig } = await import("./index.js");
      const config = loadConfig();

      expect(config.ANTHROPIC_API_KEY).toBe("global-key");
      expect(config.CJODE_SERVER_PORT).toBe(5000);
      expect(config.OPENAI_API_KEY).toBe("global-openai");
    });
  });

  describe("Development Context Detection", () => {
    it("should detect development context in monorepo", async () => {
      // Set development environment
      process.env = {
        NODE_ENV: 'development',
        // Don't include ANTHROPIC_API_KEY in process.env so it has to come from .env file
      };

      // Mock process.cwd() to return a test directory
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue('/Users/dev/cjode');

      // Mock file system to simulate .env file in current working directory
      mockExistsSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr === '/Users/dev/cjode/.env') {
          return true;
        }
        if (pathStr.includes('pnpm-workspace.yaml') && pathStr.includes('/Users/dev/cjode/pnpm-workspace.yaml')) {
          return true;
        }
        if (pathStr.includes('package.json') && pathStr.includes('/Users/dev/cjode/package.json')) {
          return true;
        }
        return false;
      });

      mockReadFileSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr === '/Users/dev/cjode/.env') {
          return "ANTHROPIC_API_KEY=dev-key\nCJODE_SERVER_PORT=3333";
        }
        if (pathStr.includes('/Users/dev/cjode/package.json')) {
          return JSON.stringify({ name: "cjode", private: true });
        }
        return "";
      });

      const { loadConfig } = await import("./index.js");
      const config = loadConfig();

      expect(config.ANTHROPIC_API_KEY).toBe("dev-key");
      expect(config.CJODE_SERVER_PORT).toBe(3333);

      // Restore original cwd
      process.cwd = originalCwd;
    });

    it("should not load local .env in non-development context", async () => {
      // Mock being in normal installed context
      mockFileURLToPath.mockReturnValue("/usr/local/lib/node_modules/@cjode/config/dist/index.js");

      process.env = {
        ANTHROPIC_API_KEY: "production-key",
      };

      // Mock no global config exists
      mockExistsSync.mockReturnValue(false);

      const { loadConfig } = await import("./index.js");
      const config = loadConfig();

      expect(config.ANTHROPIC_API_KEY).toBe("production-key");
      expect(config.CJODE_SERVER_PORT).toBe(3001); // default
    });
  });

  describe("Config File Parsing", () => {
    it("should parse .env files correctly", async () => {
      process.env = {}; // Empty process env

      mockExistsSync.mockImplementation((path) => {
        return path.toString().includes(".config/cjode/.env");
      });

      mockReadFileSync.mockImplementation((path) => {
        if (path.toString().includes(".config/cjode/.env")) {
          return `# Comment line
ANTHROPIC_API_KEY=sk-test123
CJODE_SERVER_PORT=4000
# Another comment
OPENAI_API_KEY="quoted-value"
CJODE_SERVER_HOST='single-quoted'
EMPTY_LINE=

INVALID_LINE_NO_EQUALS`;
        }
        return "";
      });

      const { loadConfig } = await import("./index.js");
      const config = loadConfig();

      expect(config.ANTHROPIC_API_KEY).toBe("sk-test123");
      expect(config.CJODE_SERVER_PORT).toBe(4000);
      expect(config.OPENAI_API_KEY).toBe("quoted-value");
      expect(config.CJODE_SERVER_HOST).toBe("single-quoted");
    });

    it("should handle file read errors gracefully", async () => {
      process.env = {
        ANTHROPIC_API_KEY: "fallback-key",
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error("File read error");
      });

      // Should not throw, just warn and continue
      const { loadConfig } = await import("./index.js");
      const config = loadConfig();

      expect(config.ANTHROPIC_API_KEY).toBe("fallback-key");
    });
  });

  describe("Cross-platform Path Handling", () => {
    it("should handle Windows paths correctly", async () => {
      // Set minimum required env
      process.env = {
        ANTHROPIC_API_KEY: "sk-test123",
        NODE_ENV: "production",
      };

      // Mock Windows platform
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      mockHomedir.mockReturnValue("C:\\Users\\test");
      mockExistsSync.mockReturnValue(false); // No config files

      const { configPaths } = await import("./index.js");

      expect(configPaths.config).toMatch(/C:[/\\]Users[/\\]test[/\\]AppData[/\\]Roaming[/\\]cjode/);
    });

    it("should handle Unix paths correctly", async () => {
      // Set minimum required env
      process.env = {
        ANTHROPIC_API_KEY: "sk-test123",
        NODE_ENV: "production",
      };

      // Mock Unix platform
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      mockHomedir.mockReturnValue("/home/test");
      mockExistsSync.mockReturnValue(false); // No config files

      const { configPaths } = await import("./index.js");

      expect(configPaths.config).toBe("/home/test/.config/cjode");
    });
  });

  describe("Config Isolation", () => {
    it("should not read .env from arbitrary project directories", async () => {
      // Mock being in some random project directory
      mockFileURLToPath.mockReturnValue(
        "/Users/dev/some-other-project/node_modules/@cjode/config/dist/index.js",
      );

      process.env = {
        ANTHROPIC_API_KEY: "env-key",
      };

      // Mock .env exists in the random project but shouldn't be read
      mockExistsSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes("/Users/dev/some-other-project/.env")) {
          return true; // This should not be read
        }
        return false;
      });

      mockReadFileSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes("/Users/dev/some-other-project/.env")) {
          return "ANTHROPIC_API_KEY=should-not-be-used";
        }
        return "";
      });

      const { loadConfig } = await import("./index.js");
      const config = loadConfig();

      // Should use process.env, not the random project's .env
      expect(config.ANTHROPIC_API_KEY).toBe("env-key");
    });
  });

  describe("Error Handling", () => {
    it("should provide clear error messages for validation failures", async () => {
      const testEnv = {
        ANTHROPIC_API_KEY: "", // Empty string should fail validation
      };

      mockExistsSync.mockReturnValue(false);

      const { configSchema } = await import("./index.js");

      expect(() => configSchema.parse(testEnv)).toThrow();
    });
  });
});
