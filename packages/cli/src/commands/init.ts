import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";

import chalk from "chalk";
import { configFiles } from "@cjode/config";

interface InitOptions {
  overwrite?: boolean;
}

interface ConfigInput {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY?: string;
  CJODE_DEFAULT_MODEL?: string;
  CJODE_SERVER_PORT?: string;
  CJODE_SERVER_HOST?: string;
}

function askQuestion(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = defaultValue ? `${question} (${chalk.gray(defaultValue)}): ` : `${question}: `;

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

async function validateApiKey(key: string, service: "anthropic" | "openai"): Promise<boolean> {
  if (!key) return true; // Optional for OpenAI

  try {
    console.log(`${chalk.blue("ℹ")} Validating ${service} API key...`);

    // Basic format validation
    if (service === "anthropic") {
      if (!key.startsWith("sk-ant-")) {
        console.log(
          `${chalk.yellow("⚠")} Warning: Anthropic API keys typically start with 'sk-ant-'`,
        );
        return false;
      }
    } else if (service === "openai") {
      if (!key.startsWith("sk-") || key.startsWith("sk-ant-")) {
        console.log(
          `${chalk.yellow("⚠")} Warning: OpenAI API keys typically start with 'sk-' (but not 'sk-ant-')`,
        );
        return false;
      }
    }

    // TODO: Add actual API validation once we have proper error handling
    console.log(`${chalk.green("✓")} ${service} API key format looks valid`);
    return true;
  } catch (error) {
    console.log(`${chalk.yellow("⚠")} Could not validate ${service} API key: ${error}`);
    return true; // Don't fail on validation errors
  }
}

export async function initCommand(options: InitOptions = {}) {
  console.log(chalk.bold.blue("🚀 Welcome to Cjode!"));
  console.log("Let's set up your environment configuration.");
  console.log();

  // Check if config already exists
  if (existsSync(configFiles.env) && !options.overwrite) {
    console.log(`${chalk.yellow("⚠")} Configuration file already exists at: ${configFiles.env}`);
    console.log(`Use ${chalk.cyan("cjode init --overwrite")} to recreate it.`);
    return;
  }

  const config: ConfigInput = {
    ANTHROPIC_API_KEY: "",
  };

  try {
    // Anthropic API Key (required)
    console.log(chalk.bold("\n📋 Required Configuration"));
    console.log("Anthropic Claude API key is required for the AI assistant.");
    console.log(`Get your key at: ${chalk.cyan("https://console.anthropic.com/")}`);

    while (!config.ANTHROPIC_API_KEY) {
      config.ANTHROPIC_API_KEY = await askQuestion("Enter your Anthropic API key");
      if (!config.ANTHROPIC_API_KEY) {
        console.log(`${chalk.red("✗")} Anthropic API key is required.`);
        continue;
      }

      const isValid = await validateApiKey(config.ANTHROPIC_API_KEY, "anthropic");
      if (!isValid) {
        const retry = await askQuestion("Would you like to try again? (y/N)", "n");
        if (retry.toLowerCase() !== "y") {
          console.log(`${chalk.yellow("⚠")} Proceeding with current key...`);
          break;
        }
        config.ANTHROPIC_API_KEY = "";
      }
    }

    // Optional configurations
    console.log(chalk.bold("\n⚙️  Optional Configuration"));
    console.log("You can press Enter to skip these or configure them later.");

    config.OPENAI_API_KEY = await askQuestion("OpenAI API key (optional)");
    if (config.OPENAI_API_KEY) {
      await validateApiKey(config.OPENAI_API_KEY, "openai");
    }

    config.CJODE_DEFAULT_MODEL = await askQuestion("Default AI model", "claude-3-sonnet-20241022");
    config.CJODE_SERVER_PORT = await askQuestion("Server port", "3001");
    config.CJODE_SERVER_HOST = await askQuestion("Server host", "127.0.0.1");

    // Create config directory
    const configDir = dirname(configFiles.env);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Generate .env content
    const envContent = Object.entries(config)
      .filter(([_, value]) => value && value.trim())
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    // Write config file
    writeFileSync(configFiles.env, envContent + "\n");

    console.log();
    console.log(`${chalk.green("✅ Configuration saved to:")} ${configFiles.env}`);
    console.log();
    console.log(chalk.bold("🎉 Setup complete!"));
    console.log();
    console.log("You can now use:");
    console.log(`  ${chalk.cyan("cjode server")} - Start the server`);
    console.log(`  ${chalk.cyan("cjode chat")} - Start interactive chat`);
    console.log();
    console.log("To modify settings later:");
    console.log(`  ${chalk.cyan("cjode env --list")} - View current settings`);
    console.log(`  ${chalk.cyan("cjode env --set KEY")} - Update specific setting`);
    console.log(`  ${chalk.cyan("cjode init --overwrite")} - Re-run this setup`);
  } catch (error) {
    console.error(`${chalk.red("✗")} Setup failed:`, error);
    process.exit(1);
  }
}
