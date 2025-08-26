import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: false, // CLI doesn't need type definitions
  // Don't bundle anything - let npm handle dependencies
  splitting: false,
  sourcemap: true,
  bundle: false,
});
