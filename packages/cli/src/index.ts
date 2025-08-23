#!/usr/bin/env node

import { program } from 'commander';
import { chatCommand } from './commands/chat.js';
import { serverCommand } from './commands/server.js';

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

program.parse();
