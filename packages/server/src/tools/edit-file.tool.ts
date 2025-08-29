import { readFileSync, writeFileSync } from "fs";

import { z } from "zod";
import { tool } from "ai";

export const editFileTool = tool({
  description: "Edit a file by finding and replacing text content.",
  inputSchema: z.object({
    path: z.string().describe("Absolute path to the file to edit"),
    find: z.string().describe("Text to find in the file"),
    replace: z.string().describe("Text to replace the found text with"),
    replaceAll: z
      .boolean()
      .optional()
      .default(false)
      .describe("Replace all occurrences (true) or just the first one (false)"),
  }),
  outputSchema: z.object({
    path: z.string().describe("Absolute path to the file that was edited"),
    replacements: z.number().describe("Number of replacements made"),
    success: z.boolean().describe("Whether the edit operation was successful"),
    preview: z.string().describe("Preview of the changed content (first 200 chars)"),
  }),
  execute: async ({ path, find, replace, replaceAll }) => {
    try {
      // Read the current file content
      const originalContent = readFileSync(path, "utf-8");

      // Perform the replacement
      let newContent: string;
      let replacements: number;

      if (replaceAll) {
        const regex = new RegExp(escapeRegExp(find), "g");
        const matches = originalContent.match(regex);
        replacements = matches ? matches.length : 0;
        newContent = originalContent.replace(regex, replace);
      } else {
        replacements = originalContent.includes(find) ? 1 : 0;
        newContent = originalContent.replace(find, replace);
      }

      // Write the modified content back to the file
      writeFileSync(path, newContent, { encoding: "utf-8" });

      // Create a preview of the changes
      const preview = newContent.length > 200 ? newContent.substring(0, 200) + "..." : newContent;

      return {
        path,
        replacements,
        success: true,
        preview,
      };
    } catch (error) {
      throw new Error(
        `Failed to edit file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
});

// Helper function to escape special regex characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
