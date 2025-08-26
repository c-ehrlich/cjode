import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: false, // CLI doesn't need type definitions
  splitting: false,
  sourcemap: true,
  bundle: true,
  external: ["commander", "chalk"], // Keep external deps external
});
