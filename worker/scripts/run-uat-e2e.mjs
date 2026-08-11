import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { disposableUatOriginFromEnv } from "./cloudflare-uat-origin.mjs";

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.resolve(workerRoot, "..", "frontend");
const origin = disposableUatOriginFromEnv();
const result = spawnSync(process.execPath, ["scripts/run-e2e.mjs", ...process.argv.slice(2)], {
  cwd: frontendRoot,
  env: {
    ...process.env,
    PLAYWRIGHT_BASE_URL: origin,
    E2E_BACKEND_URL: `${origin}/api/public/settings`,
    E2E_API_BASE_URL: origin,
    E2E_PRODUCTION_ASSETS: "true",
    E2E_REMOTE: "true",
  },
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Static Assets Worker E2E failed with ${result.status}`);
