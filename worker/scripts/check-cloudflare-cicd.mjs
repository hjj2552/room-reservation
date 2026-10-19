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

function job(id) {
  const body = workflow.split(`\n  ${id}:\n`)[1]?.split(/\n  [\w-]+:\n/)[0];
  assert.ok(body, `Missing CI job: ${id}`);
  return body;
}

const shards = job("worker-frontend-e2e-shard");
for (const fragment of [
  "needs: worker-validation",
  "runs-on: ubuntu-latest",
  "fail-fast: false",
  "shard: [1, 2]",
  "run: npm run test:local-e2e -- --shard=${{ matrix.shard }}/2",
  "name: worker-playwright-report-${{ matrix.shard }}",
  "name: worker-e2e-test-results-${{ matrix.shard }}",
]) assert.ok(shards.includes(fragment), fragment);
assert.equal(shards.match(/if: always\(\)/g)?.length, 2, "Upload both artifacts even on failure");
assert.equal(shards.includes("continue-on-error"), false);
assert.equal(shards.split("    steps:")[0].includes("if:"), false);

const aggregate = job("worker-frontend-e2e");
for (const fragment of [
  "name: Frontend E2E against Worker",
  "if: always()",
  "needs:\n      - worker-validation\n      - worker-frontend-e2e-shard",
  "WORKER_RESULT: ${{ needs.worker-validation.result }}",
  "E2E_RESULT: ${{ needs.worker-frontend-e2e-shard.result }}",
  'run: test "$WORKER_RESULT" = success && test "$E2E_RESULT" = success',
]) assert.ok(aggregate.includes(fragment), fragment);
assert.equal(aggregate.includes("continue-on-error"), false);
const deploy = job("production-deploy");
assert.ok(deploy.includes("needs:\n      - worker-frontend-e2e"));
assert.equal(deploy.includes("always()"), false);

const localRunner = await readFile(new URL("./run-local-e2e.mjs", import.meta.url), "utf8");
const frontendRunner = await readFile(new URL("../../frontend/scripts/run-e2e.mjs", import.meta.url), "utf8");
const playwrightConfig = await readFile(new URL("../../frontend/playwright.config.ts", import.meta.url), "utf8");
assert.ok(localRunner.includes('["scripts/run-e2e.mjs", ...process.argv.slice(2)]'));
assert.ok(frontendRunner.includes("[playwrightCli, 'test', ...process.argv.slice(2)]"));
assert.ok(playwrightConfig.includes("workers: 1,"));
assert.ok(playwrightConfig.includes("fullyParallel: false,"));

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
