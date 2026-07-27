import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");

const requiredFragments = [
  "cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}",
  "production-deploy:",
  "if: github.event_name == 'push' && github.ref == 'refs/heads/main'",
  "- worker-frontend-e2e",
  "- frontend",
  "CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
  "CLOUDFLARE_PAGES_PROJECT_NAME: ${{ secrets.CLOUDFLARE_PAGES_PROJECT_NAME }}",
  "CLOUDFLARE_WORKER_NAME: ${{ secrets.CLOUDFLARE_PRODUCTION_WORKER_NAME }}",
  "CLOUDFLARE_INGRESS_RATE_LIMIT_NAMESPACE_ID: ${{ secrets.CLOUDFLARE_PRODUCTION_INGRESS_RATE_LIMIT_NAMESPACE_ID }}",
  "CLOUDFLARE_READ_RATE_LIMIT_NAMESPACE_ID: ${{ secrets.CLOUDFLARE_PRODUCTION_READ_RATE_LIMIT_NAMESPACE_ID }}",
  "CLOUDFLARE_WRITE_RATE_LIMIT_NAMESPACE_ID: ${{ secrets.CLOUDFLARE_PRODUCTION_WRITE_RATE_LIMIT_NAMESPACE_ID }}",
  "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
  "run: npm run deploy:production",
  "run: npm run deploy:pages:production",
];
for (const fragment of requiredFragments) assert.equal(workflow.includes(fragment), true, fragment);

assert.equal(workflow.includes("environment: production"), false);
assert.equal(workflow.includes("vars.CLOUDFLARE_"), false);
assert.equal(workflow.indexOf("run: npm run deploy:production") < workflow.indexOf("run: npm run deploy:pages:production"), true);

process.stdout.write("Cloudflare production CI/CD workflow contract verified.\n");
