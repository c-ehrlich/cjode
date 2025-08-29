import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

import chalk from "chalk";
import { getConfig } from "@cjode/config";

interface StartOptions {
  port?: string;
  host?: string;
}

export async function startCommand(options: StartOptions = {}) {
  const config = getConfig();

  console.log(chalk.bold.blue("🚀 Starting Cjode in production mode..."));
  console.log();

  // Validate configuration
  if (!config.ANTHROPIC_API_KEY) {
    console.error(chalk.red("❌ No API key configured!"));
    console.log(`Run ${chalk.cyan("cjode init")} to set up your configuration.`);
    process.exit(1);
  }

  const port = options.port || config.CJODE_SERVER_PORT.toString();
  const host = options.host || config.CJODE_SERVER_HOST;
  const serverUrl = `http://${host}:${port}`;

  console.log(`📡 Starting server on ${chalk.cyan(serverUrl)}...`);

  // Find the server binary path
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  // Try different possible locations for the server package
  const possibleServerPaths = [
    // For global installs: server is in CLI's node_modules
    join(currentDir, "../node_modules/@c-ehrlich/cjode-server/dist/index.js"),
    // For local installs: server is at same level as CLI
    join(currentDir, "../../cjode-server/dist/index.js"),
  ];

  let serverPath: string | null = null;
  for (const path of possibleServerPaths) {
    try {
      if (existsSync(path)) {
        serverPath = path;
        break;
      }
    } catch {
      // Continue to next path
    }
  }

  if (!serverPath) {
    console.error(
      chalk.red(
        "❌ Could not find cjode-server package. Please ensure @c-ehrlich/cjode-server is installed.",
      ),
    );
    process.exit(1);
  }

  // Start server using binary
  const serverProcess = spawn("node", [serverPath, "--port", port, "--host", host], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      CJODE_SERVER_PORT: port,
      CJODE_SERVER_HOST: host,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let serverReady = false;

  // Handle server output
  if (serverProcess.stdout) {
    serverProcess.stdout.on("data", (data) => {
      const output = data.toString();
      if (output.includes("Cjode server running")) {
        serverReady = true;
        console.log(chalk.green("✅ Server started successfully"));
        console.log();
        startClient();
      }
      // Only show server errors, not all logs
      if (output.includes("ERROR") || output.includes("WARN")) {
        console.log(chalk.gray("[server]"), output.trim());
      }
    });
  }

  if (serverProcess.stderr) {
    serverProcess.stderr.on("data", (data) => {
      console.error(chalk.red("[server error]"), data.toString().trim());
    });
  }

  serverProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(chalk.red(`❌ Server exited with code ${code}`));
      process.exit(1);
    }
  });

  // Start client after server is ready
  function startClient() {
    console.log(chalk.bold("💬 Starting chat client..."));
    console.log(chalk.gray("Press Ctrl+C to exit"));
    console.log("─".repeat(50));

    const clientProcess = spawn("cjode", ["chat", "--server", serverUrl], {
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      stdio: "inherit",
    });

    // Handle client exit
    clientProcess.on("exit", (code) => {
      console.log();
      console.log(chalk.yellow("📡 Shutting down server..."));

      // Gracefully shutdown server
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill("SIGTERM");

        // Force kill after timeout
        setTimeout(() => {
          if (!serverProcess.killed) {
            console.log(chalk.yellow("⚠️  Force killing server..."));
            serverProcess.kill("SIGKILL");
          }
        }, 5000);
      }

      console.log(chalk.green("✅ Shutdown complete"));
      process.exit(code || 0);
    });
  }

  // Handle process signals
  process.on("SIGINT", () => {
    console.log();
    console.log(chalk.yellow("📡 Shutting down..."));

    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGTERM");
    }

    process.exit(0);
  });

  process.on("SIGTERM", () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGTERM");
    }
    process.exit(0);
  });

  // Wait for server startup
  setTimeout(() => {
    if (!serverReady) {
      console.error(chalk.red("❌ Server failed to start within 10 seconds"));
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill("SIGKILL");
      }
      process.exit(1);
    }
  }, 10000);
}
