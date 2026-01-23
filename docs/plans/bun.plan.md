# Bernard - Bun Migration Plan

**Generated:** 2026-01-22
**Author:** Sisyphus AI Agent
**Version:** 1.0.0

## Executive Summary

This document outlines a phased approach to migrate the Bernard monorepo from Node.js/npm to Bun runtime and package manager. The migration targets the TypeScript/Node.js services (core and bernard-agent), while preserving the Python (Kokoro) and C++ (Whisper.cpp) services unchanged.

**Git Management Approach:**
- All git commit operations are **MANUAL** - this plan provides read-only git commands only
- Use `git status`, `git diff` for verification before committing
- Checklists indicate "Manual: Commit" to signal when manual commit is appropriate
- No destructive git commands (checkout, reset, etc.) are included in automated steps

**Current State:**
- Runtime: Node.js v25.2.1
- Package Manager: npm v10.9.3
- TypeScript Runner: tsx
- Test Runner: Vitest (with jsdom environment)

**Target State:**
- Runtime: Bun v1.3.6+ (latest stable)
- Package Manager: Bun (built-in)
- TypeScript Runner: Bun (native)
- Test Runner: Vitest (retained) or bun:test (optional)

---

## Phase 0: Prerequisites & Risk Assessment

### Prerequisites
- [ ] Install Bun on development machines: `curl -fsSL https://bun.sh/install | bash`
- [ ] Verify Bun installation: `bun --version` (should be ≥1.3.0)
- [ ] Review CI/CD pipeline (GitHub Actions) - **NOT YET CONFIGURED**

### Critical Blockers & Risks

| Issue | Severity | Impact | Workaround |
|-------|-----------|---------|------------|
| **BullMQ + Bun.redis incompatibility** | 🔴 HIGH | BullMQ requires ioredis; Bun.redis is a node-redis replacement | Keep using ioredis with Bun (works via Node compatibility) |
| **Better Auth build failure** | 🟡 MEDIUM | GitHub issue #6781 - Better Auth fails to build with Bun in Next.js 16 | Use Node.js for build, or wait for fix |
| **LangGraph CLI Node.js dependency** | 🟢 LOW | LangGraph CLI expects Node.js; but runtime compatibility is good | Bun has strong Node.js compatibility layer |
| **No bun.lockb exists** | 🟢 LOW | Clean migration path | Generate new lockfile via `bun install` |

---

## Phase 1: Foundation (Low Risk, Incremental)

**Duration:** 1-2 days

### 1.1 Replace package.json scripts
Update both `package.json` files to use `bun run` instead of `npm run`:

**Root `/package.json`:**
```json
{
  "scripts": {
    "dev": "cd core && bun run dev",
    "build": "cd core && bun run build",
    "start": "cd core && bun run start",
    "check": "bash scripts/check.sh",
    "type-check": "cd core && bun run type-check",
    "test": "cd core && bun run test"
  }
}
```

**Core `/core/package.json`:**
```json
{
  "scripts": {
    "dev": "bun run scripts/dev.ts",
    "dev:core": "bunx next dev --port 3456 --hostname 0.0.0.0",
    "agent:bernard": "bun run scripts/start-agent.ts",
    "build": "bunx next build",
    "start": "bunx next start",
    "lint": "bunx eslint .",
    "type-check": "bunx tsc --noEmit",
    "test": "bunx vitest run",
    "test:watch": "bunx vitest",
    "test:coverage": "bunx vitest run --coverage",
    "test:ui": "bunx vitest --ui"
  }
}
```

**Note:** Use `bunx` for CLI tools (next, eslint, tsc, vitest) instead of npx. This ensures tools run via Bun but remain isolated.

### 1.2 Replace TypeScript execution
Remove `tsx` dependency and update scripts:

