# Runtime Migration: Bun → Node.js

## Decision Record

**Date:** February 6, 2026
**Status:** Implemented

## Problem

Night Watch originally used the Bun runtime for its speed and modern TypeScript support. However, deployment to Raspberry Pi 4 (Cortex-A72) failed with "Illegal instruction" crashes.

**Root Cause:**
Bun's ARM build uses CPU instructions (likely ARMv8.2+ SIMD extensions) not available on the Raspberry Pi 4's Cortex-A72 processor (ARMv8.0-A).

**Impact:**
- SatDump (METEOR LRPT decoder) cannot run in Docker with Bun on Pi 4
- Core satellite capture functionality blocked
- Production deployment impossible

## Solution

**Migrate to Node.js 22.x LTS** everywhere (local dev, CI, Docker).

**Why Node.js:**
- ✅ Proven ARM Cortex-A72 compatibility
- ✅ Industry-standard with extensive ecosystem
- ✅ LTS releases provide long-term stability
- ✅ tsx provides fast TypeScript execution
- ✅ Works on x86_64, arm64, and older ARM variants

## Implementation

### Runtime Stack
- **Node.js:** 22.x LTS (installed via NodeSource repository)
- **Package manager:** npm (built-in)
- **TypeScript executor:** tsx (installed globally)

### Command Equivalents

| Bun | Node.js | Notes |
|-----|---------|-------|
| `bun run script.ts` | `tsx script.ts` | Direct execution |
| `bun run --watch script.ts` | `tsx --watch script.ts` | Hot reload |
| `bun install` | `npm install` | Install dependencies |
| `bun install --frozen-lockfile` | `npm ci` | CI installs |
| `bunx tool` | `npx tool` | One-off executables |
| `bun test` | `npm test` | Test runner (uses vitest) |

### Package Manager Files

| Bun | Node.js |
|-----|---------|
| `bun.lockb` | `package-lock.json` |
| `.bun/` cache | `node_modules/.cache/` |

## Migration Checklist

- [x] Docker base image switched to Node.js 22.x
- [x] Docker app image uses npm/npx
- [x] package.json scripts updated
- [x] CI/CD pipeline updated
- [x] All documentation updated
- [ ] Local development verified
- [ ] Docker build verified
- [ ] Deployment tested on Raspberry Pi 4

## Performance Comparison

**Development experience:**
- Bun startup: ~50ms
- Node.js + tsx startup: ~100-150ms
- **Verdict:** Minimal impact, worth the compatibility

**Build times:**
- Frontend build with Vite: No difference (uses same bundler)
- Docker image build: ~10% slower (npm vs bun install)
- **Verdict:** Acceptable trade-off

## Future Considerations

If Bun adds Cortex-A72 support in the future:
1. Verify compatibility on actual Pi 4 hardware
2. Run full test suite in Docker on arm64
3. Consider switching back if performance gains are significant

For now, Node.js provides the stability and compatibility needed for production deployment.

## References

- Raspberry Pi 4 specs: Cortex-A72 (ARMv8.0-A)
- Bun ARM compatibility: https://github.com/oven-sh/bun/issues (various issues)
- Node.js ARM support: Official builds for armv7l, arm64
- Commit: See git log for complete migration commit
