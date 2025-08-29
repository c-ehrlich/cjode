#!/usr/bin/env node

import Fastify from "fastify";
import cors from "@fastify/cors";
import { stepCountIs, streamText } from "ai";
import { program } from "commander";
import { getConfig } from "@cjode/config";

import { readTool } from "./tools/read.tool";
import { listDirTool } from "./tools/list-dir.tool";
import { writeFileTool } from "./tools/write-file.tool";
import { bashTool } from "./tools/bash.tool";
import { Anthropic } from "./models/anthropic";

// Parse CLI arguments
program
  .option("--port <port>", "Server port", process.env.PORT || "3001")
  .option("--host <host>", "Server host", process.env.HOST || "localhost")
  .parse();

const options = program.opts();

// Load validated configuration
const config = getConfig();

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

interface ChatErrorResponse {
  error: string;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

// In-memory conversation storage
const conversations = new Map<string, Message[]>();

// Health check endpoint
server.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Debug endpoint to view conversation info
server.get("/conversations", async () => {
  const conversationSummary = Array.from(conversations.entries()).map(([id, messages]) => ({
    conversationId: id,
    messageCount: messages.length,
    lastMessage: messages[messages.length - 1]?.content.slice(0, 100) + "..." || "No messages",
  }));

  return {
    totalConversations: conversations.size,
    conversations: conversationSummary,
  };
});

// Get specific conversation
server.get<{
  Params: { id: string };
}>("/conversations/:id", async (request, reply) => {
  const { id } = request.params;
  const conversation = conversations.get(id);

  if (!conversation) {
    reply.status(404).send({ error: "Conversation not found" });
    return;
  }

  return {
    conversationId: id,
    messageCount: conversation.length,
    messages: conversation,
  };
});

// Chat endpoint with AI streaming support
server.post<{
  Body: ChatRequest;
  Reply: ChatResponse | ChatErrorResponse;
}>("/chat", async (request, reply) => {
  const { message, conversationId = crypto.randomUUID() } = request.body;
  const acceptHeader = request.headers.accept || "";

  server.log.info(`Received message: "${message}" for conversation: ${conversationId}`);
  server.log.info(`Accept header: "${acceptHeader}"`);

  // Validate API key
  if (!config.ANTHROPIC_API_KEY) {
    reply.status(500).send({
      error: "ANTHROPIC_API_KEY not configured. Run `cjode init` to configure.",
    });
    return;
  }

  // Get or create conversation history
  let conversationHistory = conversations.get(conversationId);
  if (!conversationHistory) {
    conversationHistory = [
      {
        role: "system",
        content:
          "You are a helpful coding assistant. You help users with programming tasks, code review, debugging, and software development questions. Be concise but thorough in your responses.",
      },
    ];
    conversations.set(conversationId, conversationHistory);
  }

  // Add user message to history
  conversationHistory.push({
    role: "user",
    content: message,
  });

  type StreamTextArgs = Parameters<typeof streamText>[0];
  const args: StreamTextArgs = {
    model: Anthropic.ClaudeSonnet4,
    messages: conversationHistory,
    maxOutputTokens: 32000,
    stopWhen: stepCountIs(100),
    tools: {
      bashTool,
      listDirTool,
      readTool,
      writeFileTool,
    },
  };

  // Check if client wants streaming response
  if (acceptHeader.includes("text/event-stream")) {
    // Stream response using SSE
    reply
      .header("Content-Type", "text/event-stream")
      .header("Cache-Control", "no-cache")
      .header("Connection", "keep-alive")
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Headers", "Cache-Control");

    // Send initial metadata
    reply.raw.write(`event: start\ndata: ${JSON.stringify({ conversationId })}\n\n`);

    try {
      // Stream the AI response
      const result = streamText(args);

      let fullResponse = "";

      for await (const chunk of result.textStream) {
        fullResponse += chunk;

        const chunkData = { content: chunk, type: "text" };
        reply.raw.write(`event: token\ndata: ${JSON.stringify(chunkData)}\n\n`);

        // Log first few characters to avoid spam
        if (fullResponse.length <= 50) {
          server.log.info(`Streamed token: "${chunk}"`);
        }
      }

      // Add assistant response to conversation history
      conversationHistory.push({
        role: "assistant",
        content: fullResponse,
      });

      // Send completion event
      reply.raw.write(
        `event: done\ndata: ${JSON.stringify({ conversationId, messageCount: conversationHistory.length })}\n\n`,
      );
      server.log.info(
        `Completed streaming for conversation: ${conversationId}, total messages: ${conversationHistory.length}`,
      );
    } catch (error) {
      server.log.error(`AI streaming error: ${error}`);
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: "AI request failed" })}\n\n`);
    }

    reply.raw.end();
    return;
  }

  // Fallback to regular JSON response (non-streaming)
  try {
    const result = streamText(args);

    let fullResponse = "";
    for await (const chunk of result.textStream) {
      fullResponse += chunk;
    }

    // Add assistant response to conversation history
    conversationHistory.push({
      role: "assistant",
      content: fullResponse,
    });

    const response = {
      response: fullResponse,
      conversationId,
    };

    server.log.info(`Sending non-streaming response, conversation: ${conversationId}`);
    return response;
  } catch (error) {
    server.log.error(`AI request error: ${error}`);
    reply.status(500).send({ error: "AI request failed" });
  }
});

// Start server
const start = async () => {
  try {
    const port = process.env.CJODE_SERVER_PORT || options.port || config.CJODE_SERVER_PORT;
    const host = process.env.CJODE_SERVER_HOST || options.host || config.CJODE_SERVER_HOST;

    // Log environment status
    const hasAnthropicKey = !!config.ANTHROPIC_API_KEY;
    const hasOpenAIKey = !!config.OPENAI_API_KEY;

    server.log.info(
      `Environment: Anthropic API Key ${hasAnthropicKey ? "✓" : "✗"}, OpenAI API Key ${hasOpenAIKey ? "✓" : "✗"}`,
    );
    server.log.info(
      `Server config: port=${port}, host=${host}, model=${config.CJODE_DEFAULT_MODEL}`,
    );

    await server.listen({ port, host });
    console.log(`🚀 Cjode server running on http://${host}:${port}`);

    if (!hasAnthropicKey && !hasOpenAIKey) {
      console.log(`⚠️  No API keys configured. Run 'cjode init' to configure.`);
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  await server.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});

start();
