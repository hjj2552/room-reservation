import assert from "node:assert/strict";
import { productionCloudflareValuesFromEnv } from "./cloudflare-production-config.mjs";

const valid = Object.freeze({
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_PAGES_PROJECT_NAME: "pages-project-placeholder",
  CLOUDFLARE_API_TOKEN: "token-placeholder",
  CLOUDFLARE_WORKER_NAME: "worker-placeholder",
  CLOUDFLARE_INGRESS_RATE_LIMIT_NAMESPACE_ID: "1",
  CLOUDFLARE_READ_RATE_LIMIT_NAMESPACE_ID: "2",
  CLOUDFLARE_WRITE_RATE_LIMIT_NAMESPACE_ID: "3",
});

assert.deepEqual(productionCloudflareValuesFromEnv(valid), {
  accountId: valid.CLOUDFLARE_ACCOUNT_ID,
  pagesProjectName: valid.CLOUDFLARE_PAGES_PROJECT_NAME,
  apiToken: valid.CLOUDFLARE_API_TOKEN,
  workerName: valid.CLOUDFLARE_WORKER_NAME,
  ingressNamespaceId: "1",
  readNamespaceId: "2",
  writeNamespaceId: "3",
});

for (const name of Object.keys(valid)) {
  assert.throws(
    () => productionCloudflareValuesFromEnv({ ...valid, [name]: "" }),
    new RegExp(`${name} is required`),
  );
}
assert.throws(
  () => productionCloudflareValuesFromEnv({ ...valid, CLOUDFLARE_ACCOUNT_ID: "invalid" }),
  /valid account identifier/,
);
assert.throws(
  () => productionCloudflareValuesFromEnv({ ...valid, CLOUDFLARE_PAGES_PROJECT_NAME: "Invalid Project" }),
  /valid Pages project name/,
);
assert.throws(
  () => productionCloudflareValuesFromEnv({
    ...valid,
    CLOUDFLARE_READ_RATE_LIMIT_NAMESPACE_ID: "1",
  }),
  /must be distinct/,
);

process.stdout.write("Cloudflare production deployment input validation verified.\n");
