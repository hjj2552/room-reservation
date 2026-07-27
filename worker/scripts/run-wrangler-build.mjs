import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { materializeWranglerConfig, readWranglerTemplate } from "./wrangler-config.mjs";

const workerRoot = path.resolve(import.meta.dirname, "..");
const temporaryDirectory = path.join(workerRoot, ".wrangler");
const temporaryConfig = path.join(temporaryDirectory, `build-${randomUUID()}.jsonc`);
await mkdir(temporaryDirectory, { recursive: true });

try {
  const config = materializeWranglerConfig(
    await readWranglerTemplate(),
    "uat",
    {
      workerName: "room-reservation-worker-build",
      ingressNamespaceId: "1",
      readNamespaceId: "2",
      writeNamespaceId: "3",
    },
    "../src/index.ts",
  );
  await writeFile(temporaryConfig, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  const wranglerPath = path.join(workerRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(
    process.execPath,
    [wranglerPath, "deploy", "--dry-run", "--outdir", "dist", "--env", "uat", "--config", temporaryConfig],
    { cwd: workerRoot, encoding: "utf8", stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler dry-run failed with status ${result.status}`);
} finally {
  await rm(temporaryConfig, { force: true });
}
