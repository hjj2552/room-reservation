import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
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
const redactOutput = process.env.CLOUDFLARE_DEPLOY_REDACT_OUTPUT === "true";
const logDirectory = redactOutput ? await mkdtemp(path.join(os.tmpdir(), "cloudflare-worker-deploy-")) : null;
const logPath = logDirectory ? path.join(logDirectory, "wrangler.log") : null;
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
    {
      cwd: workerRoot,
      encoding: "utf8",
      stdio: redactOutput ? "pipe" : "inherit",
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (logPath) {
    await writeFile(logPath, `${result.stdout ?? ""}\n${result.stderr ?? ""}`, { encoding: "utf8", mode: 0o600 });
  }
  if (result.error || result.status !== 0) {
    throw new Error(redactOutput ? "Cloudflare Worker deployment failed" : `Wrangler deployment failed with status ${result.status}`);
  }
  if (redactOutput) process.stdout.write("Cloudflare Worker production deployment completed.\n");
} finally {
  await rm(temporaryConfig, { force: true });
  if (logDirectory) await rm(logDirectory, { recursive: true, force: true });
}