**Files to update:**
- `/core/scripts/dev.ts` - Change shebang: `#!/usr/bin/env bun`
- `/core/scripts/start-agent.ts` - Change shebang: `#!/usr/bin/env bun`
- `/core/scripts/worker.ts` - Change shebang: `#!/usr/bin/env bun`
- `/core/scripts/restart-vite.ts` - Change shebang: `#!/usr/bin/env bun`

**Before:**
```bash
#!/usr/bin/env tsx
```

**After:**
```bash
#!/usr/bin/env bun
```

### 1.3 Initialize Bun lockfile
```bash
# Remove old lockfiles
rm -f package-lock.json core/package-lock.json

# Install with Bun (generates text-based bun.lock)
bun install
cd core && bun install

# Review changes before committing (manual git management)
# Note: Bun generates human-readable bun.lock (text format, not binary)
# Verify generated lockfiles with: git status bun.lock core/bun.lock
```

---

## Phase 2: Configuration Updates

**Duration:** 1 day

### 2.1 Create Bun configuration
Create `bunfig.toml` in project root:

```toml
# bunfig.toml - Bun configuration
[install]
# Use hoisted installs (default for compatibility)
hoisted = true

# Lockfile settings
lockfile = true
lockfile-save = true

[run]
# Enable shell scripts
shell = "bash"

[test]
# Use Vitest (retain current setup)
testRunner = "vitest"
```

### 2.2 Update TypeScript config for Bun
Add Bun types to `core/tsconfig.json`:

```json
{
  "compilerOptions": {
    // ... existing options ...
    "types": [
      "bun-types"
    ]
  }
}
```

Install Bun types:
```bash
bun add -d @types/bun
```

### 2.3 Update `langgraph.json` Node version
Update `core/langgraph.json` to specify Bun-compatible Node version:

```json
{
  "node_version": "20",  // Keep as-is; Bun's Node compat layer works well
  "dependencies": ["."],
  "graphs": {
    "bernard_agent": "./src/agents/bernard/bernard.agent.ts:agent",
    "gertrude_agent": "./src/agents/gertrude/gertrude.agent.ts:agent"
  },
  "env": ".env"
}
```

---

## Phase 3: Dependency Management

**Duration:** 2-3 days

### 3.1 Reinstall dependencies with Bun
```bash
# Clean install
rm -rf node_modules core/node_modules

# Install with Bun
bun install
cd core && bun install
```

### 3.2 Verify BullMQ compatibility
**Current status:** Bun.redis doesn't support BullMQ (issue #23629).

