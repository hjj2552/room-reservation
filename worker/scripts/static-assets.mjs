import { createHash } from "node:crypto";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const MAX_ASSET_FILES = 20_000;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;

export const frontendDist = path.resolve(import.meta.dirname, "..", "..", "frontend", "dist");

async function listFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(fullPath));
    else if (entry.isFile()) result.push(fullPath);
  }
  return result.sort();
}

export async function inspectStaticAssets(directory = frontendDist) {
  await access(path.join(directory, "index.html"));
  const paths = await listFiles(directory);
  if (paths.length > MAX_ASSET_FILES) throw new Error("Static asset file count exceeds the deployment limit");

  const hash = createHash("sha256");
  let totalBytes = 0;
  let maxFileBytes = 0;
  for (const file of paths) {
    const metadata = await stat(file);
    if (metadata.size > MAX_ASSET_BYTES) throw new Error("A static asset exceeds the per-file deployment limit");
    totalBytes += metadata.size;
    maxFileBytes = Math.max(maxFileBytes, metadata.size);
    hash.update(path.relative(directory, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return { fileCount: paths.length, totalBytes, maxFileBytes, sha256: hash.digest("hex") };
}

export function staticAssetsDirectoryForConfig(configPath, directory = frontendDist) {
  const absolute = path.resolve(directory);
  const relative = path.relative(path.dirname(configPath), absolute);
  if (!relative || path.resolve(path.dirname(configPath), relative) !== absolute) {
    throw new Error("Static assets directory could not be resolved safely");
  }
  return relative.replaceAll("\\", "/");
}
