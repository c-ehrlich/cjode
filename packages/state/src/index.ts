// State package entry point - everything consolidated in one file to fix DTS generation
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// === Configuration Paths ===
const platform = process.platform;
const home = homedir();

export const configPaths = {
  config:
    platform === "win32"
      ? join(home, "AppData", "Roaming", "cjode")
      : join(home, ".config", "cjode"),
  data:
    platform === "win32"
      ? join(home, "AppData", "Local", "cjode")
      : join(home, ".local", "share", "cjode"),
  cache:
    platform === "win32"
      ? join(home, "AppData", "Local", "cjode", "cache")
      : join(home, ".cache", "cjode"),
};

export const configFiles = {
  env: join(configPaths.config, ".env"),
  settings: join(configPaths.config, "settings.json"),
  database: join(configPaths.data, "cjode.db"),
};

// === Environment Configuration ===
// TODO: use zod, infer EnvironmentConfig from envSchema
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

function isDevMode(): boolean {
  return process.env.NODE_ENV === "development";
}

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

export function loadEnvironment(): EnvironmentConfig {
  const env: EnvironmentConfig = {};
  const devMode = isDevMode();

  if (devMode) {
    // Development mode: ONLY use local .env file
    let envPath = ".env";
    let searchDir = process.cwd();

    // Walk up directories to find the monorepo root
    while (searchDir !== "/" && searchDir !== ".") {
      const packageJsonPath = join(searchDir, "package.json");
      const envFilePath = join(searchDir, ".env");

      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
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

    try {
      if (existsSync(configFiles.env)) {
        const globalEnvContent = readFileSync(configFiles.env, "utf-8");
        const globalEnv = parseEnvFile(globalEnvContent);
        Object.assign(env, globalEnv);
      }
    } catch (error) {
      console.warn(`Warning: Could not load global .env file: ${error}`);
    }

    for (const { key } of ENV_SCHEMA) {
      const value = process.env[key];
      if (value) {
        env[key] = value;
      }
    }
  }

  return env;
}

export function setEnvironmentVariable(key: keyof EnvironmentConfig, value: string): void {
  const configDir = dirname(configFiles.env);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  let envContent = "";
  if (existsSync(configFiles.env)) {
    envContent = readFileSync(configFiles.env, "utf-8");
  }

  const lines = envContent.split("\n");
  let found = false;

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

  const newContent = lines.join("\n").trim() + "\n";
  writeFileSync(configFiles.env, newContent);
}

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

export function getEnvVar(key: keyof EnvironmentConfig, defaultValue?: string): string | undefined {
  const env = loadEnvironment();
  return env[key] || defaultValue;
}

// Legacy exports
export const version = "0.1.0";
export const hello = () => "Hello from @cjode/state";
