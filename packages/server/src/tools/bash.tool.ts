import { spawnSync } from "child_process";
import { resolve, relative, isAbsolute } from "path";

import { generateObject, tool } from "ai";
import { z } from "zod";

import { Anthropic } from "../models/anthropic";

const reviewerPrompt = `
You are a bash command safety reviewer. You are given a command that a local coding agent similar to Cursor or Claude Code wants to run. Your job is to review bash commands for safety and potential issues before they are executed. You will be given a command and you need to provide feedback on its safety.

Please reply with an object that contains the key "result", which is either "safe" or "destructive". Just one word.

Examples:
ls => {safe
rm -rf / => destructive

The command is:
`;

export const bashTool = tool({
  description: "Execute shell commands and return the output.",
  inputSchema: z.object({
    cmd: z.string().describe("The shell command to execute"),
    cwd: z
      .string()
      .optional()
      .describe("Working directory for command execution (defaults to current working directory)"),
  }),
  outputSchema: z.object({
    cmd: z.string().describe("The command that was executed"),
    cwd: z.string().optional().describe("The working directory used"),
    stdout: z.string().describe("Standard output from the command"),
  }),
  execute: async ({ cmd, cwd }) => {
    const canRunRes = await generateObject({
      model: Anthropic.ClaudeHaiku35,
      prompt: [
        { role: "system", content: reviewerPrompt },
        { role: "user", content: cmd },
      ],
      schema: z.object({ result: z.enum(["safe", "destructive"]) }),
    });

    if (canRunRes.object.result === "destructive") {
      throw new Error(`Command is potentially destructive: ${cmd}`);
    }

    // Validate and sanitize cwd to prevent directory traversal
    let resolvedCwd = cwd;
    if (cwd) {
      const workspaceRoot = process.cwd();
      resolvedCwd = resolve(workspaceRoot, cwd);

      // Ensure cwd stays within workspace root
      const relativePath = relative(workspaceRoot, resolvedCwd);
      if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
        throw new Error(`Working directory must be within workspace root: ${cwd}`);
      }
    }

    try {
      const result = spawnSync("sh", ["-c", cmd], {
        cwd: resolvedCwd,
        encoding: "utf-8",
        timeout: 30000, // 30 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer limit
      });

      if (result.error) {
        throw new Error(`Command execution failed: ${result.error.message}`);
      }

      if (result.status !== 0) {
        throw new Error(
          `Command failed with exit code ${result.status}${result.stderr ? `: ${result.stderr}` : ""}`,
        );
      }

      return {
        cmd,
        cwd: resolvedCwd,
        stdout: result.stdout || "",
      };
    } catch (error) {
      throw new Error(
        `Failed to execute command: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
});
