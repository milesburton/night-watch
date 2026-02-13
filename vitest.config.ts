import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: [],
    setupFiles: ['src/test-setup.ts'],
    restoreMocks: true,
    mockReset: true,
    isolate: true,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/backend/**/*.ts', 'src/middleware/**/*.ts'],
      exclude: [
        // Test files
        '**/*.spec.ts',
        '**/*.d.ts',

        // CLI (entry points - should be tested via integration tests)
        'src/backend/cli/**',
        'src/backend/index.ts',

        // Infrastructure (should be tested via integration tests)
        'src/middleware/web/server.ts',
        'src/backend/sdr-client/**',
        'src/backend/capture/*-provider.ts', // All SDR providers

        // Thin wrappers/compatibility shims
        'src/backend/utils/node-compat.ts',
        'src/backend/utils/logger.ts',
      ],
    },
    testTimeout: 10_000,
    server: {
      deps: {
        inline: ['zod'],
      },
    },
  },
  resolve: {
    alias: {
      '@backend': resolve(__dirname, 'src/backend'),
      '@middleware': resolve(__dirname, 'src/middleware'),
      '@': resolve(__dirname, 'src'),
    },
  },
})
