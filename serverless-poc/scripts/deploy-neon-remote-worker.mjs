import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");

function parseVars(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim().replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

function run(args) {
  const wrangler = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler command failed: ${args.slice(0, 2).join(" ")}`);
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

const source = parseVars(await readFile(path.join(projectRoot, ".dev.vars.p3-neon"), "utf8"));
const suffix = randomBytes(4).toString("hex");
const worker = `room-reservation-p3-neon-${suffix}`;
const probeToken = randomBytes(32).toString("base64url");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "room-reservation-p3-neon-worker-"));
const secretFile = path.join(tempDir, "secrets.json");
let created = false;

try {
  run(["deploy", "--config", "wrangler.neon-remote.jsonc", "--name", worker]);
  created = true;
  await writeFile(
    secretFile,
    JSON.stringify({ DATABASE_URL: source.NEON_P3_PRIMARY_POOLED_URL, PROBE_TOKEN: probeToken }),
    { encoding: "utf8", mode: 0o600 },
  );
  const upload = run([
    "versions",
    "upload",
    "--config",
    "wrangler.neon-remote.jsonc",
    "--name",
    worker,
    "--preview-alias",
    "uat",
    "--secrets-file",
    secretFile,
  ]);
  const urls = [...upload.matchAll(/https:\/\/[a-zA-Z0-9.-]+\.workers\.dev/g)].map(([url]) => url);
  const origin = urls.find((url) => url.startsWith(`https://uat-${worker}.`));
  if (!origin) throw new Error("Aliased preview URL was not returned");
  await writeFile(
    path.join(projectRoot, ".dev.vars.p3-neon-runtime"),
    `P3_NEON_WORKER=${worker}\nP3_NEON_WORKER_ORIGIN=${origin}\nP3_NEON_PROBE_TOKEN=${probeToken}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify({ worker, originCreated: true, route: false, customDomain: false })}\n`);
} catch (error) {
  if (created) {
    try {
      run(["delete", "--config", "wrangler.neon-remote.jsonc", "--name", worker, "--force"]);
    } catch {}
  }
  throw error;
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