**Action:** Keep using `ioredis` package (works via Bun's Node compatibility):

```bash
# ioredis is already in package.json - no change needed
bun add ioredis@^5.8.2
```

**Test BullMQ connectivity:**
```bash
cd core
bun run test
```

If tests fail, consider:
- Fallback to Node.js runtime for BullMQ-dependent code
- Wait for Bun.redis BullMQ support
- Alternative: Use BullMQ with Redis connection via BullMQ's Redis client

### 3.3 Verify Better Auth integration
**Current status:** GitHub issue #6781 - Better Auth fails to build with Bun in Next.js 16.

**Action:** Test in development environment:

```bash
cd core
bun run dev:core
```

**If build fails:**
```bash
# Temporary workaround: Use Node.js for builds
npm run build

# Or wait for Better Auth fix
```

**If build succeeds:**
- Document the version combination that works
- Update AGENTS.md with Bun-specific notes

### 3.4 Update dev dependencies
Review and potentially update dev dependencies:

```bash
cd core
# Keep Vitest (works with Bun)
bun add -d vitest@^2.1.0 @vitest/coverage-v8@^2.1.9 @vitest/ui@^2.1.0

# Update TypeScript (Bun has latest TS compiler)
bun add -d typescript@^5.9.3

# ESLint (works with Bun)
bun add -d eslint@^8.57.0 eslint-config-next@^15.1.0

# Remove tsx (no longer needed)
bun remove tsx
```

---

## Phase 4: Script & Configuration Updates

**Duration:** 1-2 days

### 4.1 Update bash scripts
Update all shell scripts to use `bun` instead of `npm`:

**`scripts/check.sh`:**
```bash
run_check() {
  local name="$1"
  local dir="$2"
  local cmd="$3"
  echo "=== $name ==="
  (cd "$ROOT/$dir" && bun run $cmd)  # Changed from npm run
  # ...
}
```

**`scripts/bernard-agent.sh`:**
```bash
case "$1" in
    start)
        echo "Starting Bernard Agent..."
        bun run agent:bernard  # Changed from npm run
        ;;
    # ...
esac
```

### 4.2 Update TypeScript spawn calls
Review files using `node:child_process`:

**Files with child_process:**
- `core/src/lib/services/ServiceManager.ts` (5 execSync calls)
- `core/src/lib/services/HealthChecker.ts` (2 execSync calls)
- `core/src/lib/services/ProcessManager.ts` (2 execSync calls)

**Action:** These should work via Bun's Node compatibility, but test:
```bash
cd core
bun run test
```

If issues occur, consider using `Bun.spawn()` API for new code.

**Note:** Phase 1 completed successfully (2026-01-23):
- ✅ All package.json scripts updated
- ✅ All TSX shebangs replaced with bun
- ✅ Internal TSX calls updated (dev.ts, ServiceConfig.ts)
- ✅ Bash scripts updated (check.sh, bernard-ui.sh, bernard-agent.sh)
- ✅ Bun lockfiles generated (bun.lock text format at root and core/)
- ✅ @radix-ui/react-label version fixed (^1.0.2 → ^2.0.2)

### 4.3 Update Next.js config
Review `core/next.config.mjs` for Node.js-specific settings:

```javascript
// Current config uses Node.js externals - should be fine with Bun
webpack: (config, { isServer }) => {
  if (isServer) {
    config.externalsPresets = { node: true };
  }
  // ...
}
```

**Test Next.js with Bun:**
```bash
cd core
bun run dev:core
```

---

## Phase 5: Testing & Validation

**Duration:** 2-3 days

### 5.1 Run all tests
```bash
# Root level
bun run check

# Core tests
cd core
bun run test
bun run test:coverage
bun run type-check
```

### 5.2 Test development workflow
```bash
# Start dev server with Bun
bun run dev

# Test services:
# 1. Core dashboard at http://localhost:3456
# 2. Agent startup via queue
# 3. Worker queue processing
# 4. Better Auth authentication
```

### 5.3 Test individual services

**Bernard Agent:**
```bash
cd core
bun run agent:bernard
# Test at http://localhost:2024
```

**Redis:**
```bash
# Redis is Docker-based - no change
docker exec bernard-redis redis-cli ping
```

### 5.4 Performance validation
Compare performance metrics:

| Metric | Node.js | Bun | Improvement |
|---------|----------|-------|-------------|
| Cold start time | TBD | TBD | TBD |
| Install time | TBD | TBD | TBD |
| Test execution | TBD | TBD | TBD |

---

## Phase 6: Production Readiness

**Duration:** 1-2 days

### 6.1 Create Bun-specific Dockerfile (Optional)
If deploying with Bun runtime:

```dockerfile
# Dockerfile.bun (new)
FROM oven/bun:1.3.6-alpine

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source
COPY core ./core
COPY . .

# Build
WORKDIR /app/core
RUN bun run build

# Production start
CMD ["bun", "run", "start"]
```

### 6.2 Update CI/CD (When Configured)
```yaml
# .github/workflows/ci.yml (future)
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run test
```

### 6.3 Update documentation
Update files:
- **AGENTS.md**: Add Bun runtime commands
- **README.md**: Update installation to use Bun
- **core/README.md**: Add Bun-specific setup notes

Example:
```markdown
## Development with Bun

### Installation
```bash
curl -fsSL https://bun.sh/install | bash
bun install
```

### Running
```bash
bun run dev
```
```

---

## Phase 7: Rollback Plan

**Trigger:** If critical issues arise (BullMQ failures, Better Auth build errors)

### Rollback steps (MANUAL git operations):
```bash
# 1. Remove Bun lockfiles
rm -f bun.lock core/bun.lock

# 2. Restore npm lockfiles from git history (if backed up)
# Manual: Use git to restore previous versions:
# git checkout <commit-hash> -- package-lock.json core/package-lock.json

# 3. Reinstall with npm
npm install
cd core && npm install

# 4. Verify
npm run test
```

---

## Phase 8: Post-Migration Optimizations

**Duration:** Ongoing

### 8.1 Consider bun:test migration (Optional)
Vitest works with Bun, but `bun test` may offer better performance:

```bash
# Optional migration to bun:test
bun add -d bun:test
# Update vitest.config.ts to use bun:test runner
```

### 8.2 Leverage Bun-specific features
- **Bun.file()** for efficient file I/O in new code
- **Bun.serve()** for future API services
- **Built-in SQLite** if needed for local caching

### 8.3 Monitor Bun updates
Track Bun releases for:
- BullMQ compatibility fixes (issue #23629)
- Better Auth compatibility improvements
- Next.js integration enhancements

---

## Known Issues & Workarounds

| Issue | Source | Workaround |
|--------|---------|------------|
| BullMQ + Bun.redis | Bun issue #23629 | Keep ioredis; use Node compat layer |
| Better Auth build failure | Better Auth issue #6781 | Build with Node.js or wait for fix |
| HMR with custom Next.js server | Bun + Next.js docs | Use standard Next.js dev mode |
| tsx shebang scripts | Native Bun TS support | Change to `#!/usr/bin/env bun` |

---

## Migration Checklist

### Phase 0
- [ ] Install Bun
- [ ] Create backup branch
- [ ] Review CI/CD (N/A)

### Phase 1
- [x] Update root package.json scripts
- [x] Update core package.json scripts
- [x] Replace tsx shebangs
- [x] Generate bun.lock files (text format)
- Manual: Commit Phase 1 changes after verification

### Phase 2
- [ ] Create bunfig.toml
- [ ] Add @types/bun
- [ ] Update tsconfig.json
- [ ] Update langgraph.json
- Manual: Commit Phase 2 changes after verification

### Phase 3
- [ ] Reinstall dependencies with Bun
- [ ] Test BullMQ connectivity
- [ ] Verify Better Auth build
- [ ] Update dev dependencies
- Manual: Commit Phase 3 changes after verification

### Phase 4
- [ ] Update bash scripts
- [ ] Test child_process calls
- [ ] Test Next.js config
- Manual: Commit Phase 4 changes after verification

### Phase 5
- [ ] Run all tests
- [ ] Test dev workflow
- [ ] Test individual services
- [ ] Validate performance
- Manual: Commit Phase 5 changes after verification

### Phase 6
- [ ] Create Bun Dockerfile (optional)
- [ ] Update CI/CD (when available)
- [ ] Update documentation
- Manual: Commit Phase 6 changes after verification

### Final
- Manual: Merge to main branch after all phases complete
- [ ] Update project documentation
- [ ] Monitor production

---

## Estimated Timeline

| Phase | Duration | Total |
|--------|-----------|--------|
| Phase 0: Prerequisites | 0.5 days | 0.5 days |
| Phase 1: Foundation | 1-2 days | 2 days |
| Phase 2: Configuration | 1 day | 1 day |
| Phase 3: Dependencies | 2-3 days | 3 days |
| Phase 4: Scripts | 1-2 days | 2 days |
| Phase 5: Testing | 2-3 days | 3 days |
| Phase 6: Production | 1-2 days | 2 days |
| **Total** | | **13.5 days (~2-3 weeks)** |

---

## Questions for Decision Making

1. **BullMQ Strategy**: Should we keep ioredis indefinitely or wait for Bun.redis BullMQ support?
2. **Better Auth**: If build fails, is building with Node.js acceptable as a temporary workaround?
3. **Testing**: Should we migrate from Vitest to bun:test for better performance, or keep Vitest for ecosystem compatibility?
4. **Docker**: Do you want to create Bun-based Docker images, or keep using Node.js in production?
5. **Rollback**: What's the acceptable downtime window if rollback is needed?

---

## Project Analysis

### Current Architecture

**Monorepo Structure:**
```
./
├── core/                    # Next.js + LangGraph server (port 3456)
│   ├── src/
│   │   ├── agents/bernard/ # LangGraph agent (port 2024)
│   │   ├── app/api/        # Next.js API routes + service proxying
│   │   ├── components/     # Dashboard components
│   │   ├── hooks/          # Custom React hooks
│   │   └── lib/            # Shared libraries (auth, config, services, infra)
│   └── scripts/            # Dev server, agent starter
├── services/
│   ├── kokoro/             # FastAPI TTS (port 8880) - Python, unchanged
│   └── whisper.cpp/        # Whisper STT (port 8870) - C++, unchanged
└── scripts/                # Service management scripts
```

### Key Dependencies

**Production Dependencies:**
- `@langchain/langgraph: ^1.0.7` - Agent framework
- `better-auth: ^1.4.13` - Authentication ⚠️ Known Bun issue
- `ioredis: ^5.8.2` - Redis client (works with Bun compat)
- `bullmq: ^5.66.0` - Job queue ⚠️ ioredis dependency
- `next: ^15.1.0` - Next.js framework
- `react: ^18.2.0` - React
- `langchain: ^1.2.10` - LLM integration
- `zod: ^4.3.4` - Validation

**Dev Dependencies:**
- `vitest: ^2.1.0` - Test runner (works with Bun)
- `typescript: ^5.9.3` - TypeScript
- `tsx: ^4.21.0` - TypeScript runner (to be removed)
- `eslint: ^8.57.0` - Linting

### Node.js APIs in Use

**Files using `node:` protocol:**
- `core/src/lib/logging/logger.ts` - node:crypto
- `core/src/lib/auth/tokenStore.ts` - node:crypto
- `core/src/lib/config/settingsStore.ts` - node:fs, node:path
- `core/src/lib/services/ServiceManager.ts` - node:child_process (5 calls)
- `core/src/lib/services/LogStreamer.ts` - node:fs
- `core/src/lib/config/appSettings.ts` - node:fs, node:path, node:crypto
- `core/src/lib/services/HealthChecker.ts` - node:child_process (2 calls), node:http
- `core/src/lib/services/ProcessManager.ts` - node:child_process (2 calls)
- `core/src/lib/checkpoint/serde.ts` - Serialization logic

**All these should work via Bun's Node compatibility layer.**

### Scripts Requiring Updates

**TypeScript scripts (shebang change):**
- `core/scripts/dev.ts` (354 lines)
- `core/scripts/start-agent.ts` (53 lines)
- `core/scripts/worker.ts` (38 lines)

**Bash scripts (npm → bun):**
- `scripts/check.sh`
- `scripts/bernard-agent.sh`
- `scripts/bernard-ui.sh`

---

## References

- [Bun Documentation](https://bun.sh/docs)
- [Bun + Next.js Guide](https://bun.com/docs/guides/ecosystem/nextjs)
- [BullMQ Bun Support Issue #23629](https://github.com/oven-sh/bun/issues/23629)
- [Better Auth Bun Issue #6781](https://github.com/better-auth/better-auth/issues/6781)
- [Bun TypeScript Support](https://bun.sh/docs/runtime/typescript)
- [Bun Runtime](https://bun.sh/docs/runtime)
- [Bun Package Manager](https://bun.sh/docs/install)

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-01-22 | Initial migration plan |
| 1.1.0 | 2026-01-23 | Phase 1 complete, git management updated to manual only, Phase 1 tasks marked complete |
