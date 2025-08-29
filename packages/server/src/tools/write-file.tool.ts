import { writeFileSync } from "fs";
import { dirname } from "path";
import { mkdirSync } from "fs";

import { z } from "zod";
import { tool } from "ai";

export const writeFileTool = tool({
  description: "Write content to a file, creating directories if needed.",
  inputSchema: z.object({
    path: z.string().describe("Absolute path to the file to write"),
    content: z.string().describe("Content to write to the file"),
    createDirs: z
      .boolean()
      .optional()
      .default(true)
      .describe("Create parent directories if they don't exist"),
  }),
  outputSchema: z.object({
    path: z.string().describe("Absolute path to the file that was written"),
    bytesWritten: z.number().describe("Number of bytes written"),
    success: z.boolean().describe("Whether the write operation was successful"),
  }),
  execute: async ({ path, content, createDirs }) => {
    try {
      // Create parent directories if needed
      if (createDirs) {
        const parentDir = dirname(path);
        mkdirSync(parentDir, { recursive: true });
      }

      // Write the file
      writeFileSync(path, content, { encoding: "utf-8" });

      const bytesWritten = Buffer.byteLength(content, "utf-8");

      return {
        path,
        bytesWritten,
        success: true,
      };
    } catch (error) {
      throw new Error(
        `Failed to write file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
});
