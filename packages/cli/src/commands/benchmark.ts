import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { execSync } from "child_process";

import { runLiveSWEBenchTask } from "../../../server/src/agent.js";

interface BenchmarkOptions {
  output: string;
  limit?: number;
  repoFilter?: string;
  workspaceDir?: string;
  skipExisting?: boolean;
}

interface LiveSWEBenchTask {
  repo_name: string;
  task_num: number;
  commit: string;
  prompt: string;
  gold_patch: string;
  test_patch: string;
  edit_patch?: string;
  edit_prompt?: string;
  autocomplete_patch?: string;
  autocomplete_prompts?: string;
}

interface BenchmarkResult {
  task: LiveSWEBenchTask;
  success: boolean;
  response: string;
  error?: string;
  duration_ms: number;
  test_results: {
    tests_run: boolean;
    tests_passed: boolean;
    test_output: string;
    error_message?: string;
  };
  scorecard: {
    task_completed: boolean;
    files_modified: string[];
    commands_executed: number;
    git_changes: {
      additions: number;
      deletions: number;
      files_changed: number;
    };
    solution_quality: "correct" | "incorrect" | "untested";
  };
}

interface BenchmarkSummary {
  total_tasks: number;
  successful_tasks: number;
  failed_tasks: number;
  success_rate: number;
  tests_passed_count: number;
  tests_failed_count: number;
  test_pass_rate: number;
  average_duration_ms: number;
  results: BenchmarkResult[];
  timestamp: string;
}

