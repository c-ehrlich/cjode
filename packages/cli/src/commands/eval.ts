import { writeFileSync } from "fs";
import { resolve } from "path";

import { runLiveSWEBenchTask } from "@cjode/server/src/agent";

interface EvalOptions {
  repo: string;
  output?: string;
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
    
    const output = {
      success: result.success,
      prompt,
      response: result.response,
      error: result.error,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
      repo_path: resolve(options.repo),
    };

    // Output results
    if (options.output) {
      writeFileSync(options.output, JSON.stringify(output, null, 2));
      console.log(`✅ Results saved to ${options.output}`);
    } else {
      console.log(`--- AGENT RESPONSE ---`);
      console.log(result.response);
      if (result.error) {
        console.log(`--- ERROR ---`);
        console.log(result.error);
      }
    }

    console.log(`⏱️  Duration: ${duration}ms`);
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
