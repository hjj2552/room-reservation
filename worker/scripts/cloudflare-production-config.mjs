import { deploymentValuesFromEnv } from "./wrangler-config.mjs";

function requireAccountId(value) {
  const normalized = value?.trim();
  if (!normalized) throw new Error("CLOUDFLARE_ACCOUNT_ID is required");
  if (!/^[a-f0-9]{32}$/i.test(normalized)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID must be a valid account identifier");
  }
  return normalized;
}

function requirePagesProjectName(value) {
  const normalized = value?.trim();
  if (!normalized) throw new Error("CLOUDFLARE_PAGES_PROJECT_NAME is required");
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(normalized)) {
    throw new Error("CLOUDFLARE_PAGES_PROJECT_NAME must be a valid Pages project name");
  }
  return normalized;
}

function requireApiToken(value) {
  const normalized = value?.trim();
  if (!normalized) throw new Error("CLOUDFLARE_API_TOKEN is required");
  return normalized;
}

export function productionCloudflareValuesFromEnv(env = process.env) {
  return {
    accountId: requireAccountId(env.CLOUDFLARE_ACCOUNT_ID),
    pagesProjectName: requirePagesProjectName(env.CLOUDFLARE_PAGES_PROJECT_NAME),
    apiToken: requireApiToken(env.CLOUDFLARE_API_TOKEN),
    ...deploymentValuesFromEnv(env),
  };
}
