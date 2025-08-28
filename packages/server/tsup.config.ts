import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: false,
  splitting: false,
  sourcemap: true,
  bundle: true,
  external: ["fastify", "@fastify/cors", "ai", "@ai-sdk/anthropic", "commander"], // Keep external deps external, bundle workspace deps
});
