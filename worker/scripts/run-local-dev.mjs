import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(workerRoot, "..");
const localWorkerDatabase = "room_reservation_worker";

function loadLocalEnvironment() {
  const contents = readFileSync(path.join(repositoryRoot, ".env"), "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(rawLine);
    if (!match || process.env[match[1]] !== undefined) continue;

    let value = match[2];
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function requireLocalValue(name) {
  const value = process.env[name]?.trim();
  if (!value || /^<.*>$/.test(value)) {
    throw new Error(`${name} must be set to a local value in the repository .env file`);
  }
  return value;
}

function createDatabaseUrls() {
  const configuredUrl = requireLocalValue("DB_URL").replace(/^jdbc:/, "");
  let url;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("DB_URL must be a valid local PostgreSQL URL");
  }

  if (!new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname)) {
    throw new Error("Local Worker startup only accepts a loopback DB_URL");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DB_URL must use the PostgreSQL protocol");
  }

  url.username = requireLocalValue("DB_USERNAME");
  url.password = requireLocalValue("DB_PASSWORD");

  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";
  const workerUrl = new URL(url);
  workerUrl.pathname = `/${localWorkerDatabase}`;
  return { maintenanceUrl: maintenanceUrl.toString(), workerUrl: workerUrl.toString() };
}

async function ensureLocalWorkerDatabase(maintenanceUrl) {
  const client = new pg.Client({ connectionString: maintenanceUrl });
  try {
    await client.connect();
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [localWorkerDatabase]);
    if (result.rowCount === 0) await client.query(`CREATE DATABASE ${localWorkerDatabase}`);
  } finally {
    await client.end();
  }
}

loadLocalEnvironment();
const databaseUrls = createDatabaseUrls();
await ensureLocalWorkerDatabase(databaseUrls.maintenanceUrl);
process.env.DATABASE_URL = databaseUrls.workerUrl;
process.env.ADMIN_USERNAME = requireLocalValue("ADMIN_USERNAME");
process.env.ADMIN_PASSWORD = requireLocalValue("ADMIN_PASSWORD");
process.env.APP_ENV = "local";
process.env.E2E_CLEANUP_ENABLED ??= "false";
process.env.PORT ??= "8080";

const tsxCli = path.join(workerRoot, "node_modules", "tsx", "dist", "cli.mjs");
const migration = spawnSync(process.execPath, [tsxCli, "scripts/migrate.ts"], {
  cwd: workerRoot,
  env: process.env,
  stdio: "inherit",
});
if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);

const server = spawn(process.execPath, [tsxCli, "scripts/local-server.ts"], {
  cwd: workerRoot,
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});
server.once("error", (error) => {
  throw error;
});
server.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
