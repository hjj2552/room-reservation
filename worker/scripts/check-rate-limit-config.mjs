import assert from "node:assert/strict";
import {
  deploymentValuesFromEnv,
  materializeWranglerConfig,
  readWranglerTemplate,
  WRANGLER_PLACEHOLDERS,
} from "./wrangler-config.mjs";

const config = await readWranglerTemplate();
const expectedBindings = [
  {
    name: "INGRESS_GUARD_RATE_LIMITER",
    namespace_id: WRANGLER_PLACEHOLDERS.ingressNamespaceId,
    simple: { limit: 600, period: 60 },
  },
  {
    name: "PUBLIC_READ_RATE_LIMITER",
    namespace_id: WRANGLER_PLACEHOLDERS.readNamespaceId,
    simple: { limit: 120, period: 60 },
  },
  {
    name: "PUBLIC_WRITE_RATE_LIMITER",
    namespace_id: WRANGLER_PLACEHOLDERS.writeNamespaceId,
    simple: { limit: 24, period: 60 },
  },
];

for (const environment of ["uat", "production"]) {
  assert.equal(config.env?.[environment]?.name, WRANGLER_PLACEHOLDERS.workerName);
  assert.deepEqual(config.env?.[environment]?.ratelimits, expectedBindings);
  assert.equal(config.env[environment].workers_dev, false);
  assert.equal(config.env[environment].preview_urls, false);
  assert.equal("routes" in config.env[environment], false);
}

const deploymentValues = deploymentValuesFromEnv({
  CLOUDFLARE_WORKER_NAME: "worker-validation-placeholder",
  CLOUDFLARE_INGRESS_RATE_LIMIT_NAMESPACE_ID: "1",
  CLOUDFLARE_READ_RATE_LIMIT_NAMESPACE_ID: "2",
  CLOUDFLARE_WRITE_RATE_LIMIT_NAMESPACE_ID: "3",
});
const rendered = materializeWranglerConfig(config, "production", deploymentValues, "src/index.ts");
assert.deepEqual(Object.keys(rendered.env), ["production"]);
assert.equal(rendered.env.production.name, "worker-validation-placeholder");
assert.deepEqual(
  rendered.env.production.ratelimits.map((binding) => binding.namespace_id),
  ["1", "2", "3"],
);
assert.throws(() => deploymentValuesFromEnv({}), /CLOUDFLARE_WORKER_NAME is required/);
assert.throws(
  () => deploymentValuesFromEnv({
    CLOUDFLARE_WORKER_NAME: "worker-validation-placeholder",
    CLOUDFLARE_INGRESS_RATE_LIMIT_NAMESPACE_ID: "1",
    CLOUDFLARE_READ_RATE_LIMIT_NAMESPACE_ID: "1",
    CLOUDFLARE_WRITE_RATE_LIMIT_NAMESPACE_ID: "3",
  }),
  /must be distinct/,
);

assert.equal(config.workers_dev, false);
assert.equal(config.preview_urls, false);

process.stdout.write("Rate-limit policy and environment-based deployment config verified.\n");
