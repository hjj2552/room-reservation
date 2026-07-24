import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(projectRoot, "..");
const frontendRoot = path.join(repositoryRoot, "frontend");
const wranglerPath = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const projectName = "room-reservation-jnunursing";
const branch = "p3-neon-20260721";

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

function run(args, cwd = frontendRoot) {
  const result = spawnSync(process.execPath, [wranglerPath, ...args], { cwd, encoding: "utf8", stdio: "pipe" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler command failed: ${args.slice(0, 3).join(" ")}`);
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function deploymentList() {
  const output = run(["pages", "deployment", "list", "--project-name", projectName, "--environment", "preview", "--json"]);
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("Pages deployment JSON was not returned");
  return JSON.parse(output.slice(start, end + 1)).map((item) => ({
    id: item.id ?? item.Id,
    url: item.url ?? item.Deployment,
    branch: item.branch ?? item.Branch,
  }));
}

function section(text, name) {
  const lines = text.split(/\r?\n/);
  const selected = [];
  let active = false;
  for (const line of lines) {
    if (line.trim().startsWith("[")) active = line.trim() === `[${name}]`;
    if (active) selected.push(line);
  }
  return selected.join("\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function withPreviewOrigin(text, origin) {
  const lines = text.split(/\r?\n/);
  let active = false;
  let replaced = false;
  const updated = lines.map((line) => {
    if (line.trim().startsWith("[")) active = line.trim() === "[vars]";
    if (active && /^BACKEND_ORIGIN\s*=/.test(line.trim())) {
      replaced = true;
      return `BACKEND_ORIGIN = ${JSON.stringify(origin)}`;
    }
    return line;
  });
  if (!replaced) throw new Error("Preview BACKEND_ORIGIN was not found in downloaded Pages config");
  return updated.join("\n");
}

const runtime = parseVars(await readFile(path.join(projectRoot, ".dev.vars.p3-neon-runtime"), "utf8"));
const localConfig = path.join(frontendRoot, "wrangler.toml");
const tempBefore = await mkdtemp(path.join(os.tmpdir(), "room-reservation-pages-before-"));
const tempAfter = await mkdtemp(path.join(os.tmpdir(), "room-reservation-pages-after-"));
let deploymentId;

try {
  try {
    await readFile(localConfig, "utf8");
    throw new Error("frontend/wrangler.toml already exists; refusing to overwrite it");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  run(["pages", "download", "config", projectName, "--cwd", tempBefore], frontendRoot);
  const original = await readFile(path.join(tempBefore, "wrangler.toml"), "utf8");
  const productionBefore = sha256(section(original, "env.production.vars"));
  const previewBefore = sha256(section(original, "vars"));
  const beforeIds = new Set(deploymentList().map((item) => item.id));

  await writeFile(localConfig, withPreviewOrigin(original, runtime.P3_NEON_WORKER_ORIGIN), { encoding: "utf8", mode: 0o600 });
  run([
    "pages",
    "deploy",
    "dist",
    "--project-name",
    projectName,
    "--branch",
    branch,
    "--commit-dirty=true",
  ]);

  const afterDeployments = deploymentList();
  const created = afterDeployments.find((item) => !beforeIds.has(item.id));
  if (!created?.id || !created?.url) {
    throw new Error(`Created Pages preview deployment was not identified; fields=${JSON.stringify(Object.keys(afterDeployments[0] ?? {}))}`);
  }
  deploymentId = created.id;

  run(["pages", "download", "config", projectName, "--cwd", tempAfter], frontendRoot);
  const after = await readFile(path.join(tempAfter, "wrangler.toml"), "utf8");
  const productionAfter = sha256(section(after, "env.production.vars"));
  const previewAfter = sha256(section(after, "vars"));

  await writeFile(
    path.join(projectRoot, ".dev.vars.p3-pages-runtime"),
    `P3_PAGES_DEPLOYMENT_ID=${created.id}\nP3_PAGES_ORIGIN=${created.url}\nP3_PAGES_BRANCH=${branch}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify({
    previewCreated: true,
    branch,
    productionConfigUnchanged: productionBefore === productionAfter,
    remotePreviewConfigUnchanged: previewBefore === previewAfter,
  })}\n`);
} catch (error) {
  if (deploymentId) {
    try {
      run(["pages", "deployment", "delete", deploymentId, "--project-name", projectName, "--force"]);
    } catch {}
  }
  throw error;
} finally {
  await rm(localConfig, { force: true });
  await rm(tempBefore, { recursive: true, force: true });
  await rm(tempAfter, { recursive: true, force: true });
}
