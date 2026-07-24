import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { runner } from "node-pg-migrate";

function loadVars() {
  const text = fs.readFileSync(new URL("../.dev.vars.p3-neon", import.meta.url), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
        return [key, value];
      }),
  );
}

const vars = loadVars();
const migrationDir = path.resolve(import.meta.dirname, "../remote-migrations");
const targets = [
  ["primary", vars.NEON_P3_PRIMARY_DIRECT_URL],
  ["replay", vars.NEON_P3_REPLAY_DIRECT_URL],
];

async function migrate(databaseUrl) {
  return runner({
    databaseUrl,
    direction: "up",
    dir: migrationDir,
    migrationsTable: "p3_neon_remote_migrations",
    count: Infinity,
    log: () => undefined,
  });
}

async function inspect(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const extensions = await client.query(
      "SELECT extname, extversion FROM pg_extension WHERE extname IN ('btree_gist', 'pgcrypto') ORDER BY extname",
    );
    const columns = await client.query(`
      SELECT table_name, ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name LIKE 'p3_neon_%'
      ORDER BY table_name, ordinal_position
    `);
    const constraints = await client.query(`
      SELECT c.conname, c.contype, pg_get_constraintdef(c.oid, true) AS definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conname LIKE 'p3_neon_%'
      ORDER BY c.conname
    `);
    const indexes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname LIKE 'p3_neon_%'
      ORDER BY indexname
    `);
    const migrations = await client.query(
      "SELECT name, run_on IS NOT NULL AS applied FROM p3_neon_remote_migrations ORDER BY id",
    );
    const normalized = JSON.stringify({
      extensions: extensions.rows,
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
    });
    return {
      extensions: extensions.rows,
      tables: [...new Set(columns.rows.map(({ table_name }) => table_name))],
      constraintNames: constraints.rows.map(({ conname }) => conname),
      indexNames: indexes.rows.map(({ indexname }) => indexname),
      migrations: migrations.rows,
      schemaSha256: createHash("sha256").update(normalized).digest("hex"),
    };
  } finally {
    await client.end();
  }
}

const result = {};
for (const [name, databaseUrl] of targets) {
  const first = await migrate(databaseUrl);
  const second = await migrate(databaseUrl);
  result[name] = {
    firstApplied: first.map(({ name: migrationName }) => migrationName),
    secondAppliedCount: second.length,
    ...(await inspect(databaseUrl)),
  };
}

const failureDir = await mkdtemp(path.join(os.tmpdir(), "room-reservation-p3-neon-failure-"));
try {
  await writeFile(
    path.join(failureDir, "001_intentional_failure.cjs"),
    `exports.up = (pgm) => {
      pgm.createTable('p3_neon_failed_migration_probe', { id: { type: 'integer', primaryKey: true } });
      pgm.sql('SELECT * FROM p3_neon_relation_that_must_not_exist');
    };\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  let rejected = false;
  try {
    await runner({
      databaseUrl: vars.NEON_P3_REPLAY_DIRECT_URL,
      direction: "up",
      dir: failureDir,
      migrationsTable: "p3_neon_failed_migrations",
      count: Infinity,
      log: () => undefined,
    });
  } catch {
    rejected = true;
  }
  const client = new pg.Client({ connectionString: vars.NEON_P3_REPLAY_DIRECT_URL });
  await client.connect();
  try {
    const partial = await client.query(
      "SELECT to_regclass('public.p3_neon_failed_migration_probe') IS NOT NULL AS exists",
    );
    await client.query("DROP TABLE IF EXISTS p3_neon_failed_migrations");
    result.failedMigration = { rejected, partialTableExists: partial.rows[0].exists };
  } finally {
    await client.end();
  }
} finally {
  await rm(failureDir, { recursive: true, force: true });
}

result.schemasMatch = result.primary.schemaSha256 === result.replay.schemaSha256;
process.stdout.write(`${JSON.stringify(result)}\n`);
