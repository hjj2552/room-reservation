import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (process.env.P4_UAT_CONFIRM_DISPOSABLE !== "true") {
  throw new Error("P4_UAT_CONFIRM_DISPOSABLE must be exactly true");
}

const input = process.env.P4_UAT_PAGES_URL;
if (!input) throw new Error("P4_UAT_PAGES_URL is required");
const pagesUrl = new URL(input);
if (
  pagesUrl.protocol !== "https:"
  || pagesUrl.pathname !== "/"
  || pagesUrl.search
  || pagesUrl.hash
  || !pagesUrl.hostname.endsWith(".pages.dev")
  || pagesUrl.hostname.split(".").length < 4
) {
  throw new Error("P4_UAT_PAGES_URL must be an HTTPS Cloudflare Pages preview URL, not the production pages.dev URL");
}

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.resolve(workerRoot, "..", "frontend");
const origin = pagesUrl.origin;
const result = spawnSync(process.execPath, ["scripts/run-e2e.mjs", ...process.argv.slice(2)], {
  cwd: frontendRoot,
  env: {
    ...process.env,
    PLAYWRIGHT_BASE_URL: origin,
    E2E_BACKEND_URL: `${origin}/api/public/settings`,
    E2E_API_BASE_URL: origin,
  },
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Pages preview E2E failed with ${result.status}`);
