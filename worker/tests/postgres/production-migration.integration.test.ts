import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  productionMigrationConfigFromEnv,
  verifyProductionV2Schema,
  type SqlClient,
} from "../../scripts/production-migration-lib";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const parsed = new URL(databaseUrl);
const expectedDatabase = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
const expectedRole = decodeURIComponent(parsed.username);
const config = productionMigrationConfigFromEnv({
  NEON_MIGRATION_DATABASE_URL: databaseUrl,
  NEON_MIGRATION_EXPECTED_HOST: parsed.hostname,
  NEON_MIGRATION_EXPECTED_DATABASE: expectedDatabase,
  NEON_MIGRATION_EXPECTED_ROLE: expectedRole,
}, { allowNonNeonHost: true });

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client: SqlClient = {
  async query(text, values = []) {
    const result = await pool.query(text, values);
    return { rows: result.rows as Array<Record<string, unknown>> };
  },
  async end() {
    await pool.end();
  },
};

afterAll(async () => {
  await client.end();
});

describe("production migration schema contract", () => {
  it("verifies the complete V2 schema and migration ledger", async () => {
    await expect(verifyProductionV2Schema(client, config)).resolves.toBeUndefined();
  });
});
