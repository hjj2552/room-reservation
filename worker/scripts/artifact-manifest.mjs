import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)));
const bundleDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "dist");

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory)) {
    const full = path.join(directory, entry);
    if ((await stat(full)).isDirectory()) result.push(...await files(full));
    else result.push(full);
  }
  return result.sort();
}

async function digestPaths(paths, base) {
  const hash = createHash("sha256");
  for (const file of paths) {
    hash.update(path.relative(base, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
if (git.status !== 0) throw new Error("Could not resolve Git commit");
const gitCommit = git.stdout.trim();
const bundleSha256 = await digestPaths(await files(bundleDir), bundleDir);
const migrationDir = path.join(root, "migrations");
const baselineSha256 = await digestPaths(await files(migrationDir), migrationDir);
const candidateSha256 = createHash("sha256")
  .update(`${gitCommit}\n${bundleSha256}\n${baselineSha256}\n`)
  .digest("hex");

process.stdout.write(`${JSON.stringify({ gitCommit, bundleSha256, baselineSha256, candidateSha256 }, null, 2)}\n`);
