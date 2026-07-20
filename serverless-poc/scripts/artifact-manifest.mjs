import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const bundlePath = process.argv[2];
if (!bundlePath) {
  throw new Error("Usage: npm run artifact:manifest -- <worker-bundle-path>");
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const projectRoot = path.resolve(import.meta.dirname, "..");
const migrationRoot = path.join(projectRoot, "migrations");
const migrationFiles = (await readdir(migrationRoot)).filter((name) => name.endsWith(".ts")).sort();
const migrations = [];
for (const name of migrationFiles) {
  migrations.push({ name, sha256: sha256(await readFile(path.join(migrationRoot, name))) });
}

const workerSha256 = sha256(await readFile(path.resolve(bundlePath)));
const baselineSha256 = sha256(migrations.map(({ name, sha256: hash }) => `${name}:${hash}`).join("\n"));
const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: path.resolve(projectRoot, ".."),
  encoding: "utf8",
}).trim();

const candidateSha256 = sha256(`${gitCommit}\n${workerSha256}\n${baselineSha256}`);
process.stdout.write(
  `${JSON.stringify({ gitCommit, workerSha256, baselineSha256, candidateSha256, migrations }, null, 2)}\n`,
);
