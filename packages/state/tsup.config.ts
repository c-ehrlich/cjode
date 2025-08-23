import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/config/index.ts', 'src/env/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  dts: false, // Temporarily disabled due to TypeScript path issues
  splitting: false,
  sourcemap: true,
});
