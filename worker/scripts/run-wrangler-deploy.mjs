import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  deploymentValuesFromEnv,
  materializeWranglerConfig,
  readWranglerTemplate,
} from "./wrangler-config.mjs";
import { inspectStaticAssets, staticAssetsDirectoryForConfig } from "./static-assets.mjs";

const environment = process.argv[2];
if (environment !== "uat" && environment !== "production") {
  throw new Error("Use run-wrangler-deploy.mjs with uat or production");
}

// Validate every deployment-specific value before Wrangler can read or mutate an external resource.
const values = deploymentValuesFromEnv();
const workerRoot = path.resolve(import.meta.dirname, "..");
const temporaryConfig = path.join(workerRoot, `.wrangler-deploy-${randomUUID()}.jsonc`);
const logDirectory = await mkdtemp(path.join(os.tmpdir(), "cloudflare-worker-deploy-"));
const logPath = path.join(logDirectory, "wrangler-output.log");
try {
  await inspectStaticAssets();
  const config = materializeWranglerConfig(
    await readWranglerTemplate(),
    environment,
    values,
    "src/index.ts",
    staticAssetsDirectoryForConfig(temporaryConfig),
  );
  await writeFile(temporaryConfig, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  const wranglerPath = path.join(workerRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(
    process.execPath,
    [wranglerPath, "deploy", "--env", environment, "--config", temporaryConfig],
    {
      cwd: workerRoot,
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, WRANGLER_LOG_PATH: logDirectory },
    },
  );
  await writeFile(logPath, `${result.stdout ?? ""}\n${result.stderr ?? ""}`, { encoding: "utf8", mode: 0o600 });
  if (result.error || result.status !== 0) {
    throw new Error("Cloudflare Worker deployment failed");
  }
  process.stdout.write(`Combined Cloudflare Worker ${environment} deployment completed.\n`);
} finally {
  await rm(temporaryConfig, { force: true });
  await rm(logDirectory, { recursive: true, force: true });
}
