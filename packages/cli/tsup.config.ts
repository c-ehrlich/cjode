import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: false, // CLI doesn't need type definitions
  external: ["@cjode/core", "@cjode/state"],
  splitting: false,
  sourcemap: true,
});
