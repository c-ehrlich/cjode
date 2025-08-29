# Release Please Setup Plan for cjode Monorepo

## Overview

This plan outlines the setup of automated releases using Google's release-please for the cjode monorepo. Based on the current structure and requirements, we'll configure release-please to:

1. Release `@c-ehrlich/cjode` (CLI package) to npm as a single bundled package
2. Bundle server and all internal packages (@cjode/config, @cjode/core, @cjode/state, @c-ehrlich/cjode-server) into the CLI
3. Auto-bump all internal package versions for tracking purposes

## Current Monorepo Structure

```
cjode/
├── packages/
│   ├── cli/           → @c-ehrlich/cjode (single release to npm)
│   ├── server/        → @c-ehrlich/cjode-server (bundled into CLI)
│   ├── config/        → @cjode/config (bundled into CLI)
│   ├── core/          → @cjode/core (bundled into CLI)
│   └── state/         → @cjode/state (bundled into CLI)
└── package.json       → @c-ehrlich/cjode-root (private)
```

### Dependency Relationships
- CLI depends on: server, config, core, state
- Server depends on: config, state  
- Config, core, state have no internal dependencies

### Current Versions
All packages currently at version 0.10.0 (CLI/server) and 0.1.0 (internal packages).

## Release Strategy

### Public Package (to npm)
1. **@c-ehrlich/cjode** (CLI) - Single bundled package containing all functionality

### Bundled Packages (version-tracked but not published)
- **@c-ehrlich/cjode-server** - Server functionality (bundled into CLI)
- **@cjode/config** - Configuration utilities (bundled into CLI)
- **@cjode/core** - Core AI functionality (bundled into CLI) 
- **@cjode/state** - State management (bundled into CLI)

## Implementation Plan

### Step 1: Create Release Please Configuration Files

#### A. `release-please-config.json`
```json
{
  "release-type": "node",
  "packages": {
    "packages/cli": {
      "package-name": "@c-ehrlich/cjode",
      "component": "cli"
    },
    "packages/server": {
      "package-name": "@c-ehrlich/cjode-server",
      "skip-github-release": true
    },
    "packages/config": {
      "package-name": "@cjode/config",
      "skip-github-release": true
    },
    "packages/core": {
      "package-name": "@cjode/core",
      "skip-github-release": true
    },
    "packages/state": {
      "package-name": "@cjode/state",
      "skip-github-release": true
    }
  },
  "group-pull-request-title-pattern": "chore: release ${branch}",
  "separate-pull-requests": false,
  "bump-minor-pre-major": true,
  "bump-patch-for-minor-pre-major": true,
  "skip-github-release": false,
  "include-component-in-tag": true,
  "tag-separator": "-"
}
```

#### B. `.release-please-manifest.json`
```json
{
  "packages/cli": "0.10.0",
  "packages/server": "0.10.0",
  "packages/config": "0.1.0",
  "packages/core": "0.1.0", 
  "packages/state": "0.1.0"
}
```

### Step 2: Setup GitHub Workflow

#### `.github/workflows/release-please.yml`
```yaml
name: Release Please

on:
  push:
    branches:
      - main

# Prevent concurrent releases
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write
  id-token: write # for npm provenance

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      # Checkout first (critical fix)
      - uses: actions/checkout@v4

      - uses: google-github-actions/release-please-action@v4
        id: release
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      # Checkout the tagged commit (critical for building released version)
      - uses: actions/checkout@v4
        if: ${{ steps.release.outputs['packages/cli--release_created'] }}
        with:
          ref: ${{ steps.release.outputs['packages/cli--sha'] }}

      # Only proceed with build/publish if CLI was released
      - uses: actions/setup-node@v4
        if: ${{ steps.release.outputs['packages/cli--release_created'] }}
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - uses: pnpm/action-setup@v4
        if: ${{ steps.release.outputs['packages/cli--release_created'] }}
        with:
          version: 8

      - name: Install dependencies
        if: ${{ steps.release.outputs['packages/cli--release_created'] }}
        run: pnpm install

      - name: Build CLI package
        if: ${{ steps.release.outputs['packages/cli--release_created'] }}
        run: pnpm run build --filter=@c-ehrlich/cjode...

      # Configure npm authentication
      - name: Configure npm
        if: ${{ steps.release.outputs['packages/cli--release_created'] }}
        run: |
          echo "registry=https://registry.npmjs.org" >> ~/.npmrc
          echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" >> ~/.npmrc
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

      # Comprehensive bundle validation
      - name: Validate CLI bundle
        if: ${{ steps.release.outputs['packages/cli--release_created'] }}
        run: |
          cd packages/cli
          # Test bundle creation and CLI functionality
          npm pack --dry-run
          node dist/cjode.js --help
          
          # Verify workspace packages are bundled (not in node_modules)
          npm pack
          tar -tzf *.tgz | grep node_modules/@cjode && echo "❌ Internal packages not bundled!" || echo "✅ Internal packages bundled"
          tar -tzf *.tgz | grep node_modules/@c-ehrlich/cjode-server && echo "❌ Server not bundled!" || echo "✅ Server bundled"
          
          # Validate package structure with publint
          npx publint || echo "Publint check completed"

      - name: Publish CLI to npm
        if: ${{ steps.release.outputs['packages/cli--release_created'] }}
        run: |
          cd packages/cli
          npm publish --provenance
```

