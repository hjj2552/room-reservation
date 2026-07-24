import pg from "pg";

const ownerDatabaseUrl = process.env.DATABASE_URL;
const expectedHost = process.env.P4_UAT_HOST;
const expectedDatabase = process.env.P4_UAT_DATABASE;
const expectedRole = process.env.P4_UAT_ROLE;

if (!ownerDatabaseUrl) throw new Error("DATABASE_URL is required");
if (process.env.P4_UAT_CONFIRM_DISPOSABLE !== "true") {
  throw new Error("P4_UAT_CONFIRM_DISPOSABLE must be exactly true");
}
if (!expectedHost || new URL(ownerDatabaseUrl).hostname !== expectedHost) {
  throw new Error("DATABASE_URL host is not the expected disposable branch endpoint");
}
if (!expectedDatabase || !/^room_reservation_(?:p4|rate_limit|ingress)_uat_[0-9]{8}$/.test(expectedDatabase)) {
  throw new Error("P4_UAT_DATABASE must use an approved disposable UAT naming rule");
}
if (!expectedRole || !/^[a-z][a-z0-9_]{2,62}$/.test(expectedRole)) {
  throw new Error("P4_UAT_ROLE must name the expected disposable branch role");
}

const client = new pg.Client({ connectionString: ownerDatabaseUrl });
await client.connect();
try {
  const identity = await client.query<{ database: string; role: string }>(
    "SELECT current_database() AS database, current_user AS role",
  );
  const row = identity.rows[0];
  if (!row || row.database !== "neondb" || row.role !== expectedRole) {
    throw new Error("Refusing an unexpected owner database or role");
  }
  const existing = await client.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [expectedDatabase],
  );
  if (existing.rowCount !== 0) {
    throw new Error("Disposable UAT database already exists");
  }
  await client.query(`CREATE DATABASE "${expectedDatabase}" OWNER "${expectedRole}"`);
  process.stdout.write(`${JSON.stringify({
    hostVerified: true,
    ownerDatabaseVerified: true,
    roleVerified: true,
    databaseCreated: expectedDatabase,
  })}\n`);
} finally {
  await client.end();
}
