import { defineConfig } from "tsup";

export default defineConfig({
  // Single entry point for CLI
  entry: { cjode: "src/index.ts" },
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: false,
  splitting: false,
  sourcemap: true,
  bundle: true,

  // Bundle workspace packages except server (server runs as separate process)
  noExternal: ["@cjode/config", "@cjode/core", "@cjode/state"],
  external: [
    // Keep major external dependencies external to minimize bundle size
    "commander",
    "chalk",
  ],
});
