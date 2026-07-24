import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

process.env.WRANGLER_WRITE_LOGS = "false";

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-07-20",
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          APP_ENV: "local",
          DATABASE_URL: "postgresql://p3.invalid/p3",
          E2E_CLEANUP_ENABLED: "false",
        },
      },
    }),
  ],
  test: {
    include: ["tests/worker/**/*.test.ts"],
  },
});
