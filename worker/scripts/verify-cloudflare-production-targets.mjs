import { productionCloudflareValuesFromEnv } from "./cloudflare-production-config.mjs";

const values = productionCloudflareValuesFromEnv();
const headers = { Authorization: `Bearer ${values.apiToken}` };

async function requireExistingTarget(url, targetLabel) {
  let response;
  try {
    response = await fetch(url, { headers, redirect: "error" });
  } catch {
    throw new Error(`Unable to verify the configured production ${targetLabel}`);
  }
  try {
    if (response.status === 404) {
      throw new Error(`Configured production ${targetLabel} does not exist`);
    }
    if (!response.ok) {
      throw new Error(`Unable to verify the configured production ${targetLabel}`);
    }
  } finally {
    await response.body?.cancel();
  }
}

const accountPath = encodeURIComponent(values.accountId);
await requireExistingTarget(
  `https://api.cloudflare.com/client/v4/accounts/${accountPath}/workers/scripts/${encodeURIComponent(values.workerName)}`,
  "Worker",
);

process.stdout.write("Configured production Cloudflare Worker target verified.\n");
