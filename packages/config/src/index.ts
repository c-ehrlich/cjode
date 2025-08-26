import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

import { z } from "zod";

// Configuration Schema
export const configSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  OPENAI_API_KEY: z.string().optional(),
  CJODE_DEFAULT_MODEL: z.string().optional().default("claude-3-sonnet-20241022"),
  CJODE_SERVER_PORT: z.coerce.number().min(1).max(65535).optional().default(3001),
  CJODE_SERVER_HOST: z.string().optional().default("127.0.0.1"),
  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("production"),
  PORT: z.coerce.number().min(1).max(65535).optional(), // Fallback for server port
  HOST: z.string().optional(), // Fallback for server port
});

export type AppConfig = z.infer<typeof configSchema>;

// Configuration paths (cross-platform)
const platform = process.platform;
const home = homedir();

const configPaths = {
  config:
    platform === "win32"
      ? join(home, "AppData", "Roaming", "cjode")
      : join(home, ".config", "cjode"),
} as const;

const configFiles = {
  env: join(configPaths.config, ".env"),
} as const;

/**
 * Detect if we're running in development context (cjode source development)
 * vs normal usage (installed cjode package)
 */
function isDevContext(): boolean {
  // Only consider development context if NODE_ENV is explicitly set to development
  // AND we can verify we're in the cjode workspace
  if (process.env.NODE_ENV === "development") {
    try {
      // Walk up from current directory to find workspace root
      let searchDir = process.cwd();

      while (searchDir !== "/" && searchDir !== ".") {
        const workspaceFile = join(searchDir, "pnpm-workspace.yaml");
        const packageFile = join(searchDir, "package.json");

        if (existsSync(workspaceFile) && existsSync(packageFile)) {
          const pkg = JSON.parse(readFileSync(packageFile, "utf-8"));
          if (pkg.name === "cjode" || pkg.name === "@c-ehrlich/cjode") {
            return true;
          }
        }

        searchDir = dirname(searchDir);
      }
    } catch {
      // If we can't verify workspace structure, don't assume development
    }
  }

  // In all other cases (including NODE_ENV=production or test), use production mode
  return false;
}

/**
 * Parse .env file content into key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();

    // Remove quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

/**
 * Load and validate configuration with proper precedence:
 * 1. process.env (highest priority - for Docker/CI/cloud)
 * 2. ~/.config/cjode/.env (global config - normal usage)
 * 3. .env in cjode repo root (ONLY when developing cjode itself)
 */
export function loadConfig(): AppConfig {
  let envVars: Record<string, unknown> = { ...process.env };
  const devMode = isDevContext();

  if (devMode) {
    // Development mode: ONLY load local .env file (never global config)
    try {
      // Find the workspace root by walking up from cwd looking for pnpm-workspace.yaml
      let searchDir = process.cwd();
      let workspaceRoot = null;

      while (searchDir !== "/" && searchDir !== ".") {
        const workspaceFile = join(searchDir, "pnpm-workspace.yaml");
        const packageFile = join(searchDir, "package.json");

        if (existsSync(workspaceFile) && existsSync(packageFile)) {
          try {
            const pkg = JSON.parse(readFileSync(packageFile, "utf-8"));
            if (pkg.name === "cjode" || pkg.name === "@c-ehrlich/cjode") {
              workspaceRoot = searchDir;
              break;
            }
          } catch {
            // Continue searching
          }
        }
        searchDir = dirname(searchDir);
      }

      if (!workspaceRoot) {
        // Fall back to process.cwd() if we can't find workspace root
        workspaceRoot = process.cwd();
      }

      const envFilePath = join(workspaceRoot, ".env");

      if (existsSync(envFilePath)) {
        const localEnvContent = readFileSync(envFilePath, "utf-8");
        const localEnv = parseEnvFile(localEnvContent);

        // Local env has lower priority than process.env
        for (const [key, value] of Object.entries(localEnv)) {
          if (!envVars[key]) {
            envVars[key] = value;
          }
        }

        console.log(`🔧 Development mode: loaded .env from ${envFilePath}`);
      } else {
        console.log(`🔧 Development mode: no .env file found at ${envFilePath}`);
      }
    } catch (error) {
      console.warn("Warning: Could not load local .env file:", error);
    }
  } else {
    // Production mode: Load global config (normal usage)
    try {
      if (existsSync(configFiles.env)) {
        const globalEnvContent = readFileSync(configFiles.env, "utf-8");
        const globalEnv = parseEnvFile(globalEnvContent);

        // Global config has lower priority than process.env
        for (const [key, value] of Object.entries(globalEnv)) {
          if (!envVars[key]) {
            envVars[key] = value;
          }
        }
      }
    } catch (error) {
      console.warn("Warning: Could not load global config file:", error);
    }
  }

  // Validate and return typed config
  try {
    return configSchema.parse(envVars);
  } catch (error) {
    console.error("Configuration validation failed:", error);
    throw error;
  }
}

// Lazy-loaded singleton config instance
let configInstance: AppConfig | null = null;

export const getConfig = (): AppConfig => {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
};

// Export configuration paths and files for external use
export { configPaths, configFiles };
