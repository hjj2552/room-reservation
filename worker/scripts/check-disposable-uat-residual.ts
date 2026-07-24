import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const expectedHost = process.env.P4_UAT_HOST;
const expectedDatabase = process.env.P4_UAT_DATABASE;

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (process.env.P4_UAT_CONFIRM_DISPOSABLE !== "true") {
  throw new Error("P4_UAT_CONFIRM_DISPOSABLE must be exactly true");
}
const parsed = new URL(databaseUrl);
if (!expectedHost || parsed.hostname !== expectedHost) {
  throw new Error("DATABASE_URL host is not the expected disposable branch endpoint");
}
if (!expectedDatabase || parsed.pathname !== `/${expectedDatabase}`) {
  throw new Error("DATABASE_URL database is not the expected disposable UAT database");
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const identity = await client.query<{ database: string }>(
    "SELECT current_database() AS database",
  );
  if (identity.rows[0]?.database !== expectedDatabase) {
    throw new Error("Connected database identity mismatch");
  }
  const result = await client.query<{
    reservations: number;
    recurrences: number;
    tags: number;
    rooms: number;
    histories: number;
  }>(`
    SELECT
      (SELECT count(*) FROM reservations)::int AS reservations,
      (SELECT count(*) FROM reservation_recurrences)::int AS recurrences,
      (SELECT count(*) FROM tags)::int AS tags,
      (SELECT count(*) FROM rooms WHERE system_reserved=false)::int AS rooms,
      (SELECT count(*) FROM reservation_histories)::int AS histories
  `);
  const counts = result.rows[0];
  if (!counts || Object.values(counts).some((count) => count !== 0)) {
    throw new Error(`Disposable UAT residual data remains: ${JSON.stringify(counts)}`);
  }
  process.stdout.write(`${JSON.stringify({ databaseVerified: true, residual: counts })}\n`);
} finally {
  await client.end();
}
