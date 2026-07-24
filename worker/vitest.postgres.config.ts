import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/postgres/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
