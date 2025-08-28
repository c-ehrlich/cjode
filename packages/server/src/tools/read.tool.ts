import { readFileSync } from "fs";

import { z } from "zod";
import { tool } from "ai";

export const readTool = tool({
  description: "Read a file from the file system. Returns file contents with optional line range.",
  inputSchema: z.object({
    path: z.string().describe("Absolute path to the file to read"),
    read_range: z
      .array(z.number())
      .length(2)
      .optional()
      .describe("Optional [startLine, endLine] range (1-indexed)"),
  }),
  outputSchema: z.object({
    path: z.string().describe("Absolute path to the file that was read"),
    content: z.string().describe("Contents of the file"),
    totalLines: z.number().describe("Total number of lines in the file"),
    readRange: z
      .array(z.number())
      .length(2)
      .optional()
      .describe("The range of lines that were read"),
    actualRange: z
      .array(z.number())
      .length(2)
      .optional()
      .describe("The actual range of lines that were read (1-indexed)"),
  }),
  execute: async ({ path, read_range }) => {
    try {
      const content = readFileSync(path, "utf-8");
      const lines = content.split("\n");

      if (read_range) {
        const [startLine, endLine] = read_range;
        const start = Math.max(0, startLine - 1);
        const end = Math.min(lines.length, endLine);
        const selectedLines = lines.slice(start, end);

        return {
          path,
          content: selectedLines.join("\n"),
          totalLines: lines.length,
          readRange: [startLine, endLine],
          actualRange: [start + 1, end],
        };
      }

      return {
        path,
        content,
        totalLines: lines.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to read file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
});
