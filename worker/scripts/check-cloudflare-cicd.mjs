import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = (await readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"))
  .replace(/\r\n/g, "\n");

const requiredFragments = [
  "pull_request:\n    branches:\n      - main\n  push:\n    branches:\n      - main",
  "cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}",
  "production-deploy:",
  "if: github.event_name == 'push' && github.ref == 'refs/heads/main'",
  "- worker-frontend-e2e",
  "CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
  "CLOUDFLARE_PRODUCTION_ORIGIN: ${{ secrets.CLOUDFLARE_PRODUCTION_ORIGIN }}",
  "CLOUDFLARE_WORKER_NAME: ${{ secrets.CLOUDFLARE_PRODUCTION_WORKER_NAME }}",
  "CLOUDFLARE_INGRESS_RATE_LIMIT_NAMESPACE_ID: ${{ secrets.CLOUDFLARE_PRODUCTION_INGRESS_RATE_LIMIT_NAMESPACE_ID }}",
  "CLOUDFLARE_READ_RATE_LIMIT_NAMESPACE_ID: ${{ secrets.CLOUDFLARE_PRODUCTION_READ_RATE_LIMIT_NAMESPACE_ID }}",
  "CLOUDFLARE_WRITE_RATE_LIMIT_NAMESPACE_ID: ${{ secrets.CLOUDFLARE_PRODUCTION_WRITE_RATE_LIMIT_NAMESPACE_ID }}",
  "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
  "NEON_MIGRATION_DATABASE_URL: ${{ secrets.NEON_MIGRATION_DATABASE_URL }}",
  "NEON_MIGRATION_EXPECTED_HOST: ${{ secrets.NEON_MIGRATION_EXPECTED_HOST }}",
  "NEON_MIGRATION_EXPECTED_DATABASE: ${{ secrets.NEON_MIGRATION_EXPECTED_DATABASE }}",
  "NEON_MIGRATION_EXPECTED_ROLE: ${{ secrets.NEON_MIGRATION_EXPECTED_ROLE }}",
  "run: npm run migrate:production:preflight",
  "run: npm run migrate:production:apply",
  "run: npm run migrate:production:verify",
  "run: npm run build",
  "run: npm run deploy:production",
  "run: npm run deploy:smoke:production",
];
for (const fragment of requiredFragments) assert.equal(workflow.includes(fragment), true, fragment);

assert.equal(workflow.includes("environment: production"), false);
assert.equal(workflow.includes("vars.CLOUDFLARE_"), false);
assert.equal(workflow.includes("backend-test:"), false);
assert.equal(workflow.includes("actions/setup-java"), false);
assert.equal(workflow.includes("NEON_MIGRATION_DATABASE_URL:"), true);
assert.equal(
  workflow.indexOf("run: npm run migrate:production:preflight")
    < workflow.indexOf("run: npm run migrate:production:apply"),
  true,
);
assert.equal(
  workflow.indexOf("run: npm run migrate:production:apply")
    < workflow.indexOf("run: npm run migrate:production:verify"),
  true,
);
assert.equal(
  workflow.indexOf("run: npm run migrate:production:verify")
    < workflow.indexOf("run: npm run deploy:production"),
  true,
);
assert.equal(
  workflow.indexOf("run: npm run deploy:production")
    < workflow.indexOf("run: npm run deploy:smoke:production"),
  true,
);
assert.equal(workflow.includes("deploy:pages:production"), false);
assert.equal(workflow.includes("test:functions"), false);

process.stdout.write("Cloudflare production CI/CD workflow contract verified.\n");
