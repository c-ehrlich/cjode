#!/usr/bin/env node

import { program } from "commander";

import { chatCommand } from "./commands/chat.js";
import { serverCommand } from "./commands/server.js";
import { envCommand } from "./commands/env.js";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";
import { evalCommand } from "./commands/eval.js";

program.name("cjode").description("Agentic coding CLI").version("0.1.0");

// Default action - start full application (server + client)
program
  .description("Start Cjode (server + client)")
  .option("--port <port>", "Server port")
  .option("--host <host>", "Server host")
  .action(startCommand);

program
  .command("init")
  .description("Initialize cjode configuration")
  .option("--overwrite", "Overwrite existing configuration")
  .action(initCommand);

program
  .command("chat")
  .description("Start chat client only")
  .option("--server <url>", "Server URL", "http://127.0.0.1:3001")
  .action(chatCommand);

program
  .command("server")
  .description("Server management")
  .option("--port <port>", "Port to run server on", "3001")
  .action(serverCommand);

program
  .command("env")
  .description("Environment variable management")
  .option("--list", "List all environment variables")
  .option("--set <key>", "Set an environment variable")
  .option("--unset <key>", "Remove an environment variable")
  .option("--validate", "Validate environment configuration")
  .option("--setup", "Interactive setup for environment variables")
  .action(envCommand);

program
  .command("eval")
  .description("Evaluate agent on a coding task (for LiveSWEBench)")
  .argument("<prompt>", "Task prompt to give the agent")
  .option("--repo <path>", "Repository path to work in", process.cwd())
  .option("--output <path>", "Output file for results (default: stdout)")
  .action(evalCommand);

program.parse();
