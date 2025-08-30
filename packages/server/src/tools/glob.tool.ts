import { statSync } from "fs";
import { resolve, relative, isAbsolute } from "path";

import { glob } from "glob";
import { z } from "zod";
import { tool } from "ai";

export const globTool = tool({
  description:
    "Find files using glob patterns. Returns file paths sorted by modification time (newest first).",
  inputSchema: z.object({
    pattern: z
      .string()
      .describe("Glob pattern to match files (e.g., '**/*.ts', 'src/**/*.test.js')"),
    path: z
      .string()
      .optional()
      .describe("Directory to search in (defaults to current working directory)"),
    limit: z.number().optional().default(50).describe("Maximum number of results to return"),
    offset: z.number().optional().default(0).describe("Number of results to skip (for pagination)"),
  }),
  outputSchema: z.object({
    paths: z.array(z.string()).describe("Array of absolute file paths matching the pattern"),
    total: z.number().describe("Total number of files found (before pagination)"),
    searchPath: z.string().describe("Absolute path that was searched"),
    pattern: z.string().describe("Pattern that was used"),
  }),
  execute: async ({ pattern, path, limit, offset }) => {
    try {
      // Resolve and validate the search path
      const workspaceRoot = process.cwd();
      let searchPath = path ? resolve(workspaceRoot, path) : workspaceRoot;

      // Ensure search path stays within workspace root
      const relativePath = relative(workspaceRoot, searchPath);
      if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
        throw new Error(`Search path must be within workspace root: ${path}`);
      }

      // Execute glob search
      const globPattern = resolve(searchPath, pattern);
      const matches = await glob(globPattern, {
        absolute: true,
        nodir: true, // Only return files, not directories
        dot: false, // Don't include hidden files by default
      });

      // Get file stats and sort by modification time (newest first)
      const filesWithStats = matches.map((filePath: string) => {
        try {
          const stats = statSync(filePath);
          return {
            path: filePath,
            mtime: stats.mtime.getTime(),
          };
        } catch {
          // If we can't stat the file, still include it but with mtime 0
          return {
            path: filePath,
            mtime: 0,
          };
        }
      });

      // Sort by modification time (newest first)
      filesWithStats.sort(
        (a: { path: string; mtime: number }, b: { path: string; mtime: number }) =>
          b.mtime - a.mtime,
      );

      // Extract just the paths
      const allPaths = filesWithStats.map((file: { path: string; mtime: number }) => file.path);
      const total = allPaths.length;

      // Apply pagination
      const paginatedPaths = allPaths.slice(offset, offset + limit);

      return {
        paths: paginatedPaths,
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
