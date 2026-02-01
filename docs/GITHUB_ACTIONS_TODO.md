# GitHub Actions Fixes Needed

## Current Status

CI is failing with TypeScript errors in test files. The tests themselves run fine with `bun test` but fail the `typecheck` step.

## The Problem

Test files use vitest mocks but TypeScript doesn't recognize mock methods like `.mockResolvedValue()`, `.mockClear()`, etc. on the imported functions.

### Example Error
```
src/backend/capture/decoders/apt-decoder.spec.ts(37,18): error TS2339:
Property 'mockResolvedValue' does not exist on type '(path: string) => Promise<boolean>'.
```

## Files Affected

- `src/backend/capture/decoders/apt-decoder.spec.ts`
- `src/backend/capture/decoders/sstv-decoder.spec.ts`
- `src/middleware/web/globe-service.spec.ts`

## Solutions

### Option 1: Add Type Casts (Quick Fix)
Add `@ts-expect-error` or cast mocks:
```typescript
// Before
fileExists.mockResolvedValue(false)

// After
(fileExists as any).mockResolvedValue(false)
// or
// @ts-expect-error - vitest mock
fileExists.mockResolvedValue(false)
```

### Option 2: Use Proper Mock Types (Better)
Import and use vitest's mock types:
```typescript
import { vi, type MockedFunction } from 'vitest'

vi.mock('../../utils/fs', () => ({
  ensureDir: vi.fn(() => Promise.resolve()),
  fileExists: vi.fn(() => Promise.resolve(true)),
}))

import type { fileExists as fileExistsType } from '../../utils/fs'
const fileExists = vi.mocked<typeof fileExistsType>(
  (await import('../../utils/fs')).fileExists
)
```

### Option 3: Skip Typecheck for Test Files
Update `tsconfig.json` to exclude test files from strict checking, or update CI to skip typecheck on `**.spec.ts` files.

## Recommendation

**Option 1** is fastest - just add `@ts-expect-error` comments above each mock method call. The tests work fine at runtime, this is purely a type-checking issue.

## What Was Already Fixed

- Removed `vi.mocked()` calls (function doesn't exist in our vitest version)
- Changed from `vi.mocked(fn).mockX()` to `fn.mockX()`
- Fixed waterfall capture overlay
- Cleaned up repo structure
- Updated documentation

## To Fix CI

1. Add `@ts-expect-error` comments to all mock method calls in test files
2. Or update CI workflow to skip typecheck (not recommended)
3. Or properly type the mocks (most work, best long-term solution)

---
*Created: 2026-02-01*
*Vibe coded with Claude*
