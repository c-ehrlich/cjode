import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: false, // CLI doesn't need type definitions
  external: [], // Bundle all dependencies for CLI
  splitting: false,
  sourcemap: true,
  bundle: true,
});
