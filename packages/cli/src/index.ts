#!/usr/bin/env node

import 'dotenv/config';
import { program } from 'commander';
import { chatCommand } from './commands/chat.js';
import { serverCommand } from './commands/server.js';
import { envCommand } from './commands/env.js';

program
  .name('cjode')
  .description('Agentic coding CLI')
  .version('0.1.0');

program
  .command('chat')
  .description('Start interactive chat session')
  .option('--server <url>', 'Server URL', 'http://127.0.0.1:3001')
  .action(chatCommand);

program
  .command('server')
  .description('Server management')
  .option('--port <port>', 'Port to run server on', '3001')
  .action(serverCommand);

program
  .command('env')
  .description('Environment variable management')
  .option('--list', 'List all environment variables')
  .option('--set <key>', 'Set an environment variable')
  .option('--unset <key>', 'Remove an environment variable')
  .option('--validate', 'Validate environment configuration')
  .option('--setup', 'Interactive setup for environment variables')
  .action(envCommand);

program.parse();
