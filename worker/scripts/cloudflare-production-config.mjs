import { deploymentValuesFromEnv } from "./wrangler-config.mjs";

function requireAccountId(value) {
  const normalized = value?.trim();
  if (!normalized) throw new Error("CLOUDFLARE_ACCOUNT_ID is required");
  if (!/^[a-f0-9]{32}$/i.test(normalized)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID must be a valid account identifier");
  }
  return normalized;
}

export function productionOriginFromEnv(env = process.env) {
  const value = env.CLOUDFLARE_PRODUCTION_ORIGIN;
  const normalized = value?.trim();
  if (!normalized) throw new Error("CLOUDFLARE_PRODUCTION_ORIGIN is required");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("CLOUDFLARE_PRODUCTION_ORIGIN must be a valid HTTPS Worker origin");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
    || !parsed.hostname.endsWith(".workers.dev")
    || parsed.hostname.split(".").length < 4
  ) {
    throw new Error("CLOUDFLARE_PRODUCTION_ORIGIN must be a valid HTTPS Worker origin");
  }
  return parsed.origin;
}

function requireApiToken(value) {
  const normalized = value?.trim();
  if (!normalized) throw new Error("CLOUDFLARE_API_TOKEN is required");
  return normalized;
}

export function productionCloudflareValuesFromEnv(env = process.env) {
  const deployment = deploymentValuesFromEnv(env);
  const productionOrigin = productionOriginFromEnv(env);
  if (new URL(productionOrigin).hostname.split(".", 1)[0] !== deployment.workerName) {
    throw new Error("CLOUDFLARE_PRODUCTION_ORIGIN must match CLOUDFLARE_WORKER_NAME");
  }
  return {
    accountId: requireAccountId(env.CLOUDFLARE_ACCOUNT_ID),
    productionOrigin,
    apiToken: requireApiToken(env.CLOUDFLARE_API_TOKEN),
    ...deployment,
  };
}
