import Fastify from 'fastify';
import cors from '@fastify/cors';

const server = Fastify({
  logger: true,
});

// Register CORS
await server.register(cors, {
  origin: true,
});

// Types
interface ChatRequest {
  message: string;
  conversationId?: string;
}

interface ChatResponse {
  response: string;
  conversationId: string;
}

// Health check endpoint
server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Mock streaming function that outputs 'foo bar baz' with 1s delays
async function* createMockStream(message: string): AsyncGenerator<string> {
  const words = ['foo', 'bar', 'baz'];
  
  for (const word of words) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    yield word;
  }
}

// Chat endpoint with SSE streaming support
server.post<{
  Body: ChatRequest;
  Reply: ChatResponse;
}>('/chat', async (request, reply) => {
  const { message, conversationId = crypto.randomUUID() } = request.body;
  const acceptHeader = request.headers.accept || '';

  server.log.info(`Received message: "${message}" for conversation: ${conversationId}`);
  server.log.info(`Accept header: "${acceptHeader}"`);

  // Check if client wants streaming response
  if (acceptHeader.includes('text/event-stream')) {
    // Stream response using SSE
    reply
      .header('Content-Type', 'text/event-stream')
      .header('Cache-Control', 'no-cache')
      .header('Connection', 'keep-alive')
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Headers', 'Cache-Control');

    // Send initial metadata
    reply.raw.write(`event: start\ndata: ${JSON.stringify({ conversationId })}\n\n`);

    try {
      // Stream the mock response
      for await (const word of createMockStream(message)) {
        const chunk = { content: word, type: 'text' };
        reply.raw.write(`event: token\ndata: ${JSON.stringify(chunk)}\n\n`);
        server.log.info(`Streamed token: "${word}"`);
      }

      // Send completion event
      reply.raw.write(`event: done\ndata: ${JSON.stringify({ conversationId })}\n\n`);
      server.log.info(`Completed streaming for conversation: ${conversationId}`);
      
    } catch (error) {
      server.log.error(`Streaming error: ${error}`);
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
    }

    reply.raw.end();
    return;
  }

  // Fallback to regular JSON response
  await new Promise(resolve => setTimeout(resolve, 1000));

  const response = {
    response: 'pong',
    conversationId,
  };

  server.log.info(`Sending response: "${response.response}"`);
  return response;
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    const host = process.env.HOST || '127.0.0.1';

    await server.listen({ port, host });
    console.log(`🚀 Cjode server running on http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  await server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

start();
