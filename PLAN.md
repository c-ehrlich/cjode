# Development Plan - Technical Debt & Improvements (Revised)

## Overview
This plan addresses critical technical debt and missing features identified during code review of the basic-agent branch. **Estimated effort: 5-6 weeks for one engineer.**

## Architectural Decisions

### Configuration Strategy
**Decision**: Create `@cjode/config` package to eliminate duplication
- Single source of truth for environment loading and validation
- Load dotenv once, validate once with Zod, export typed config object
- All other packages consume the validated config

### Authentication Strategy  
**Decision**: Implement API key authentication in Phase 2 (not optional)
- Required for production deployment
- Affects interfaces, middleware, and test coverage
- Better to implement properly now than retrofit later

### Persistence Strategy
**Decision**: In-memory only for now, with clear migration path
- Document limitation explicitly
- Design conversation interface for easy persistence layer swap
- Plan Redis/SQLite adapter for future scaling

## Phase 1: Foundation & Testing Infrastructure 🧪

### 1.1 Create Test Harness (Day 1)
**Problem**: No safety net during refactoring
**Solution**:
- [ ] Add `vitest` configuration at workspace root
- [ ] Create basic CI test runner (even with 1 trivial test)
- [ ] Set up test coverage reporting with `c8`
- [ ] Configure test scripts in all packages

### 1.2 Create Shared Config Package
**Problem**: Duplicate env parsing across packages
**Solution**:
- [ ] Create `packages/config/` with these exports:
  ```typescript
  export const config: AppConfig; // validated config object
  export const configSchema: z.ZodSchema<AppConfig>;
  export const loadConfig: () => AppConfig;
  ```
- [ ] Handle env sources with smart context-aware loading:
  1. `process.env` (always highest priority - for Docker/CI/cloud)
  2. `~/.config/cjode/.env` (global config - normal usage)
  3. `.env` in cjode repo root (ONLY when developing cjode itself)
- [ ] Detect development context vs normal usage to avoid conflicts
- [ ] Never read `.env` from arbitrary project directories
- [ ] Remove all env parsing from other packages
- [ ] Add fast-failing tests for config loading and precedence

### 1.3 Config Package Tests
**Problem**: No tests for critical config loading
**Solution**:
- [ ] Test schema validation (valid/invalid configs)
- [ ] Test environment variable precedence:
  - `process.env` overrides everything
  - Global config loads in normal usage
  - Local `.env` only loads in dev context
