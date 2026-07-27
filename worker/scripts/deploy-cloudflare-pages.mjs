import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { productionCloudflareValuesFromEnv } from "./cloudflare-production-config.mjs";

const values = productionCloudflareValuesFromEnv();
if (process.env.GITHUB_REF_NAME !== "main") {
  throw new Error("Cloudflare Pages production deployment requires the main branch");
}

const workerRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(workerRoot, "..");
const frontendRoot = path.join(repositoryRoot, "frontend");
await Promise.all([
  stat(path.join(frontendRoot, "dist")),
  stat(path.join(frontendRoot, "functions")),
]);

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "cloudflare-pages-deploy-"));
const logPath = path.join(temporaryDirectory, "wrangler.log");
try {
  const wranglerPath = path.join(workerRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(
    process.execPath,
    [
      wranglerPath,
      "pages",
      "deploy",
      "dist",
      "--project-name",
      values.pagesProjectName,
      "--branch",
      process.env.GITHUB_REF_NAME,
    ],
    { cwd: frontendRoot, encoding: "utf8", stdio: "pipe", maxBuffer: 10 * 1024 * 1024 },
  );
  await writeFile(logPath, `${result.stdout ?? ""}\n${result.stderr ?? ""}`, { encoding: "utf8", mode: 0o600 });
  if (result.error || result.status !== 0) {
    throw new Error("Cloudflare Pages deployment failed");
  }
  process.stdout.write("Cloudflare Pages production deployment completed.\n");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
