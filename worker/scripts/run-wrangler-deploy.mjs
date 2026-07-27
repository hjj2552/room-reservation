import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  deploymentValuesFromEnv,
  materializeWranglerConfig,
  readWranglerTemplate,
} from "./wrangler-config.mjs";

const environment = process.argv[2];
if (environment !== "uat" && environment !== "production") {
  throw new Error("Use run-wrangler-deploy.mjs with uat or production");
}

// Validate every deployment-specific value before Wrangler can read or mutate an external resource.
const values = deploymentValuesFromEnv();
const workerRoot = path.resolve(import.meta.dirname, "..");
const temporaryDirectory = path.join(workerRoot, ".wrangler");
const temporaryConfig = path.join(temporaryDirectory, `deploy-${randomUUID()}.jsonc`);
await mkdir(temporaryDirectory, { recursive: true });

try {
  const config = materializeWranglerConfig(
    await readWranglerTemplate(),
    environment,
    values,
    "../src/index.ts",
  );
  await writeFile(temporaryConfig, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  const wranglerPath = path.join(workerRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(
    process.execPath,
    [wranglerPath, "deploy", "--env", environment, "--config", temporaryConfig],
    { cwd: workerRoot, encoding: "utf8", stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler deployment failed with status ${result.status}`);
} finally {
  await rm(temporaryConfig, { force: true });
}
