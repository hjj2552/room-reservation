import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const expectedDatabase = process.env.P4_UAT_DATABASE;
const expectedRole = process.env.P4_UAT_ROLE;

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (process.env.APP_ENV !== "uat") throw new Error("APP_ENV must be exactly uat");
if (process.env.P4_UAT_CONFIRM_DISPOSABLE !== "true") {
  throw new Error("P4_UAT_CONFIRM_DISPOSABLE must be exactly true");
}
if (!expectedDatabase || !/^room_reservation_(?:p4|rate_limit|ingress)_uat_[0-9]{8}$/.test(expectedDatabase)) {
  throw new Error("P4_UAT_DATABASE must use an approved disposable UAT naming rule");
}
if (!expectedRole || !/^[a-z][a-z0-9_]{2,62}$/.test(expectedRole)) {
  throw new Error("P4_UAT_ROLE must name the expected disposable branch role");
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const identity = await client.query<{ database: string; role: string }>(
    "SELECT current_database() AS database, current_user AS role",
  );
  const identityRow = identity.rows[0];
  if (!identityRow) throw new Error("Database identity query returned no row");
  const { database, role } = identityRow;
  if (database !== expectedDatabase) throw new Error(`Refusing unexpected database: ${database}`);
  if (role !== expectedRole) throw new Error(`Refusing unexpected role: ${role}`);

  const ownership = await client.query<{ owner: string }>(
    "SELECT pg_catalog.pg_get_userbyid(datdba) AS owner FROM pg_catalog.pg_database WHERE datname = $1",
    [expectedDatabase],
  );
  if (ownership.rows[0]?.owner !== role) throw new Error("The disposable database is not owned by the validator role");

  const content = await client.query<{ rooms: string; reservations: string; recurrences: string }>(`
    SELECT
      (SELECT count(*) FROM rooms WHERE system_reserved = false)::text AS rooms,
      (SELECT count(*) FROM reservations)::text AS reservations,
      (SELECT count(*) FROM reservation_recurrences)::text AS recurrences
  `);
  const counts = content.rows[0];
  if (!counts) throw new Error("Product row count query returned no row");
  if (counts.rooms !== "0" || counts.reservations !== "0" || counts.recurrences !== "0") {
    throw new Error(`Disposable database contains product data: ${JSON.stringify(counts)}`);
  }

  await client.query(`
    UPDATE operation_settings
    SET reservation_enabled = true,
        semester_start_date = current_date,
        semester_end_date = current_date + interval '180 days',
        updated_at = now(),
        version = version + 1
    WHERE id = 1
  `);

  process.stdout.write(`${JSON.stringify({
    databaseVerified: true,
    ownerVerified: true,
    productRowsBeforeE2e: counts,
    reservationEnabledForDisposableUat: true,
  })}\n`);
} finally {
  await client.end();
}
