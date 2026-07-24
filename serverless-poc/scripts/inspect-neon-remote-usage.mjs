import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

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

const secret = parseVars(await readFile(path.join(projectRoot, ".dev.vars.p3-neon"), "utf8"));
const client = new pg.Client({ connectionString: secret.NEON_P3_PRIMARY_DIRECT_URL });
await client.connect();
try {
  const size = await client.query(`
    SELECT coalesce(sum(pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass)), 0)::bigint AS bytes
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'p3_neon_%'
  `);
  const rows = await client.query(`
    SELECT sum(row_count)::bigint AS row_count
    FROM (
      SELECT count(*)::bigint AS row_count FROM p3_neon_rooms
      UNION ALL SELECT count(*)::bigint FROM p3_neon_reservations
      UNION ALL SELECT count(*)::bigint FROM p3_neon_reservation_events
      UNION ALL SELECT count(*)::bigint FROM p3_neon_sessions
      UNION ALL SELECT count(*)::bigint FROM p3_neon_transaction_probe
      UNION ALL SELECT count(*)::bigint FROM p3_neon_password_probe
      UNION ALL SELECT count(*)::bigint FROM p3_neon_remote_migrations
    ) counts
  `);
  process.stdout.write(`${JSON.stringify({
    pocSchemaBytes: Number(size.rows[0].bytes),
    rowCount: Number(rows.rows[0].row_count ?? 0),
  })}\n`);
} finally {
  await client.end();
}
