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
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")];
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
const runtime = parseVars(await readFile(path.join(projectRoot, ".dev.vars.p3-neon-runtime"), "utf8"));
const tempDir = await mkdtemp(path.join(os.tmpdir(), "room-reservation-p3-neon-worker-update-"));
const secretFile = path.join(tempDir, "secrets.json");

try {
  await writeFile(
    secretFile,
    JSON.stringify({ DATABASE_URL: source.NEON_P3_PRIMARY_POOLED_URL, PROBE_TOKEN: runtime.P3_NEON_PROBE_TOKEN }),
    { encoding: "utf8", mode: 0o600 },
  );
  run([
    "versions",
    "upload",
    "--config",
    "wrangler.neon-remote.jsonc",
    "--name",
    runtime.P3_NEON_WORKER,
    "--preview-alias",
    "uat",
    "--secrets-file",
    secretFile,
  ]);
  process.stdout.write(`${JSON.stringify({ workerUpdated: true, previewAliasUpdated: true })}\n`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
