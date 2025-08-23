import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { configFiles, configPaths } from '../config/paths.js';

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
    key: 'ANTHROPIC_API_KEY',
    description: 'Anthropic Claude API key',
    required: true,
  },
  {
    key: 'OPENAI_API_KEY', 
    description: 'OpenAI API key',
    required: false,
  },
  {
    key: 'CJODE_DEFAULT_MODEL',
    description: 'Default model to use (e.g., claude-3-sonnet)',
    required: false,
  },
  {
    key: 'CJODE_SERVER_PORT',
    description: 'Port for the Cjode server',
    required: false,
  },
  {
    key: 'CJODE_SERVER_HOST',
    description: 'Host for the Cjode server',
    required: false,
  },
];

/**
 * Detect if we're running in development mode
 */
function isDevMode(): boolean {
  // Check NODE_ENV
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  // Check if we're in the monorepo (presence of turbo.json and pnpm-workspace.yaml)
  if (existsSync('turbo.json') && existsSync('pnpm-workspace.yaml')) {
    return true;
  }
  
  // Check if we're running from packages directory structure (development context)
  if (existsSync('packages') && existsSync('apps')) {
    return true;
  }
  
  return false;
}

/**
 * Load environment variables from multiple sources:
 * 
 * Development Mode:
 * 1. System environment variables
 * 2. Project-local .env file (PRIORITY)
 * 3. User's global .env file (fallback)
 * 
 * Production Mode:
 * 1. System environment variables  
 * 2. User's global .env file (ONLY)
 */
export function loadEnvironment(): EnvironmentConfig {
  const env: EnvironmentConfig = {};
  const devMode = isDevMode();

  // 1. Load from system environment (always first)
  for (const { key } of ENV_SCHEMA) {
    const value = process.env[key];
    if (value) {
      env[key] = value;
    }
  }

  if (devMode) {
    // Development mode: local .env takes priority over global
    
    // 2a. Load from user's global .env file first (as fallback)
    try {
      if (existsSync(configFiles.env)) {
        const globalEnvContent = readFileSync(configFiles.env, 'utf-8');
        const globalEnv = parseEnvFile(globalEnvContent);
        Object.assign(env, globalEnv);
      }
    } catch (error) {
      console.warn(`Warning: Could not load global .env file: ${error}`);
    }

    // 3a. Load from project-local .env file (overrides global)
    try {
      if (existsSync('.env')) {
        const localEnvContent = readFileSync('.env', 'utf-8');
        const localEnv = parseEnvFile(localEnvContent);
        Object.assign(env, localEnv);
        console.log('🔧 Loaded local .env file (development mode)');
      }
    } catch (error) {
      // Silently ignore - project .env is optional
    }
  } else {
    // Production mode: only global .env file
    
    // 2b. Load from user's global .env file only
    try {
      if (existsSync(configFiles.env)) {
        const globalEnvContent = readFileSync(configFiles.env, 'utf-8');
        const globalEnv = parseEnvFile(globalEnvContent);
        Object.assign(env, globalEnv);
      }
    } catch (error) {
      console.warn(`Warning: Could not load global .env file: ${error}`);
    }
  }

  return env;
}

/**
 * Parse .env file content into key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }
    
    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
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
  let envContent = '';
  if (existsSync(configFiles.env)) {
    envContent = readFileSync(configFiles.env, 'utf-8');
  }

  // Parse existing variables
  const lines = envContent.split('\n');
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
  const newContent = lines.join('\n').trim() + '\n';
  writeFileSync(configFiles.env, newContent);
}

/**
 * Remove an environment variable from the user's global .env file
 */
export function removeEnvironmentVariable(key: keyof EnvironmentConfig): void {
  if (!existsSync(configFiles.env)) {
    return;
  }

  const envContent = readFileSync(configFiles.env, 'utf-8');
  const lines = envContent.split('\n');
  
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    return !trimmed.startsWith(`${key}=`);
  });

  const newContent = filteredLines.join('\n').trim() + '\n';
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
