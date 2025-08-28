import { readdirSync, statSync } from "fs";
import { join } from "path";

import { z } from "zod";
import { tool } from "ai";

export const listDirTool = tool({
  description: "List the files and directories in a given directory path.",
  inputSchema: z.object({
    path: z.string().describe("Absolute path to directory to list"),
    ignore: z.array(z.string()).optional().describe("List of glob patterns to ignore"),
  }),
  outputSchema: z.object({
    path: z.string().describe("Absolute path to the directory that was listed"),
    entries: z
      .array(
        z.object({
          name: z.string().describe("Name of the file or directory"),
          type: z.enum(["file", "directory"]).describe("Type of the entry"),
          size: z.number().optional().describe("Size in bytes (for files only)"),
        }),
      )
      .describe("List of files and directories in the path"),
    totalEntries: z.number().describe("Total number of entries in the directory"),
  }),
  execute: async ({ path, ignore }) => {
    try {
      const entries = readdirSync(path);

      const filteredEntries = ignore
        ? entries.filter(
            (name) =>
              !ignore.some((pattern) => {
                const regex = new RegExp(pattern.replace(/\*/g, ".*").replace(/\?/g, "."));
                return regex.test(name);
              }),
          )
        : entries;

      const entryDetails = filteredEntries.map((name) => {
        const fullPath = join(path, name);
        const stats = statSync(fullPath);

        return {
          name,
          type: stats.isDirectory() ? ("directory" as const) : ("file" as const),
          size: stats.isFile() ? stats.size : undefined,
        };
      });

      return {
        path,
        entries: entryDetails,
        totalEntries: filteredEntries.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to list directory: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
});
