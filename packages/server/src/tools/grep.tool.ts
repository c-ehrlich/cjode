import { spawnSync } from "child_process";
import { resolve, relative, isAbsolute } from "path";

import { z } from "zod";
import { tool } from "ai";

export const grepTool = tool({
  description:
    "Search for regex patterns in files using ripgrep. Returns matching lines with file paths and line numbers.",
  inputSchema: z.object({
    pattern: z.string().describe("Rust regex pattern to search for"),
    path: z.string().optional().describe("Directory to search in (defaults to workspace root)"),
    include: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Glob pattern(s) of files to include in search"),
    exclude: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Glob pattern(s) of files/directories to exclude from search"),
    caseSensitive: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to perform case-sensitive search"),
    limit: z
      .number()
      .optional()
      .default(250)
      .describe("Maximum number of matches to return across all files"),
    offset: z.number().optional().default(0).describe("Number of matches to skip (for pagination)"),
  }),
  outputSchema: z.object({
    matches: z
      .array(
        z.object({
          file: z.string().describe("Absolute path to the file containing the match"),
          line: z.number().describe("Line number of the match (1-indexed)"),
          content: z.string().describe("Content of the matching line"),
          column: z.number().optional().describe("Column number of the match (1-indexed)"),
        }),
      )
      .describe("Array of matches found"),
    total: z.number().describe("Total number of matches found (before pagination)"),
    searchPath: z.string().describe("Absolute path that was searched"),
    pattern: z.string().describe("Pattern that was used"),
  }),
  execute: async ({ pattern, path, include, exclude, caseSensitive, limit, offset }) => {
    try {
      // Resolve and validate the search path
      const workspaceRoot = process.cwd();
      let searchPath = path ? resolve(workspaceRoot, path) : workspaceRoot;

      // Ensure search path stays within workspace root
      const relativePath = relative(workspaceRoot, searchPath);
      if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
        throw new Error(`Search path must be within workspace root: ${path}`);
      }

      // Build ripgrep command arguments
      const args: string[] = [];

      // Add pattern
      args.push(pattern);

      // Add search path
      args.push(searchPath);

      // Case sensitivity
      if (!caseSensitive) {
        args.push("-i");
      }

      // Output format: include line numbers and file names
      args.push("-n"); // line numbers
      args.push("--no-heading"); // don't group by file
      args.push("--with-filename"); // include filename in output

      // Handle include patterns
      if (include) {
        const includePatterns = Array.isArray(include) ? include : [include];
        includePatterns.forEach((pattern) => {
          args.push("-g", pattern);
        });
      }

      // Handle exclude patterns
      if (exclude) {
        const excludePatterns = Array.isArray(exclude) ? exclude : [exclude];
        excludePatterns.forEach((pattern) => {
          args.push("-g", `!${pattern}`);
        });
      }

      // Execute ripgrep
      const result = spawnSync("rg", args, {
        encoding: "utf-8",
        timeout: 30000, // 30 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer limit
      });

      if (result.error) {
        // Check if ripgrep is not installed
        if (result.error.message.includes("ENOENT") || result.error.message.includes("not found")) {
          throw new Error(
            "ripgrep (rg) is not installed. Please install it: https://github.com/BurntSushi/ripgrep#installation",
          );
        }
        throw new Error(`ripgrep execution failed: ${result.error.message}`);
      }

      // Handle exit codes
      if (result.status === 1) {
        // No matches found - this is normal, return empty results
        return {
          matches: [],
          total: 0,
          searchPath,
          pattern,
        };
      }

      if (result.status !== 0) {
        throw new Error(
          `ripgrep failed with exit code ${result.status}${result.stderr ? `: ${result.stderr}` : ""}`,
        );
      }

      // Parse output
      const output = result.stdout || "";
      const lines = output.trim().split("\n");

      if (lines.length === 1 && lines[0] === "") {
        // Empty output
        return {
          matches: [],
          total: 0,
          searchPath,
          pattern,
        };
      }

      const allMatches = lines.map((line) => {
        // ripgrep output format: filename:line_number:content
        const match = line.match(/^([^:]+):(\d+):(.*)$/);
        if (!match) {
          throw new Error(`Failed to parse ripgrep output line: ${line}`);
        }

        const [, file, lineStr, content] = match;
        return {
          file: resolve(file),
          line: parseInt(lineStr, 10),
          content,
        };
      });

      const total = allMatches.length;

      // Apply pagination
      const matches = allMatches.slice(offset, offset + limit);

      return {
        matches,
        total,
        searchPath,
        pattern,
      };
    } catch (error) {
      throw new Error(
        `Failed to search files: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
});
