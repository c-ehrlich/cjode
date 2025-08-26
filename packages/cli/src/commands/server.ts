import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import chalk from "chalk";

interface ServerOptions {
  port: string;
}

export async function serverCommand(options: ServerOptions) {
  console.log(chalk.blue("🚀 Starting Cjode server..."));

  // Get the path to the server package
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  // From packages/cli/dist, go up to monorepo root, then to apps/server
  const serverPath = join(currentDir, "../../../apps/server");

  console.log(chalk.gray(`Current file: ${currentFile}`));
  console.log(chalk.gray(`Current dir: ${currentDir}`));
  console.log(chalk.gray(`Server path: ${serverPath}`));

  // Check if server is built
  try {
    await import(join(serverPath, "dist/index.js"));
  } catch {
    console.log(chalk.yellow("⚠️  Server not built, building now..."));

    const buildProcess = spawn("pnpm", ["build", "--filter=@c-ehrlich/cjode-server"], {
      stdio: "inherit",
      shell: true,
    });

    await new Promise<void>((resolve, reject) => {
      buildProcess.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });
    });
  }

  // Start the server
  const serverProcess = spawn("node", [join(serverPath, "dist/index.js")], {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      PORT: options.port,
    },
  });

  // Handle server process events
  serverProcess.on("error", (error) => {
    console.error(chalk.red("❌ Failed to start server:"), error);
    process.exit(1);
  });

  serverProcess.on("close", (code) => {
    console.log(chalk.yellow(`Server exited with code ${code}`));
    process.exit(code || 0);
  });

  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    console.log(chalk.yellow("\n📶 Shutting down server..."));
    serverProcess.kill("SIGTERM");
  });

  process.on("SIGINT", () => {
    console.log(chalk.yellow("\n📶 Shutting down server..."));
    serverProcess.kill("SIGINT");
  });
}