### Step 3: Update Package Configurations

#### CLI Package Updates (`packages/cli/tsup.config.ts`)
```typescript
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
  // Add shebang for executable
  banner: {
    js: "#!/usr/bin/env node"
  },
  // Explicitly bundle workspace packages (critical for single-package distribution)
  noExternal: [
    "@c-ehrlich/cjode-server",
    "@cjode/config",
    "@cjode/core",
    "@cjode/state"
  ],
  external: [
    // Keep major external dependencies external to minimize bundle size
    "commander", 
    "chalk",
    "fastify", 
    "@fastify/cors", 
    "ai", 
    "@ai-sdk/anthropic"
  ]
});
```

#### Package Dependencies Updates

**CLI package.json restructure** (critical for proper bundling):
```json
{
  "name": "@c-ehrlich/cjode",
  "type": "module",
  "bin": {
    "cjode": "dist/cjode.js"
  },
  "main": "dist/cjode.js",
  "publishConfig": {
    "access": "public"
  },
  "dependencies": {
    // Only external dependencies that users need to install
    "commander": "^12.0.0",
    "chalk": "^5.0.0",
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "ai": "^5.0.0",
    "@ai-sdk/anthropic": "^2.0.0"
  },
  "devDependencies": {
    // All workspace packages go here to avoid npm install issues
    "@c-ehrlich/cjode-server": "*",
    "@cjode/config": "*",
    "@cjode/core": "*",
    "@cjode/state": "*",
    "tsup": "^8.5.0",
    "typescript": "^5.7.0"
  }
}
```

**Mark internal packages as private** in their respective package.json files:
```json
{
  "name": "@cjode/config",
  "private": true,
  "version": "0.1.0",
  ...
}
```

Apply the same `"private": true` to:
- `packages/server/package.json`
- `packages/config/package.json` 
- `packages/core/package.json`
- `packages/state/package.json`

### Step 4: Initial Setup Steps

1. **Test the configuration with dry-run:**
   ```bash
   # Install release-please CLI globally
   npm install -g release-please
   
   # Test configuration with dry run
   release-please release-pr \
     --token=$GITHUB_TOKEN \
     --repo-url=c-ehrlich/cjode \
     --dry-run \
     --debug
   ```

2. **Comprehensive local bundle validation:**
   ```bash
   # Build all packages
   pnpm run build
   
   # Test CLI bundling thoroughly
   cd packages/cli
   
   # Create and inspect package
   npm pack --dry-run
   npm pack
   
   # Test CLI functionality 
   node dist/cjode.js --help
   
   # Critical: Verify workspace packages are bundled, not externalized
   echo "Checking bundle contents..."
   tar -tzf *.tgz | grep -E "dist/.*\.js$" | head -5
   
   # Verify no workspace packages in node_modules (they should be bundled)
   tar -tzf *.tgz | grep node_modules/@cjode && echo "❌ Internal packages not bundled!" || echo "✅ Internal packages bundled"
   tar -tzf *.tgz | grep node_modules/@c-ehrlich/cjode-server && echo "❌ Server not bundled!" || echo "✅ Server bundled"
   
   # Test that the package will work when installed elsewhere
   mkdir /tmp/test-install
   cd /tmp/test-install
   npm init -y
   npm install /path/to/your/repo/packages/cli/*.tgz
   npx @c-ehrlich/cjode --help
   ```

### Step 5: Pre-release Checklist

**Critical bundling requirements:**
- [ ] Update CLI tsup config with single entry point and shebang
- [ ] Add `noExternal` array to CLI tsup config
- [ ] Move workspace packages to `devDependencies` in CLI package.json
- [ ] Add external dependencies to `dependencies` in CLI package.json
- [ ] Add `"type": "module"` and proper bin config to CLI package.json
- [ ] Add `"publishConfig": { "access": "public" }` to CLI package.json
- [ ] Mark internal packages as `"private": true` in their package.json
- [ ] Second checkout of tagged commit in GitHub workflow
- [ ] Add npm authentication and concurrency control to workflow

