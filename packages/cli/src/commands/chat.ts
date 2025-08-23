import * as readline from 'node:readline/promises';
import chalk from 'chalk';

interface ChatOptions {
  server: string;
}

export async function chatCommand(options: ChatOptions) {
  console.log(chalk.blue('🤖 Cjode Agent (Ctrl+C to exit)'));
  console.log(chalk.gray(`Connected to: ${options.server}`));
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const conversationId = crypto.randomUUID();

  try {
    while (true) {
      const message = await rl.question(chalk.cyan('You: '));
      
      if (!message.trim()) {
        continue;
      }

      // Send streaming request to server
      process.stdout.write(chalk.yellow('Agent: '));
      
      try {
        const response = await fetch(`${options.server}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({
            message: message.trim(),
            conversationId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        // Handle streaming response
        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) break;
              
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    
                    if (data.content) {
                      // Stream the content without adding spaces
                      process.stdout.write(data.content);
                    }
                  } catch (parseError) {
                    // Ignore malformed JSON in stream
                  }
                }
                if (line.startsWith('event: done')) {
                  break;
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
        }
        
        console.log(); // New line after streaming
        console.log();
        
      } catch (error) {
        process.stdout.write('\r' + ' '.repeat(50) + '\r');
        console.log(chalk.red('❌ Error: ') + (error instanceof Error ? error.message : 'Unknown error'));
        console.log(chalk.gray('Make sure the server is running with: cjode server'));
        console.log();
      }
    }
  } catch (error) {
    if ((error as any).code === 'SIGINT') {
      console.log('\n👋 Goodbye!');
    } else {
      console.error('Error:', error);
    }
  } finally {
    rl.close();
  }
}
