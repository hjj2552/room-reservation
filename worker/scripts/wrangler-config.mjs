import { readFile } from "node:fs/promises";

export const WRANGLER_PLACEHOLDERS = Object.freeze({
  workerName: "<worker-name>",
  ingressNamespaceId: "<ingress-rate-limit-namespace-id>",
  readNamespaceId: "<read-rate-limit-namespace-id>",
  writeNamespaceId: "<write-rate-limit-namespace-id>",
});

const namespaceByBinding = Object.freeze({
  INGRESS_GUARD_RATE_LIMITER: "ingressNamespaceId",
  PUBLIC_READ_RATE_LIMITER: "readNamespaceId",
  PUBLIC_WRITE_RATE_LIMITER: "writeNamespaceId",
});

export async function readWranglerTemplate() {
  return JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
}

function requireWorkerName(value) {
  const normalized = value?.trim();
  if (!normalized) throw new Error("CLOUDFLARE_WORKER_NAME is required");
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(normalized)) {
    throw new Error("CLOUDFLARE_WORKER_NAME must be a valid Worker name");
  }
  return normalized;
}

function requireNamespaceId(name, value) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Error(`${name} must be a positive integer string`);
  }
  return normalized;
}

export function deploymentValuesFromEnv(env = process.env) {
  const values = {
    workerName: requireWorkerName(env.CLOUDFLARE_WORKER_NAME),
    ingressNamespaceId: requireNamespaceId(
      "CLOUDFLARE_INGRESS_RATE_LIMIT_NAMESPACE_ID",
      env.CLOUDFLARE_INGRESS_RATE_LIMIT_NAMESPACE_ID,
    ),
    readNamespaceId: requireNamespaceId(
      "CLOUDFLARE_READ_RATE_LIMIT_NAMESPACE_ID",
      env.CLOUDFLARE_READ_RATE_LIMIT_NAMESPACE_ID,
    ),
    writeNamespaceId: requireNamespaceId(
      "CLOUDFLARE_WRITE_RATE_LIMIT_NAMESPACE_ID",
      env.CLOUDFLARE_WRITE_RATE_LIMIT_NAMESPACE_ID,
    ),
  };
  const namespaceIds = [values.ingressNamespaceId, values.readNamespaceId, values.writeNamespaceId];
  if (new Set(namespaceIds).size !== namespaceIds.length) {
    throw new Error("Cloudflare Rate Limiting namespace IDs must be distinct");
  }
  return values;
}

export function materializeWranglerConfig(template, environment, values, mainPath) {
  if (environment !== "uat" && environment !== "production") {
    throw new Error("Worker environment must be uat or production");
  }
  const config = structuredClone(template);
  const selected = config.env?.[environment];
  if (!selected) throw new Error(`Wrangler template is missing env.${environment}`);
  if (selected.name !== WRANGLER_PLACEHOLDERS.workerName) {
    throw new Error(`Wrangler env.${environment}.name is not the expected placeholder`);
  }
  selected.name = values.workerName;
  for (const binding of selected.ratelimits ?? []) {
    const valueKey = namespaceByBinding[binding.name];
    if (!valueKey) throw new Error(`Unexpected rate-limit binding: ${binding.name}`);
    if (binding.namespace_id !== WRANGLER_PLACEHOLDERS[valueKey]) {
      throw new Error(`Rate-limit binding ${binding.name} is not the expected placeholder`);
    }
    binding.namespace_id = values[valueKey];
  }
  if ((selected.ratelimits ?? []).length !== Object.keys(namespaceByBinding).length) {
    throw new Error(`Wrangler env.${environment} must define all three rate-limit bindings`);
  }
  config.env = { [environment]: selected };
  if (mainPath) config.main = mainPath;
  delete config.$schema;
  return config;
}
