import * as readline from "node:readline/promises";

import chalk from "chalk";
import {
  loadEnvironment,
  setEnvironmentVariable,
  removeEnvironmentVariable,
  validateEnvironment,
  ENV_SCHEMA,
  type EnvironmentConfig,
  type RequiredEnvCheck,
} from "@cjode/state";

interface EnvOptions {
  list?: boolean;
  set?: string;
  unset?: string;
  validate?: boolean;
  setup?: boolean;
}

export async function envCommand(options: EnvOptions) {
  // Load current environment
  const env = loadEnvironment();

  if (options.list) {
    await listEnvironmentVariables(env);
  } else if (options.set) {
    await setEnvironmentVariableInteractive(options.set);
  } else if (options.unset) {
    await unsetEnvironmentVariableInteractive(options.unset);
  } else if (options.validate) {
    await validateEnvironmentVariables(env);
  } else if (options.setup) {
    await setupEnvironment();
  } else {
    // Default: show status
    await showEnvironmentStatus(env);
  }
}

async function showEnvironmentStatus(env: EnvironmentConfig) {
  console.log(chalk.blue("🔧 Cjode Environment Configuration\n"));

  const validation = validateEnvironment(env);

  if (validation.valid) {
    console.log(chalk.green("✅ Environment is properly configured\n"));
  } else {
    console.log(chalk.yellow("⚠️  Some required environment variables are missing:\n"));
    for (const missing of validation.missing) {
      const schema = ENV_SCHEMA.find((s: RequiredEnvCheck) => s.key === missing);
      console.log(chalk.red(`  ❌ ${missing}: ${schema?.description || "Required variable"}`));
    }
    console.log(chalk.gray("\nRun `cjode env --setup` to configure missing variables.\n"));
  }

  // Show configured variables (masked for security)
  console.log(chalk.blue("Configured variables:"));
  for (const { key, description, required } of ENV_SCHEMA as RequiredEnvCheck[]) {
    const value = env[key];
    const status = value
      ? chalk.green("✓ Set")
      : required
        ? chalk.red("✗ Missing")
        : chalk.gray("○ Optional");

    const maskedValue = value ? maskSecretValue(value) : chalk.gray("(not set)");
    console.log(`  ${status} ${key}: ${maskedValue}`);
    console.log(chalk.gray(`      ${description}`));
  }

  console.log(chalk.gray("\nUse `cjode env --help` for more options."));
}

async function listEnvironmentVariables(env: EnvironmentConfig) {
  console.log(chalk.blue("Environment Variables:\n"));

  for (const { key, description, required } of ENV_SCHEMA as RequiredEnvCheck[]) {
    const value = env[key];
    const requiredLabel = required ? chalk.red("[REQUIRED]") : chalk.gray("[OPTIONAL]");

    console.log(`${key} ${requiredLabel}`);
    console.log(`  Description: ${description}`);
    console.log(`  Value: ${value ? maskSecretValue(value) : chalk.gray("(not set)")}`);
    console.log();
  }
}

async function setEnvironmentVariableInteractive(key: string) {
  const schema = ENV_SCHEMA.find((s: RequiredEnvCheck) => s.key === key);
  if (!schema) {
    console.error(chalk.red(`❌ Unknown environment variable: ${key}`));
    console.log("Available variables:", ENV_SCHEMA.map((s: RequiredEnvCheck) => s.key).join(", "));
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log(chalk.blue(`Setting ${key}`));
    console.log(chalk.gray(`Description: ${schema.description}`));
    console.log();

    const value = await rl.question(`Enter value for ${key}: `);

    if (!value.trim()) {
      console.log(chalk.yellow("No value entered. Variable not set."));
      return;
    }

    setEnvironmentVariable(schema.key, value.trim());
    console.log(chalk.green(`✅ Set ${key} = ${maskSecretValue(value.trim())}`));
    console.log(chalk.gray(`Saved to: ~/.config/cjode/.env`));
  } finally {
    rl.close();
  }
}

async function unsetEnvironmentVariableInteractive(key: string) {
  const schema = ENV_SCHEMA.find((s: RequiredEnvCheck) => s.key === key);
  if (!schema) {
    console.error(chalk.red(`❌ Unknown environment variable: ${key}`));
    return;
  }

  removeEnvironmentVariable(schema.key);
  console.log(chalk.green(`✅ Removed ${key} from configuration`));
}

async function validateEnvironmentVariables(env: EnvironmentConfig) {
  console.log(chalk.blue("🔍 Validating Environment Configuration\n"));

  const validation = validateEnvironment(env);

  if (validation.valid) {
    console.log(chalk.green("✅ All required environment variables are configured!"));
  } else {
    console.log(chalk.red("❌ Validation failed. Missing required variables:\n"));

    for (const missing of validation.missing) {
      const schema = ENV_SCHEMA.find((s: RequiredEnvCheck) => s.key === missing);
      console.log(`  • ${missing}: ${schema?.description || "Required variable"}`);
    }

    console.log(chalk.yellow("\nRun `cjode env --setup` to configure missing variables."));
    process.exit(1);
  }
}

async function setupEnvironment() {
  console.log(chalk.blue("🚀 Cjode Environment Setup\n"));
  console.log("This will help you configure required environment variables.\n");

  const env = loadEnvironment();
  const validation = validateEnvironment(env);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // Configure missing required variables
    for (const missingKey of validation.missing) {
      const schema = ENV_SCHEMA.find((s: RequiredEnvCheck) => s.key === missingKey);
      if (!schema) continue;

      console.log(chalk.yellow(`⚠️  ${missingKey} is required but not set`));
      console.log(chalk.gray(`   ${schema.description}`));
      console.log();

      const value = await rl.question(`Enter your ${missingKey}: `);

      if (value.trim()) {
        setEnvironmentVariable(schema.key, value.trim());
        console.log(chalk.green(`✅ Set ${missingKey}`));
      } else {
        console.log(chalk.red(`❌ Skipped ${missingKey}`));
      }
      console.log();
    }

    // Ask about optional variables
    const optionalVars = ENV_SCHEMA.filter((s: RequiredEnvCheck) => !s.required && !env[s.key]);

    if (optionalVars.length > 0) {
      const configureOptional = await rl.question(
        chalk.blue("Would you like to configure optional variables? (y/n): "),
      );

      if (configureOptional.toLowerCase().startsWith("y")) {
        for (const schema of optionalVars) {
          console.log(chalk.blue(`${schema.key} (optional)`));
          console.log(chalk.gray(`   ${schema.description}`));

          const value = await rl.question(`Enter value (or press Enter to skip): `);

          if (value.trim()) {
            setEnvironmentVariable(schema.key, value.trim());
            console.log(chalk.green(`✅ Set ${schema.key}`));
          }
          console.log();
        }
      }
    }

    console.log(chalk.green("🎉 Environment setup complete!"));
    console.log(chalk.gray("Configuration saved to: ~/.config/cjode/.env"));
  } finally {
    rl.close();
  }
}

function maskSecretValue(value: string): string {
  if (value.length <= 8) {
    return "***";
  }
  const start = value.slice(0, 4);
  const end = value.slice(-4);
  return `${start}${"*".repeat(value.length - 8)}${end}`;
}
