import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/app.js', 'src/db.js'],
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: { branches: 10, functions: 10, lines: 10, statements: 10 }
    }
  }
});
