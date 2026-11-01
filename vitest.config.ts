import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'services/**/*.test.ts',
      'providers/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
  },
});

