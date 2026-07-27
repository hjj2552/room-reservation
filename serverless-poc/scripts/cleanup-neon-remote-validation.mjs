import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const projectRoot = path.resolve(import.meta.dirname, "..");
const frontendRoot = path.resolve(projectRoot, "../frontend");
const wranglerPath = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");

function requiredResourceName(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) {
    throw new Error(`${name} must contain only lowercase letters, digits, and interior hyphens`);
  }
  return value;
}

const pagesProject = requiredResourceName("CLOUDFLARE_PAGES_PROJECT_NAME");
const previewBranch = requiredResourceName("CLOUDFLARE_PAGES_PREVIEW_BRANCH");

function parseVars(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

function runWrangler(args, cwd = projectRoot) {
  const result = spawnSync(process.execPath, [wranglerPath, ...args], { cwd, encoding: "utf8", stdio: "pipe" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler command failed: ${args.slice(0, 3).join(" ")}`);
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function previewDeployments() {
  const output = runWrangler(
    ["pages", "deployment", "list", "--project-name", pagesProject, "--environment", "preview", "--json"],
    frontendRoot,
  );
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("Pages deployment JSON was not returned");
  return JSON.parse(output.slice(start, end + 1)).map((item) => ({
    id: item.id ?? item.Id,
    url: item.url ?? item.Deployment,
    branch: item.branch ?? item.Branch,
  }));
}

function exactPreviewOrigin(input) {
  const url = new URL(input);
  const productionHostname = `${pagesProject}.pages.dev`;
  const previewSuffix = `.${productionHostname}`;
  const deployment = url.hostname.endsWith(previewSuffix)
    ? url.hostname.slice(0, -previewSuffix.length)
    : "";
  if (
    url.protocol !== "https:"
    || url.pathname !== "/"
    || url.search
    || url.hash
    || url.hostname === productionHostname
    || !deployment
    || deployment.includes(".")
  ) {
    throw new Error("P3 Pages receipt does not contain the expected disposable preview origin");
  }
  return url.origin;
}

async function dropPoc(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      DROP TABLE IF EXISTS p3_neon_password_probe;
      DROP TABLE IF EXISTS p3_neon_transaction_probe;
      DROP TABLE IF EXISTS p3_neon_sessions;
      DROP TABLE IF EXISTS p3_neon_reservation_events;
      DROP TABLE IF EXISTS p3_neon_reservations;
      DROP TABLE IF EXISTS p3_neon_rooms;
      DROP TABLE IF EXISTS p3_neon_remote_migrations;
      DROP EXTENSION IF EXISTS pgcrypto;
      DROP EXTENSION IF EXISTS btree_gist;
    `);
    await client.query("COMMIT");
    const remaining = await client.query(`
      SELECT
        (SELECT count(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name LIKE 'p3_neon_%') AS tables,
        (SELECT count(*)::int FROM pg_extension
          WHERE extname IN ('btree_gist', 'pgcrypto')) AS extensions
    `);
    return { tables: remaining.rows[0].tables, extensions: remaining.rows[0].extensions };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

const secret = parseVars(await readFile(path.join(projectRoot, ".dev.vars.p3-neon"), "utf8"));
const runtime = parseVars(await readFile(path.join(projectRoot, ".dev.vars.p3-neon-runtime"), "utf8"));
const pagesRuntime = parseVars(await readFile(path.join(projectRoot, ".dev.vars.p3-pages-runtime"), "utf8"));

if (pagesRuntime.P3_PAGES_PROJECT_NAME !== pagesProject) {
  throw new Error("CLOUDFLARE_PAGES_PROJECT_NAME does not match the exact deployment receipt");
}
if (pagesRuntime.P3_PAGES_BRANCH !== previewBranch) {
  throw new Error("CLOUDFLARE_PAGES_PREVIEW_BRANCH does not match the exact deployment receipt");
}
if (!pagesRuntime.P3_PAGES_DEPLOYMENT_ID?.trim()) {
  throw new Error("P3_PAGES_DEPLOYMENT_ID is missing from the exact deployment receipt");
}
const receiptOrigin = exactPreviewOrigin(pagesRuntime.P3_PAGES_ORIGIN);

const pagesDeployments = previewDeployments();
const pagesTarget = pagesDeployments.find((item) => item.id === pagesRuntime.P3_PAGES_DEPLOYMENT_ID);
if (
  !pagesTarget
  || pagesTarget.branch !== previewBranch
  || !pagesTarget.url
  || exactPreviewOrigin(pagesTarget.url) !== receiptOrigin
) {
  throw new Error("Exact Pages deployment receipt did not match the selected project resource");
}
runWrangler(
  ["pages", "deployment", "delete", pagesTarget.id, "--project-name", pagesProject, "--force"],
  frontendRoot,
);

runWrangler(["delete", "--config", "wrangler.neon-remote.jsonc", "--name", runtime.P3_NEON_WORKER, "--force"]);

const primary = await dropPoc(secret.NEON_P3_PRIMARY_DIRECT_URL);
const replay = await dropPoc(secret.NEON_P3_REPLAY_DIRECT_URL);
const pagesRemaining = previewDeployments().filter((item) => item.branch === previewBranch).length;

process.stdout.write(`${JSON.stringify({
  pagesPreviewDeploymentsDeleted: 1,
  pagesPreviewDeploymentsRemaining: pagesRemaining,
  workerDeleted: true,
  primary,
  replay,
})}\n`);