**Validation checklist:**
1. ✅ **NPM_TOKEN secret set up** in GitHub repository settings
2. [ ] **Update all package.json files** as specified above
3. [ ] **Ensure all packages build correctly** with `pnpm run build`
4. [ ] **Comprehensive bundle validation** passes locally
5. [ ] **Test CLI functionality** with bundled dependencies
6. [ ] **Dry-run release-please** configuration works
7. [ ] **Add CI validation workflow** for pull requests

## Key Considerations

### Bundling Strategy
- **Single CLI distribution**: Everything bundled into @c-ehrlich/cjode
- **Server and internal packages bundled**: All workspace dependencies included in CLI bundle
- **External dependencies**: Keep core dependencies (fastify, ai, commander, chalk) external
- **Version tracking**: All packages get version bumps but only CLI publishes

### Version Management 
- **Conventional commits**: Use `feat:`, `fix:`, `BREAKING CHANGE:` for version bumps
- **All packages tracked**: Internal packages get version bumps for change tracking
- **Single publication**: Only CLI package published to npm
- **Pre-1.0 handling**: Configured to bump minor for breaking changes, patch for features

### GitHub Integration
- **Single release PR**: Combined PR for all package changes  
- **Release notes**: Auto-generated from conventional commits
- **Labels**: `autorelease: pending` → `autorelease: tagged`
- **Tags**: Component-based tags (cli-v1.2.3, server-v1.2.3, etc.)

### Node Workspace Plugin Benefits
- **Automatic activation**: Enabled by default for release-type=node
- **Dependency updates**: Automatically updates workspace dependency versions
- **Change propagation**: Changes in any package can trigger CLI release
- **Lockfile management**: Handles pnpm-lock.yaml updates

## Risks and Mitigations

### Risk: Bundling Issues
- **Mitigation**: Comprehensive local testing and CI validation
- **Testing**: `npm pack --dry-run` and CLI functionality tests
- **Fallback**: Can revert to separate package releases if needed

### Risk: Bundle Size
- **Mitigation**: Monitor npm package size limits
- **Strategy**: Keep major dependencies external to minimize size
- **Monitoring**: Regular bundle size analysis

### Risk: Version Synchronization
- **Mitigation**: Node workspace plugin handles automatic updates
- **Testing**: Dry-run testing validates configuration
- **Recovery**: Manual version fixes if automation fails

## Success Criteria

1. ✅ Release PRs automatically created for changes
2. ✅ Single CLI package bundles all functionality correctly  
3. ✅ CLI publishes to npm successfully with proper bundling
4. ✅ All workspace package versions update automatically
5. ✅ GitHub releases created with proper notes and tags
6. ✅ Bundle validation passes in CI

## Additional Workflow for PR Validation

Create `.github/workflows/validate-pr.yml` to test bundling on every PR:
```yaml
name: Validate PR

on:
  pull_request:
    branches: [main]

jobs:
  validate-bundle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v4
        with:
          version: 8
      - run: pnpm install
      - run: pnpm run build
      - name: Comprehensive bundle validation
        run: |
          cd packages/cli
          # Test bundle creation and CLI functionality
          npm pack --dry-run
          node dist/cjode.js --help || echo "CLI test failed"
          
          # Critical: Verify workspace packages are properly bundled
          npm pack
          tar -tzf *.tgz | grep node_modules/@cjode && echo "❌ Internal packages not bundled!" || echo "✅ Internal packages bundled"
          tar -tzf *.tgz | grep node_modules/@c-ehrlich/cjode-server && echo "❌ Server not bundled!" || echo "✅ Server bundled"
          
          # Additional validation with publint
          npx publint || echo "Publint validation completed"
```

## Implementation Checklist

**Before creating any files:**
- [ ] Add `noExternal` array to `packages/cli/tsup.config.ts`
- [ ] Restructure `packages/cli/package.json` dependencies  
- [ ] Mark all internal packages as `"private": true`
- [ ] Move external deps to CLI dependencies, workspace deps to devDependencies

**File creation:**
- [ ] Create `release-please-config.json` at repo root
- [ ] Create `.release-please-manifest.json` at repo root
- [ ] Create `.github/workflows/release-please.yml`
- [ ] Create `.github/workflows/validate-pr.yml`

**Testing and validation:**
- [ ] Run comprehensive local bundle validation
- [ ] Test `release-please --dry-run` configuration
- [ ] Verify CLI works when installed from tarball
- [ ] Push initial changes and test PR validation workflow
- [ ] Create and merge first automated release PR

This approach ensures a single, self-contained CLI package that includes all functionality while maintaining proper version tracking for all workspace packages.
