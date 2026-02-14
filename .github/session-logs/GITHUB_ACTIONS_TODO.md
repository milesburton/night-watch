# GitHub Actions CI Fix TODO

**Status:** In Progress  
**Priority:** Medium (tests pass at runtime, only type-checking fails)

## Problem

TypeScript type-checking in CI fails for test files using vitest mocks, even though tests run successfully.

### Error Example
```
src/backend/capture/decoders/apt-decoder.spec.ts(37,18): error TS2339:
Property 'mockResolvedValue' does not exist on type '(path: string) => Promise<boolean>'.
```

### Affected Files
- `src/backend/capture/decoders/apt-decoder.spec.ts`
- `src/backend/capture/decoders/sstv-decoder.spec.ts`
- `src/middleware/web/globe-service.spec.ts`

## Solutions (in order of preference)

### Option 1: Add Type Casts ⚡ (Quick, 10 min)
Add `@ts-expect-error` comments above mock method calls. Tests work fine at runtime; this is purely a type-checking issue.

```typescript
// @ts-expect-error - vitest mock
fileExists.mockResolvedValue(false)
```

### Option 2: Proper Mock Types (Better, 30+ min)
Use vitest's MockedFunction types for type-safe mocks.

```typescript
import { vi, type MockedFunction } from 'vitest'
const fileExists = vi.mocked<typeof fileExistsType>(...)
```

### Option 3: Skip Type Checking (Not Recommended)
Configure tsconfig to exclude test files or update CI workflow.

## Recommendation

**Go with Option 1** - Quick fix, works perfectly, tests are already correct at runtime. Once time permits, upgrade to Option 2 for better type safety.

## What's Already Done

- Removed `vi.mocked()` calls (not available in our vitest version)
- Changed mocks from `vi.mocked(fn).mockX()` to `fn.mockX()`
- Fixed waterfall capture overlay
- Cleaned up repo structure
- Updated documentation

---
**Created:** Feb 1, 2026  
**For:** Future CI fixes
