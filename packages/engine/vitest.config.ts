import { defineConfig } from 'vitest/config';

// Own config so vitest does not pick up the app's vite.config.ts (React Router plugin) from the repo root.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
