# ADR-001: Node.js Runtime (Bun → Node.js Migration)

**Date:** February 6, 2026  
**Status:** Implemented

## Problem

Night Watch originally used the Bun runtime for its speed and modern TypeScript support. However, deployment to Raspberry Pi 4 (Cortex-A72) failed with "Illegal instruction" crashes.

**Root Cause:**
Bun's ARM build uses CPU instructions (likely ARMv8.2+ SIMD extensions) not available on the Raspberry Pi 4's Cortex-A72 processor (ARMv8.0-A).

**Impact:**
- SatDump (METEOR LRPT decoder) will not run in Docker with Bun on Pi 4
- This is the primary signal source for the system
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

## Results

**Build times:**
- Frontend build with Vite: No difference (uses same bundler)
- Docker image build: ~10% slower (npm vs bun install)
- **Verdict:** Acceptable trade-off

**Development experience:**
- Bun startup: ~50ms
- Node.js + tsx startup: ~100-150ms
- **Verdict:** Minimal impact for the improved compatibility

## Files Changed

- `Dockerfile.base` - Node.js 22.x installation
- `Dockerfile.app` - npm install commands
- `package.json` - npm scripts
- `.github/workflows/*.yml` - CI/CD Node.js setup
- All documentation

## References

- [Node.js Releases](https://nodejs.org/en/)
- [NodeSource Repository](https://github.com/nodesource/distributions)
- [Raspberry Pi 4 Specs](https://www.raspberrypi.com/products/raspberry-pi-4-model-b/specifications/)
