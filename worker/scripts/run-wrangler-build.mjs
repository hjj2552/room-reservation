import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { materializeWranglerConfig, readWranglerTemplate } from "./wrangler-config.mjs";
import { inspectStaticAssets, staticAssetsDirectoryForConfig } from "./static-assets.mjs";

const workerRoot = path.resolve(import.meta.dirname, "..");
const temporaryConfig = path.join(workerRoot, `.wrangler-build-${randomUUID()}.jsonc`);
const logDirectory = await mkdtemp(path.join(os.tmpdir(), "cloudflare-worker-build-"));

try {
  const assetStats = await inspectStaticAssets();
  const config = materializeWranglerConfig(
    await readWranglerTemplate(),
    "uat",
    {
      workerName: "room-reservation-worker-build",
      ingressNamespaceId: "1",
      readNamespaceId: "2",
      writeNamespaceId: "3",
    },
    "src/index.ts",
    staticAssetsDirectoryForConfig(temporaryConfig),
  );
  await writeFile(temporaryConfig, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  const wranglerPath = path.join(workerRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(
    process.execPath,
    [wranglerPath, "deploy", "--dry-run", "--outdir", "dist", "--env", "uat", "--config", temporaryConfig],
    {
      cwd: workerRoot,
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, WRANGLER_LOG_PATH: logDirectory },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler dry-run failed with status ${result.status}`);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const bundleSize = output.match(/Total Upload:\s*([0-9.]+\s*[A-Za-z]+)\s*\/ gzip:\s*([0-9.]+\s*[A-Za-z]+)/);
  if (!bundleSize) throw new Error("Wrangler dry-run did not report Worker bundle size");
  process.stdout.write(`Worker dry-run bundle verified: upload=${bundleSize[1]}, gzip=${bundleSize[2]}.\n`);
  process.stdout.write(`Static assets verified: files=${assetStats.fileCount}, totalBytes=${assetStats.totalBytes}, maxFileBytes=${assetStats.maxFileBytes}.\n`);
} finally {
  await rm(temporaryConfig, { force: true });
  await rm(logDirectory, { recursive: true, force: true });
}
