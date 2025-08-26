# NPM Release Plan

## Package Name Security

### Primary Package Name: `cjode`
1. **Check availability**: Run `npm info cjode` to verify it's available
2. **Register on npm**: Create npm account if needed at https://www.npmjs.com/signup
3. **Claim the name**: Run `npm publish --dry-run` first, then `npm publish` to claim
4. **Enable 2FA**: Run `npm profile enable-2fa auth-and-writes` for security
5. **Set up organization** (optional): Create `@cjode` org for future scoped packages

### Backup Strategy
If `cjode` is taken, consider:
- `@cjode/cli` (scoped package)
- `cjode-cli` 
- `cjode-dev`

## Release Automation Setup

### 1. Release Please Configuration

Create `.github/workflows/release-please.yml`:
```yaml
name: Release Please
on:
  push:
    branches:
      - main

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: google-github-actions/release-please-action@v4
        id: release
        with:
          release-type: node
          package-name: cjode
          token: ${{ secrets.GITHUB_TOKEN }}
      
      # Publish to npm when release is created
      - uses: actions/checkout@v4
        if: ${{ steps.release.outputs.release_created }}
      
      - uses: actions/setup-node@v4
        if: ${{ steps.release.outputs.release_created }}
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      
      - uses: pnpm/action-setup@v4
        if: ${{ steps.release.outputs.release_created }}
        with:
          version: 8.15.0
      
      - name: Install dependencies
        if: ${{ steps.release.outputs.release_created }}
        run: pnpm install
      
      - name: Build
        if: ${{ steps.release.outputs.release_created }}
        run: pnpm build
      
      - name: Publish to npm
        if: ${{ steps.release.outputs.release_created }}
        run: pnpm publish --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Create `release-please-config.json`:
```json
{
  "release-type": "node",
  "include-component-in-tag": false,
  "include-v-in-tag": true,
  "packages": {
    ".": {
      "package-name": "cjode"
    }
  }
}
```

Create `.release-please-manifest.json`:
```json
{
  ".": "0.1.0"
}
```

### 2. Conventional Commits Validation

Create `.github/workflows/conventional-commits.yml`:
```yaml
name: Conventional Commits
on:
  pull_request:
    types: [opened, edited, synchronize]

jobs:
  conventional-commits:
    runs-on: ubuntu-latest
    steps:
      - name: Check PR title
        uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            docs
            style
            refactor
            perf
            test
            build
            ci
            chore
            revert
          requireScope: false
          disallowScopes: |
            release
          subjectPattern: ^(?![A-Z]).+$
          subjectPatternError: |
            The subject "{subject}" found in the pull request title "{title}"
            didn't match the configured pattern. Please ensure that the subject
            doesn't start with an uppercase character.
```

### 3. Required GitHub Secrets

Set these in GitHub repository settings → Secrets and variables → Actions:

1. **NPM_TOKEN**: 
   - Generate at https://www.npmjs.com/settings/tokens
   - Use "Automation" token type
   - Scope to the `cjode` package

2. **GITHUB_TOKEN**: 
   - Automatically provided by GitHub Actions
   - No manual setup needed

### 4. Package.json Updates

Update root `package.json`:
```json
{
  "name": "cjode",
  "version": "0.1.0",
  "private": false,
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "packages/cli/dist/**",
    "packages/cli/bin/**",
    "packages/*/dist/**",
    "README.md",
    "LICENSE"
  ],
  "bin": {
    "cjode": "./packages/cli/bin/cjode.js"
  },
  "main": "./packages/cli/dist/index.js"
}
```

### 5. CLI Package Updates

Update `packages/cli/package.json`:
- Remove `"private": true` if present
- Ensure proper `bin` field
- Add `publishConfig` for public access

## Release Process

### Initial Setup Steps
1. **Manual tasks**:
   - Claim npm package name
   - Set up npm 2FA
   - Add NPM_TOKEN to GitHub secrets
   - Create release-please config files
   - Create GitHub workflow files

2. **Test release**:
   - Create a test branch
   - Make a conventional commit (e.g., `feat: initial release`)
   - Merge to main
   - Verify release-please creates PR
   - Merge release PR to test full flow

### Ongoing Process
1. **Development**: Use conventional commit messages
2. **PRs**: Ensure PR titles follow conventional commits
3. **Release**: Merge release-please PR to automatically:
   - Bump version in package.json
   - Update CHANGELOG.md
   - Create GitHub release
   - Publish to npm

## Security Considerations

### What Gets Published
- Only `dist/` folders (built code)
- Binary files from `packages/cli/bin/`
- README.md and LICENSE
- **Excluded**: Source files, .env files, test files, development configs

### Runtime Security
- No hardcoded secrets in published code
- Environment variables handled securely
- API keys required from user's environment
- No centralized server dependency

## CLI Architecture for Self-Hosted

The CLI should:
1. **Spawn its own server** locally when needed
2. **Use user's API keys** from their environment
3. **No network dependencies** except to AI providers
4. **Graceful degradation** when API keys missing

This eliminates centralized infrastructure and makes the package truly self-contained.
