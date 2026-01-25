import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/backend/**/*.ts', 'src/middleware/**/*.ts'],
      exclude: ['src/backend/cli/**', '**/*.d.ts', '**/*.spec.ts'],
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
