import assert from "node:assert/strict";
import { productionCloudflareValuesFromEnv } from "./cloudflare-production-config.mjs";
import { disposableUatOriginFromEnv } from "./cloudflare-uat-origin.mjs";

const valid = Object.freeze({
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_PRODUCTION_ORIGIN: "https://worker-placeholder.example.workers.dev",
  CLOUDFLARE_API_TOKEN: "token-placeholder",
  CLOUDFLARE_WORKER_NAME: "worker-placeholder",
  CLOUDFLARE_INGRESS_RATE_LIMIT_NAMESPACE_ID: "1",
  CLOUDFLARE_READ_RATE_LIMIT_NAMESPACE_ID: "2",
  CLOUDFLARE_WRITE_RATE_LIMIT_NAMESPACE_ID: "3",
});

assert.deepEqual(productionCloudflareValuesFromEnv(valid), {
  accountId: valid.CLOUDFLARE_ACCOUNT_ID,
  productionOrigin: valid.CLOUDFLARE_PRODUCTION_ORIGIN,
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
  () => productionCloudflareValuesFromEnv({ ...valid, CLOUDFLARE_PRODUCTION_ORIGIN: "http://example.workers.dev/path" }),
  /valid HTTPS Worker origin/,
);
assert.throws(
  () => productionCloudflareValuesFromEnv({
    ...valid,
    CLOUDFLARE_PRODUCTION_ORIGIN: "https://different-worker.example.workers.dev",
  }),
  /must match CLOUDFLARE_WORKER_NAME/,
);
assert.throws(
  () => productionCloudflareValuesFromEnv({
    ...valid,
    CLOUDFLARE_READ_RATE_LIMIT_NAMESPACE_ID: "1",
  }),
  /must be distinct/,
);

assert.equal(disposableUatOriginFromEnv({
  P4_UAT_CONFIRM_DISPOSABLE: "true",
  CLOUDFLARE_WORKER_NAME: "worker-uat-validation",
  CLOUDFLARE_UAT_ORIGIN: "https://worker-uat-validation.example.workers.dev",
}), "https://worker-uat-validation.example.workers.dev");
assert.throws(
  () => disposableUatOriginFromEnv({
    P4_UAT_CONFIRM_DISPOSABLE: "true",
    CLOUDFLARE_WORKER_NAME: "worker-production",
    CLOUDFLARE_UAT_ORIGIN: "https://worker-production.example.workers.dev",
  }),
  /disposable UAT Worker/,
);

process.stdout.write("Cloudflare production deployment input validation verified.\n");
