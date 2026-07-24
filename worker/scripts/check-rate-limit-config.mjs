import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const uat = config.env?.uat?.ratelimits ?? [];
const production = config.env?.production?.ratelimits ?? [];

assert.deepEqual(uat, [
  {
    name: "INGRESS_GUARD_RATE_LIMITER",
    namespace_id: "2026072305",
    simple: { limit: 600, period: 60 },
  },
  {
    name: "PUBLIC_READ_RATE_LIMITER",
    namespace_id: "2026072301",
    simple: { limit: 120, period: 60 },
  },
  {
    name: "PUBLIC_WRITE_RATE_LIMITER",
    namespace_id: "2026072302",
    simple: { limit: 24, period: 60 },
  },
]);
assert.deepEqual(production, [
  {
    name: "INGRESS_GUARD_RATE_LIMITER",
    namespace_id: "2026072306",
    simple: { limit: 600, period: 60 },
  },
  {
    name: "PUBLIC_READ_RATE_LIMITER",
    namespace_id: "2026072303",
    simple: { limit: 120, period: 60 },
  },
  {
    name: "PUBLIC_WRITE_RATE_LIMITER",
    namespace_id: "2026072304",
    simple: { limit: 24, period: 60 },
  },
]);

const namespaceIds = [...uat, ...production].map((binding) => binding.namespace_id);
assert.equal(new Set(namespaceIds).size, 6);
assert.equal(namespaceIds.every((id) => /^[1-9][0-9]*$/.test(id)), true);
assert.equal(config.workers_dev, false);
assert.equal(config.preview_urls, false);
assert.equal(config.env.uat.workers_dev, false);
assert.equal(config.env.uat.preview_urls, false);
assert.equal(config.env.production.workers_dev, false);
assert.equal(config.env.production.preview_urls, false);
assert.equal("routes" in config.env.production, false);

process.stdout.write("Rate-limit namespaces and production ingress config verified.\n");
