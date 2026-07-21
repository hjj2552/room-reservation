import path from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await runner({
  databaseUrl,
  direction: "up",
  dir: path.join(projectRoot, "migrations"),
  migrationsTable: "worker_migrations",
  count: Infinity,
  log: () => undefined,
});
