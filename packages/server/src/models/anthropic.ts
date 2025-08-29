import { createAnthropic } from "@ai-sdk/anthropic";
import { getConfig } from "@cjode/config";

const config = getConfig();

const anthropic = createAnthropic({ apiKey: config.ANTHROPIC_API_KEY });

export const Anthropic = {
  ClaudeOpus4: anthropic("claude-opus-4-20250514"),
  ClaudeSonnet4: anthropic("claude-sonnet-4-20250514"),
  ClaudeHaiku35: anthropic("claude-3-5-haiku-latest"),
};
