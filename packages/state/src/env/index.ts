import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { configFiles } from "../config/paths.js";

export interface EnvironmentConfig {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  CJODE_DEFAULT_MODEL?: string;
  CJODE_SERVER_PORT?: string;
  CJODE_SERVER_HOST?: string;
}

export interface RequiredEnvCheck {
  key: keyof EnvironmentConfig;
  description: string;
  required: boolean;
}

export const ENV_SCHEMA: RequiredEnvCheck[] = [
  {
    key: "ANTHROPIC_API_KEY",
    description: "Anthropic Claude API key",
    required: true,
  },
  {
    key: "OPENAI_API_KEY",
    description: "OpenAI API key",
    required: false,
  },
  {
    key: "CJODE_DEFAULT_MODEL",
    description: "Default model to use (e.g., claude-3-sonnet)",
    required: false,
  },
  {
    key: "CJODE_SERVER_PORT",
    description: "Port for the Cjode server",
    required: false,
  },
  {
    key: "CJODE_SERVER_HOST",
    description: "Host for the Cjode server",
    required: false,
  },
];

/**
 * Detect if we're running in development mode
 * ONLY checks NODE_ENV environment variable
 */
function isDevMode(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Load environment variables with clear separation:
 *
 * Development Mode (in monorepo):
 * - ONLY loads from local .env file
 * - Ignores system env vars and global config
 *
 * Production Mode (installed globally or outside monorepo):
 * - System environment variables (highest priority)
 * - Global XDG config file (~/.config/cjode/.env)
 * - NEVER reads local .env files
 */
export function loadEnvironment(): EnvironmentConfig {
  const env: EnvironmentConfig = {};
  const devMode = isDevMode();

  if (devMode) {
    // Development mode: ONLY use local .env file
    // Look for .env in project root (find by walking up to find package.json with "private": true)
    let envPath = ".env";
    let searchDir = process.cwd();

    // Walk up directories to find the monorepo root
    while (searchDir !== "/" && searchDir !== ".") {
      const packageJsonPath = join(searchDir, "package.json");
      const envFilePath = join(searchDir, ".env");

      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
          // Found monorepo root (has "private": true and workspace config)
          if (
            packageJson.private &&
            (packageJson.workspaces || existsSync(join(searchDir, "pnpm-workspace.yaml")))
          ) {
            envPath = envFilePath;
            break;
          }
        } catch (error) {
          // Invalid package.json, continue searching
        }
      }

      searchDir = dirname(searchDir);
    }

    try {
      if (existsSync(envPath)) {
        const localEnvContent = readFileSync(envPath, "utf-8");
        const localEnv = parseEnvFile(localEnvContent);
        Object.assign(env, localEnv);
        console.log(`🔧 Development mode: using local .env file (${envPath})`);
      } else {
        console.warn(
          `⚠️  Development mode but no .env file found. Copy .env.example to .env in project root`,
        );
      }
    } catch (error) {
      console.error(`Error loading local .env file: ${error}`);
    }
  } else {
    // Production mode: system env vars + global config only

    // 1. Load from user's global .env file first (fallback)
    try {
      if (existsSync(configFiles.env)) {
        const globalEnvContent = readFileSync(configFiles.env, "utf-8");
        const globalEnv = parseEnvFile(globalEnvContent);
        Object.assign(env, globalEnv);
      }
    } catch (error) {
      console.warn(`Warning: Could not load global .env file: ${error}`);
    }

    // 2. Load from system environment (highest priority in production)
    for (const { key } of ENV_SCHEMA) {
      const value = process.env[key];
      if (value) {
        env[key] = value;
      }
    }
  }

  return env;
}

/**
 * Parse .env file content into key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip empty lines and comments
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
 * Set an environment variable in the user's global .env file
 */
export function setEnvironmentVariable(key: keyof EnvironmentConfig, value: string): void {
  // Ensure config directory exists
  const configDir = dirname(configFiles.env);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Load existing .env content
  let envContent = "";
  if (existsSync(configFiles.env)) {
    envContent = readFileSync(configFiles.env, "utf-8");
  }

  // Parse existing variables
  const lines = envContent.split("\n");
  let found = false;

  // Update existing key or add new one
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith(`${key}=`)) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    lines.push(`${key}=${value}`);
  }

  // Write back to file
  const newContent = lines.join("\n").trim() + "\n";
  writeFileSync(configFiles.env, newContent);
}

/**
 * Remove an environment variable from the user's global .env file
 */
export function removeEnvironmentVariable(key: keyof EnvironmentConfig): void {
  if (!existsSync(configFiles.env)) {
    return;
  }

  const envContent = readFileSync(configFiles.env, "utf-8");
  const lines = envContent.split("\n");

  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith(`${key}=`);
  });

  const newContent = filteredLines.join("\n").trim() + "\n";
  writeFileSync(configFiles.env, newContent);
}

/**
 * Validate environment configuration and return missing required variables
 */
export function validateEnvironment(env: EnvironmentConfig): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const { key, required } of ENV_SCHEMA) {
    if (required && !env[key]) {
      missing.push(key);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get environment variable with fallback to default
 */
export function getEnvVar(key: keyof EnvironmentConfig, defaultValue?: string): string | undefined {
  const env = loadEnvironment();
  return env[key] || defaultValue;
}
