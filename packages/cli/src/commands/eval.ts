import { writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

import { runLiveSWEBenchTask } from "../../../server/src/agent.js";

interface EvalOptions {
  repo: string;
  output?: string;
}

interface EvalScorecard {
  task_completed: boolean;
  files_modified: string[];
  commands_executed: number;
  git_changes: {
    additions: number;
    deletions: number;
    files_changed: number;
  };
  patch_file?: string;
}

function generateGitDiff(repoPath: string): {
  diff: string;
  stats: { additions: number; deletions: number; files_changed: number };
} {
  try {
    // Get git diff
    const diff = execSync("git diff HEAD", {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    // Get diff stats
    const stats = execSync("git diff --numstat HEAD", {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    // Parse stats
    const lines = stats
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
    let additions = 0;
    let deletions = 0;

    lines.forEach((line) => {
      const parts = line.split("\t");
      if (parts.length >= 2) {
        additions += parseInt(parts[0]) || 0;
        deletions += parseInt(parts[1]) || 0;
      }
    });

    return {
      diff,
      stats: {
        additions,
        deletions,
        files_changed: lines.length,
      },
    };
  } catch {
    return {
      diff: "",
      stats: { additions: 0, deletions: 0, files_changed: 0 },
    };
  }
}

function generateScorecard(repoPath: string, success: boolean, response: string): EvalScorecard {
  const gitChanges = generateGitDiff(repoPath);

  // Count files mentioned in response (rough heuristic)
  const fileMatches = response.match(/\b\w+\.\w+\b/g) || [];
  const uniqueFiles = [...new Set(fileMatches)];

  // Count commands mentioned (rough heuristic)
  const commandMatches = response.match(/```(?:bash|sh)\s*([\s\S]*?)```/g) || [];

  return {
    task_completed: success && gitChanges.stats.files_changed > 0,
    files_modified: uniqueFiles.slice(0, 10), // Limit to 10 files
    commands_executed: commandMatches.length,
    git_changes: gitChanges.stats,
    patch_file: gitChanges.diff.length > 0 ? "generated.patch" : undefined,
  };
}

export async function evalCommand(prompt: string, options: EvalOptions) {
  console.log(`🤖 Running cjode agent evaluation...`);
  console.log(`📁 Repository: ${options.repo}`);
  console.log(`📝 Prompt: ${prompt.length > 100 ? prompt.substring(0, 100) + "..." : prompt}`);
  console.log();

  const startTime = Date.now();

  try {
    const result = await runLiveSWEBenchTask(prompt, resolve(options.repo));
    const duration = Date.now() - startTime;
    const repoPath = resolve(options.repo);

    // Generate scorecard and git diff
    const scorecard = generateScorecard(repoPath, result.success, result.response);
    const gitDiff = generateGitDiff(repoPath);

    const output = {
      success: result.success,
      prompt,
      response: result.response,
      error: result.error,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
      repo_path: repoPath,
      scorecard,
      git_diff: gitDiff.diff,
    };

    // Output results
    if (options.output) {
      writeFileSync(options.output, JSON.stringify(output, null, 2));

      // Also save patch file if changes exist
      if (gitDiff.diff.length > 0) {
        const patchFile = options.output.replace(/\.json$/, ".patch");
        writeFileSync(patchFile, gitDiff.diff);
        console.log(`📄 Patch saved to ${patchFile}`);
      }

      console.log(`✅ Results saved to ${options.output}`);
    } else {
      console.log(`--- AGENT RESPONSE ---`);
      console.log(result.response);
      if (result.error) {
        console.log(`--- ERROR ---`);
        console.log(result.error);
      }
    }

    // Display scorecard
    console.log(`\n--- EVALUATION SCORECARD ---`);
    console.log(`📋 Task Completed: ${scorecard.task_completed ? "✅" : "❌"}`);
    console.log(`📁 Files Changed: ${scorecard.git_changes.files_changed}`);
    console.log(`➕ Lines Added: ${scorecard.git_changes.additions}`);
    console.log(`➖ Lines Deleted: ${scorecard.git_changes.deletions}`);
    console.log(`⚡ Commands Executed: ${scorecard.commands_executed}`);
    if (scorecard.patch_file) {
      console.log(`📄 Patch Available: ${scorecard.patch_file}`);
    }

    console.log(`\n⏱️  Duration: ${duration}ms`);
    console.log(`🎯 Success: ${result.success ? "✅" : "❌"}`);

    // Exit with appropriate code for automation
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error(`❌ Evaluation failed:`, error);

    if (options.output) {
      const errorOutput = {
        success: false,
        prompt,
        response: "",
        error: error instanceof Error ? error.message : "Unknown error",
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        repo_path: resolve(options.repo),
      };
      writeFileSync(options.output, JSON.stringify(errorOutput, null, 2));
    }

    process.exit(1);
  }
}