- [ ] Test development context detection
- [ ] Test config isolation (doesn't read project `.env` files)
- [ ] Test cross-platform path resolution
- [ ] Test error messages for missing required vars
- [ ] Mock file system for reliable testing

### 1.4 Add `cjode init` Command
**Problem**: First-time setup is manual and error-prone
**Solution**:
- [ ] Create `cjode init` command that:
  - Prompts for required environment variables (ANTHROPIC_API_KEY, etc.)
  - Creates `~/.config/cjode/.env` with proper permissions
  - Validates API keys by making test requests
  - Shows helpful next-steps message
- [ ] Make it the primary onboarding flow in README
- [ ] Add `--overwrite` flag to reinitialize existing config

### 1.5 Fix Dev Script Double Rebuild
**Problem**: tsup + nodemon rebuild loop
**Solution**:
- [ ] Replace with `tsx watch src/index.ts`
- [ ] Keep tsup for production builds only
- [ ] Add Windows/older shell fallback if needed
- [ ] Validate hot-reload works across packages

**Implementation Example**:
```typescript
// packages/config/src/index.ts
import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import path from 'path';

const configSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  // ... other fields
});

function isDevContext(): boolean {
  // Check if we're running from cjode source (not installed globally)
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.join(currentDir, '../../../package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return pkg.name === 'cjode' && fs.existsSync(path.join(currentDir, '../../../.git'));
  } catch {
    return false;
  }
}

export function loadConfig(): z.infer<typeof configSchema> {
  // Always try global config first (normal usage)
  const globalConfigPath = path.join(os.homedir(), '.config/cjode/.env');
  if (fs.existsSync(globalConfigPath)) {
    dotenvConfig({ path: globalConfigPath, override: false });
  }
  
  // Only load local .env if we're developing cjode itself
  if (isDevContext()) {
    dotenvConfig({ path: '.env', override: false });
  }
  
  // process.env always wins (for Docker/CI/cloud deployment)
  return configSchema.parse(process.env);
}

export const config = loadConfig(); // singleton
export { configSchema };
```

**Files to create**:
```
packages/config/package.json
packages/config/src/index.ts
packages/config/src/schema.ts
packages/config/test/config.test.ts
vitest.config.ts (root)
```

## Phase 2: Security & Access Control 🔒

### 2.1 Implement API Key Authentication
**Problem**: No auth on production endpoints
**Solution**:
- [ ] Add `API_KEY` to config schema (required in production)
- [ ] Create Fastify auth middleware
- [ ] Protect `/chat` and `/conversations` routes
- [ ] Add auth bypass for development mode
- [ ] Document API key usage

### 2.2 Configure CORS Properly
**Problem**: `origin: true` allows all origins
**Solution**:
- [ ] Add `CORS_ORIGINS` to config (comma-separated)
- [ ] Default to `/(https?:\/\/)?localhost(:\d+)?/` for dev
- [ ] Support explicit origin list for production
- [ ] Validate CORS configuration on startup

### 2.3 Add Distributed-Safe Rate Limiting
**Problem**: No rate limiting, memory-only storage
**Solution**:
- [ ] Add `@fastify/rate-limit` with Redis store option
- [ ] Config: `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`, `REDIS_URL`
- [ ] Graceful fallback to memory store for dev
- [ ] Test rate limit enforcement

### 2.4 Add Request Validation
**Problem**: No validation of request payloads
**Solution**:
- [ ] Create Zod schemas for all API requests
- [ ] Add Fastify schema validation middleware
- [ ] Return proper 400 errors with field details
- [ ] Test validation edge cases

## Phase 3: Reliability & Observability 💪

### 3.1 Graceful SSE Disconnect Handling
**Problem**: No cleanup on client disconnect
**Solution**:
- [ ] Add `request.raw.on('close')` listener
- [ ] Verify AbortController cancels Anthropic HTTP requests
- [ ] Clean up conversation state and streams
- [ ] Add timeout handling (30s max)
- [ ] Test under load with disconnecting clients

### 3.2 Structured Logging
**Problem**: Basic console.log, no correlation
**Solution**:
- [ ] Configure `pino` logger with correlation IDs
- [ ] Log structured data for chat requests/responses
- [ ] Add request/response timing
- [ ] Remove any secret logging (double-check)

### 3.3 Graceful Shutdown
**Problem**: No cleanup on process termination
**Solution**:
- [ ] Handle SIGTERM/SIGINT signals
- [ ] Close Fastify server gracefully
- [ ] Cancel ongoing streams
- [ ] Add startup/shutdown logging

## Phase 4: Developer Experience 🛠️

### 4.1 Fix CLI Path Resolution  
**Problem**: Hardcoded `../../../apps/server` path
**Solution**:
- [ ] Use `createRequire()` + `require.resolve()` instead of `import.meta.resolve()`
- [ ] Resolve via `@cjode/server/package.json`
- [ ] Add fallback workspace root detection
- [ ] Test on Node 18-20, Windows/Unix

**Implementation**:
```typescript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serverPath = path.dirname(require.resolve('@cjode/server/package.json'));
```

### 4.2 Improved Dev Installation
**Problem**: Complex shell script for global install
**Solution**:
- [ ] Add `bin` field to CLI package.json
- [ ] Create `pnpm run dev:install` script
- [ ] Use `pnpm link --global` for clean global installation
- [ ] Document dev workflow in README

### 4.3 Enhanced DX
**Problem**: Missing development niceties
**Solution**:
- [ ] Add ESLint + Prettier with strict TypeScript rules
- [ ] Configure `exactOptionalPropertyTypes`, `noImplicitAny`
- [ ] Add pre-commit hooks with `lint-staged`
- [ ] Update CI to run linting

## Phase 5: Testing & Production Readiness 🚀

### 5.1 Comprehensive Server Tests
**Problem**: No test coverage for API endpoints
**Solution**:
- [ ] Create LLM client interface for dependency injection
- [ ] Mock Anthropic SDK in tests
- [ ] Test all endpoints: health, chat, conversations
- [ ] Test SSE streaming, disconnect handling
- [ ] Test auth middleware, rate limiting
- [ ] Test error scenarios (invalid requests, timeouts)

### 5.2 Integration & Deployment
**Problem**: No deployment strategy
**Solution**:
- [ ] Create lightweight Dockerfile
- [ ] Add docker-compose for local Redis
- [ ] Configure GitHub Actions for releases
- [ ] Document production deployment
- [ ] Add health check endpoints for load balancers

## Implementation Timeline (Revised)

### Week 1: Test Infrastructure & Config Foundation
- [ ] Set up vitest + CI skeleton with fast-failing tests
- [ ] Create `@cjode/config` package with Zod validation
- [ ] Add comprehensive config loading tests (precedence, isolation, dev context)
- [ ] Create `cjode init` command for smooth onboarding
- [ ] Replace double-build dev script with `tsx`

### Week 2: Security & Validation
- [ ] Implement API key authentication
- [ ] Configure CORS with proper patterns
- [ ] Add rate limiting with Redis support
- [ ] Add request validation schemas
- [ ] Test security middleware

### Week 3: Reliability & Logging
- [ ] Implement SSE disconnect handling
- [ ] Add structured logging with correlation IDs
- [ ] Add graceful shutdown handling
- [ ] Test streaming under load
- [ ] Add comprehensive server endpoint tests

### Week 4: Developer Experience
- [ ] Fix CLI path resolution with `createRequire`
- [ ] Improve dev installation workflow
- [ ] Add ESLint/Prettier with strict rules
- [ ] Update CLI with better error messages
- [ ] Polish `cjode init` command based on user feedback

### Week 5: Production Readiness
- [ ] Complete test coverage (aim for >80%)
- [ ] Add Dockerfile and docker-compose
- [ ] Set up GitHub Actions CI/CD
- [ ] Update documentation
- [ ] Performance testing and optimization

### Week 6: Buffer & Polish
- [ ] Address any integration issues
- [ ] Performance tuning
- [ ] Final documentation review
- [ ] Deployment testing

## Success Criteria (Updated)

**Core Functionality**:
- [ ] Config loaded/validated once per process via shared package
- [ ] CI runs lint + type-check + tests on every PR  
- [ ] API key authentication protects production endpoints
- [ ] CORS configured with explicit origin patterns
- [ ] Rate limiting works with Redis for horizontal scaling

**Reliability**:
- [ ] SSE streams cancel cleanly under load tests
- [ ] Graceful shutdown with proper cleanup
- [ ] Structured logging with correlation IDs
- [ ] >80% test coverage on critical paths

**Developer Experience**:
- [ ] Zero-config dev server (`pnpm dev`)
- [ ] CLI path resolution stable on Node 18-20
- [ ] Global dev installation: `pnpm run dev:install`
- [ ] Strict linting with auto-fix

**Production Ready**:
- [ ] Containerized with health checks
- [ ] GitHub Actions CI/CD pipeline
- [ ] Documentation for deployment
- [ ] Performance tested under realistic load

## Dependencies to Add

```json
{
  "zod": "^3.23.0",
  "@fastify/rate-limit": "^9.0.0",
  "ioredis": "^5.3.2",
  "tsx": "^4.7.0",
  "vitest": "^1.2.0",
  "supertest": "^6.3.0",
  "@types/supertest": "^6.0.0",
  "c8": "^8.0.1",
  "eslint": "^8.57.0",
  "@typescript-eslint/eslint-plugin": "^6.0.0",
  "prettier": "^3.2.5",
  "lint-staged": "^15.2.0",
  "simple-git-hooks": "^2.9.0"
}
```

## Risk Mitigation

1. **Scope Creep**: Fixed 6-week timeline with buffer week
2. **Breaking Changes**: Tests-first approach provides safety net
3. **Dependencies**: Proven tools (Fastify, Zod, vitest) reduce risk
4. **Performance**: Load testing in Week 5 catches issues early
5. **Security**: API key auth + rate limiting implemented early
