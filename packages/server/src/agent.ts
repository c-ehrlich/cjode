import { stepCountIs, streamText } from "ai";
import { getConfig } from "@cjode/config";

import { readTool } from "./tools/read.tool";
import { listDirTool } from "./tools/list-dir.tool";
import { writeFileTool } from "./tools/write-file.tool";
import { editFileTool } from "./tools/edit-file.tool";
import { bashTool } from "./tools/bash.tool";
import { Anthropic } from "./models/anthropic";

export interface AgentOptions {
  prompt: string;
  workingDirectory?: string;
  systemPrompt?: string;
  maxOutputTokens?: number;
  maxSteps?: number;
}

export interface AgentResult {
  response: string;
  success: boolean;
  error?: string;
}

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const {
    prompt,
    workingDirectory,
    systemPrompt = "You are a helpful coding assistant. You help users with programming tasks, code review, debugging, and software development questions. Be concise but thorough in your responses.",
    maxOutputTokens = 32000,
    maxSteps = 100,
  } = options;

  try {
    // Load configuration
    const config = getConfig();
    
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured. Run `cjode init` to configure.");
    }

    // Change working directory if specified
    const originalCwd = process.cwd();
    if (workingDirectory) {
      process.chdir(workingDirectory);
    }

    // Set up conversation with system prompt and user message
    const messages = [
      {
        role: "system" as const,
        content: systemPrompt,
      },
      {
        role: "user" as const,
        content: prompt,
      },
    ];

    // Configure the AI request
    const result = streamText({
      model: Anthropic.ClaudeSonnet4,
      messages,
      maxOutputTokens,
      stopWhen: stepCountIs(maxSteps),
      tools: {
        bashTool,
        listDirTool,
        readTool,
        writeFileTool,
        editFileTool,
      },
    });

    // Collect the full response
    let fullResponse = "";
    for await (const chunk of result.textStream) {
      fullResponse += chunk;
    }

    // Restore original working directory
    if (workingDirectory) {
      process.chdir(originalCwd);
    }

    return {
      response: fullResponse,
      success: true,
    };
    
  } catch (error) {
    // Restore original working directory on error
    if (workingDirectory) {
      const originalCwd = process.cwd();
      try {
        process.chdir(originalCwd);
      } catch {
        // Ignore errors restoring directory
      }
    }

    return {
      response: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Convenience function for LiveSWEBench evaluation
export async function runLiveSWEBenchTask(prompt: string, repoPath: string): Promise<AgentResult> {
  return runAgent({
    prompt,
    workingDirectory: repoPath,
    systemPrompt: `You are a software engineering assistant helping to solve coding tasks. You have access to read files, write files, edit files, list directories, and run bash commands.

Your goal is to understand the problem described in the user's prompt and make the necessary code changes to solve it. You should:

1. First explore the codebase to understand the structure
2. Locate relevant files mentioned in the issue
3. Make the necessary changes to fix the problem
4. Test your changes if possible

Work systematically and explain your reasoning as you go.`,
    maxSteps: 200, // Give more steps for complex tasks
  });
}