async function loadDataset(): Promise<LiveSWEBenchTask[]> {
  console.log("📦 Loading LiveSWEBench dataset from Hugging Face...");

  try {
    // Try to load using Python datasets library with smaller chunks
    const pythonScript = `
import json
import sys
from datasets import load_dataset

try:
    dataset = load_dataset('livebench/liveswebench', split='test')
    tasks = []
    for i, task in enumerate(dataset):
        # Truncate very long prompts to avoid buffer overflow
        prompt = task['prompt']
        if len(prompt) > 5000:
            prompt = prompt[:5000] + "... [truncated]"
            
        tasks.append({
            'repo_name': task['repo_name'],
            'task_num': task['task_num'],
            'commit': task['commit'],
            'prompt': prompt,
            'gold_patch': task['gold_patch'][:1000] + "..." if len(task['gold_patch']) > 1000 else task['gold_patch'],
            'test_patch': task['test_patch'][:1000] + "..." if len(task['test_patch']) > 1000 else task['test_patch'],
            'edit_patch': task.get('edit_patch'),
            'edit_prompt': task.get('edit_prompt'),
            'autocomplete_patch': task.get('autocomplete_patch'),
            'autocomplete_prompts': task.get('autocomplete_prompts')
        })
        
        # Print count to stderr for progress
        if i == 0:
            print(f"Loading {len(dataset)} tasks...", file=sys.stderr)
    
    print(json.dumps(tasks))
except Exception as e:
    print(f"ERROR: {str(e)}", file=sys.stderr)
    sys.exit(1)
`;

    const result = execSync(`python3 -c "${pythonScript.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      stdio: ["ignore", "pipe", "pipe"],
    });

    const tasks = JSON.parse(result);
    console.log(`✅ Loaded ${tasks.length} test cases`);
    return tasks;
  } catch (error) {
    console.error("❌ Failed to load dataset. Make sure you have 'datasets' installed:");
    console.error("pip install datasets");
    throw error;
  }
}

async function setupRepository(task: LiveSWEBenchTask, workspaceDir: string): Promise<string> {
  const repoDir = join(workspaceDir, task.repo_name);

  console.log(`📁 Setting up ${task.repo_name} at commit ${task.commit.substring(0, 8)}...`);

  try {
    if (!existsSync(repoDir)) {
      // Clone the repository - construct the full repo URL
      // Most repos in LiveSWEBench use the format org/repo, but some may just be repo
      let repoUrl = `https://github.com/${task.repo_name}`;

      // If repo_name doesn't contain a slash, assume it's a single-name repo that might need the org prefix
      if (!task.repo_name.includes("/")) {
        // Try common patterns for single-name repos
        const commonOrgs = ["wagtail", "django", "python", "microsoft", "facebook", "google"];
        repoUrl = `https://github.com/${task.repo_name}/${task.repo_name}`;
      }

      repoUrl += ".git";

      execSync(`git clone ${repoUrl} "${repoDir}"`, {
        stdio: ["ignore", "ignore", "pipe"],
      });
    }

    // Checkout the specific commit
    execSync(`git checkout ${task.commit}`, {
      cwd: repoDir,
      stdio: ["ignore", "ignore", "pipe"],
    });

    // Create a new branch for testing
    const branchName = `cjode-eval-task-${task.task_num}`;
    try {
      execSync(`git checkout -b ${branchName}`, {
        cwd: repoDir,
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch {
      // Branch might already exist, switch to it and reset
      execSync(`git checkout ${branchName} && git reset --hard ${task.commit}`, {
        cwd: repoDir,
        stdio: ["ignore", "ignore", "pipe"],
      });
    }

    return repoDir;
  } catch (error) {
    throw new Error(`Failed to setup repository ${task.repo_name}: ${error}`);
  }
}

async function runTests(
  task: LiveSWEBenchTask,
  repoPath: string,
): Promise<{
  tests_run: boolean;
  tests_passed: boolean;
  test_output: string;
  error_message?: string;
}> {
  try {
    console.log(`🧪 Running tests for ${task.repo_name} #${task.task_num}...`);

    // Different repos have different test commands
    const testCommands = [
      // Python/Django repos
      "python3 -m pytest -xvs",
      "python3 manage.py test --verbosity=2",
      "python3 -m unittest discover -v",
      // Node.js repos
      "npm test",
      "yarn test",
      // General
      "make test",
      "./run_tests.sh",
    ];

    let testOutput = "";
    let testsPassed = false;

    for (const cmd of testCommands) {
      try {
        // Check if command exists first
        const checkCmd = cmd.split(" ")[0];
        execSync(`command -v ${checkCmd}`, { cwd: repoPath, stdio: "ignore" });

        console.log(`  Trying: ${cmd}`);
        const output = execSync(cmd, {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 300000, // 5 minute timeout
          stdio: ["ignore", "pipe", "pipe"],
        });

        testOutput = output;
        testsPassed = true; // If we get here, tests passed
        break;
      } catch (error: any) {
        // Check if this was a test failure vs command not found
        if (error.status !== 127) {
          // 127 = command not found
          testOutput = error.stdout + "\n" + error.stderr;
          testsPassed = false;
          break; // We found a test command but tests failed
        }
        // Continue to next command if 127 (command not found)
      }
    }

    return {
      tests_run: testOutput.length > 0,
      tests_passed: testsPassed,
      test_output: testOutput.substring(0, 5000), // Limit output size
      error_message: testsPassed ? undefined : "Tests failed",
    };
  } catch (error) {
    return {
      tests_run: false,
      tests_passed: false,
      test_output: "",
      error_message: `Test execution error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

async function runSingleTask(task: LiveSWEBenchTask, repoDir: string): Promise<BenchmarkResult> {
  console.log(`🤖 Running task ${task.task_num} on ${task.repo_name}...`);

  const startTime = Date.now();

  try {
    const result = await runLiveSWEBenchTask(task.prompt, repoDir);
    const duration = Date.now() - startTime;

    // Run tests to validate the solution
    const testResults = await runTests(task, repoDir);

    // Generate scorecard with test results
    const gitDiff = getGitChanges(repoDir);
    const scorecard = {
      task_completed: result.success && gitDiff.files_changed > 0,
      files_modified: [], // Could parse from git diff
      commands_executed: 0, // Could parse from response
      git_changes: gitDiff,
      solution_quality: testResults.tests_run
        ? testResults.tests_passed
          ? "correct"
          : "incorrect"
        : gitDiff.files_changed > 0
          ? "untested"
          : "untested",
    } as any;

    return {
      task,
      success: result.success,
      response: result.response,
      error: result.error,
      duration_ms: duration,
      test_results: testResults,
      scorecard,
    };
  } catch (error) {
    return {
      task,
      success: false,
      response: "",
      error: error instanceof Error ? error.message : "Unknown error",
      duration_ms: Date.now() - startTime,
      test_results: {
        tests_run: false,
        tests_passed: false,
        test_output: "",
        error_message: "Task execution failed",
      },
      scorecard: {
        task_completed: false,
        files_modified: [],
        commands_executed: 0,
        git_changes: { additions: 0, deletions: 0, files_changed: 0 },
        solution_quality: "untested",
      },
    };
  }
}

function getGitChanges(repoDir: string): {
  additions: number;
  deletions: number;
  files_changed: number;
} {
  try {
    const stats = execSync("git diff --numstat HEAD", {
      cwd: repoDir,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });

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

    return { additions, deletions, files_changed: lines.length };
  } catch {
    return { additions: 0, deletions: 0, files_changed: 0 };
  }
}

export async function benchmarkCommand(options: BenchmarkOptions) {
  console.log(`🚀 Starting LiveSWEBench benchmark evaluation...`);
  console.log(`📊 Results will be saved to: ${options.output}`);

  const workspaceDir = options.workspaceDir || join(process.cwd(), "liveswebench-workspace");
  mkdirSync(workspaceDir, { recursive: true });

  try {
    // Load test cases
    const allTasks = await loadDataset();

    // Filter tasks
    let tasks = allTasks;
    if (options.repoFilter) {
      tasks = tasks.filter((task) => task.repo_name.includes(options.repoFilter));
      console.log(`🔍 Filtered to ${tasks.length} tasks matching "${options.repoFilter}"`);
    }

    if (options.limit) {
      tasks = tasks.slice(0, options.limit);
      console.log(`🎯 Limited to first ${tasks.length} tasks`);
    }

    console.log(`\n📋 Running ${tasks.length} benchmark tasks...\n`);

    const results: BenchmarkResult[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      console.log(`\n[${i + 1}/${tasks.length}] ${task.repo_name} #${task.task_num}`);
      console.log(`Prompt: ${task.prompt.substring(0, 100)}...`);

      try {
        const repoDir = await setupRepository(task, workspaceDir);
        const result = await runSingleTask(task, repoDir);
        results.push(result);

        const status = result.success ? "✅ SUCCESS" : "❌ FAILED";
        const duration = (result.duration_ms / 1000).toFixed(1);
        const testStatus = result.test_results.tests_run
          ? result.test_results.tests_passed
            ? "🧪 TESTS PASSED"
            : "🧪 TESTS FAILED"
          : "🧪 NO TESTS RUN";
        console.log(
          `${status} | ${testStatus} (${duration}s, ${result.scorecard.git_changes.files_changed} files changed)`,
        );
      } catch (error) {
        console.log(`❌ SETUP FAILED: ${error}`);
        results.push({
          task,
          success: false,
          response: "",
          error: `Setup failed: ${error}`,
          duration_ms: 0,
          scorecard: {
            task_completed: false,
            files_modified: [],
            commands_executed: 0,
            git_changes: { additions: 0, deletions: 0, files_changed: 0 },
          },
        });
      }
    }

    // Generate summary
    const successful = results.filter((r) => r.success).length;
    const testsPassed = results.filter((r) => r.test_results.tests_passed).length;
    const testsRun = results.filter((r) => r.test_results.tests_run).length;

    const summary: BenchmarkSummary = {
      total_tasks: results.length,
      successful_tasks: successful,
      failed_tasks: results.length - successful,
      success_rate: results.length > 0 ? (successful / results.length) * 100 : 0,
      tests_passed_count: testsPassed,
      tests_failed_count: testsRun - testsPassed,
      test_pass_rate: testsRun > 0 ? (testsPassed / testsRun) * 100 : 0,
      average_duration_ms: results.reduce((sum, r) => sum + r.duration_ms, 0) / results.length,
      results,
      timestamp: new Date().toISOString(),
    };

    // Save results
    writeFileSync(options.output, JSON.stringify(summary, null, 2));

    // Print summary
    console.log(`\n🎉 Benchmark Complete!`);
    console.log(
      `📊 Agent Success: ${successful}/${results.length} tasks completed (${summary.success_rate.toFixed(1)}%)`,
    );
    console.log(
      `🧪 Test Success: ${summary.tests_passed_count}/${testsRun} tests passed (${summary.test_pass_rate.toFixed(1)}%)`,
    );
    console.log(`⏱️  Average duration: ${(summary.average_duration_ms / 1000).toFixed(1)}s`);
    console.log(`📁 Full results saved to: ${options.output}`);
  } catch (error) {
    console.error(`❌ Benchmark failed:`, error);
    process.exit(1);
  }
}
