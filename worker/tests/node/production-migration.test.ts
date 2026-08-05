import { describe, expect, it, vi } from "vitest";
import {
  applyProductionMigration,
  preflightProductionMigration,
  ProductionMigrationError,
  productionMigrationConfigFromEnv,
  verifyProductionV2Schema,
  verifyProductionV3Schema,
  verifyProductionV4Schema,
  verifyProductionV5Schema,
  type ProductionMigrationConfig,
  type SqlClient,
} from "../../scripts/production-migration-lib";

const validEnvironment = {
  NEON_MIGRATION_DATABASE_URL:
    "postgresql://migration_role:local-test-password@ep-production-test.example.neon.tech/production_db?sslmode=require",
  NEON_MIGRATION_EXPECTED_HOST: "ep-production-test.example.neon.tech",
  NEON_MIGRATION_EXPECTED_DATABASE: "production_db",
  NEON_MIGRATION_EXPECTED_ROLE: "migration_role",
};

function clientForRows(rowsByQuery: Array<Array<Record<string, unknown>>>): SqlClient {
  let index = 0;
  return {
    query: vi.fn(async () => ({ rows: rowsByQuery[index++] ?? [] })),
    end: vi.fn(async () => undefined),
  };
}

describe("production migration configuration", () => {
  it("fails before creating a database client when a required secret is missing", async () => {
    const createClient = vi.fn();
    await expect(preflightProductionMigration({}, { createClient })).rejects.toMatchObject({
      stage: "configuration",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects host, database, role, and pooled endpoint mismatches", () => {
    expect(() => productionMigrationConfigFromEnv({
      ...validEnvironment,
      NEON_MIGRATION_EXPECTED_HOST: "ep-other.example.neon.tech",
    })).toThrow(ProductionMigrationError);
    expect(() => productionMigrationConfigFromEnv({
      ...validEnvironment,
      NEON_MIGRATION_EXPECTED_DATABASE: "other_db",
    })).toThrow(ProductionMigrationError);
    expect(() => productionMigrationConfigFromEnv({
      ...validEnvironment,
      NEON_MIGRATION_EXPECTED_ROLE: "other_role",
    })).toThrow(ProductionMigrationError);
    expect(() => productionMigrationConfigFromEnv({
      ...validEnvironment,
      NEON_MIGRATION_DATABASE_URL:
        "postgresql://migration_role:local-test-password@ep-production-test-pooler.example.neon.tech/production_db",
      NEON_MIGRATION_EXPECTED_HOST: "ep-production-test-pooler.example.neon.tech",
    })).toThrow(/direct Neon endpoint/);
  });

  it.each([
    ["database_name", "unexpected_db", "database"],
    ["role_name", "unexpected_role", "role"],
    ["schema_name", "unexpected_schema", "schema"],
  ])("fails closed when actual %s does not match", async (field, actual, expectedMessage) => {
    const identity = {
      database_name: "production_db",
      role_name: "migration_role",
      schema_name: "public",
      [field]: actual,
    };
    const client = clientForRows([[identity]]);
    const createClient = vi.fn(() => client);
    await expect(preflightProductionMigration(validEnvironment, { createClient }))
      .rejects.toThrow(new RegExp(expectedMessage, "i"));
    expect(client.end).toHaveBeenCalledOnce();
  });

  it("does not expose supplied identities or credentials in failures", async () => {
    const client = clientForRows([[
      { database_name: "unexpected_db", role_name: "migration_role", schema_name: "public" },
    ]]);
    let failure: unknown;
    try {
      await preflightProductionMigration(validEnvironment, { createClient: () => client });
    } catch (error) {
      failure = error;
    }
    const serialized = String(failure);
    expect(serialized).not.toContain("production_db");
    expect(serialized).not.toContain("unexpected_db");
    expect(serialized).not.toContain("local-test-password");
    expect(serialized).not.toContain("ep-production-test");
  });

  it("blocks migration when the ledger is not an exact local prefix", async () => {
    const client = clientForRows([
      [{ database_name: "production_db", role_name: "migration_role", schema_name: "public" }],
      [{ exists: true }],
      [{ name: "999_unexpected_future_migration" }],
    ]);
    const runMigrations = vi.fn();
    await expect(applyProductionMigration(validEnvironment, {
      createClient: () => client,
      runMigrations,
    })).rejects.toMatchObject({ stage: "ledger" });
    expect(runMigrations).not.toHaveBeenCalled();
  });

  it("redacts migration runner failures", async () => {
    const client = clientForRows([
      [{ database_name: "production_db", role_name: "migration_role", schema_name: "public" }],
      [{ exists: true }],
      [{ name: "001_worker_baseline_v1" }],
    ]);
    const runMigrations = vi.fn(async () => {
      throw new Error(validEnvironment.NEON_MIGRATION_DATABASE_URL);
    });
    let failure: unknown;
    try {
      await applyProductionMigration(validEnvironment, {
        createClient: () => client,
        runMigrations,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ stage: "migration" });
    expect(String(failure)).not.toContain("local-test-password");
    expect(String(failure)).not.toContain("ep-production-test");
  });
});

describe("production migration schema verification", () => {
  const config: ProductionMigrationConfig = {
    databaseUrl: validEnvironment.NEON_MIGRATION_DATABASE_URL,
    expectedHost: validEnvironment.NEON_MIGRATION_EXPECTED_HOST,
    expectedDatabase: validEnvironment.NEON_MIGRATION_EXPECTED_DATABASE,
    expectedRole: validEnvironment.NEON_MIGRATION_EXPECTED_ROLE,
  };

  function validSchemaClient(overrides: {
    objects?: Record<string, unknown>;
    state?: Record<string, unknown>;
    orders?: Record<string, unknown>;
    contactSchema?: Record<string, unknown>;
    contactValues?: Record<string, unknown>;
    visibilitySchema?: Record<string, unknown>;
    visibilityValues?: Record<string, unknown>;
    version?: 2 | 3 | 4 | 5;
    v5?: boolean;
    v5Migrations?: Array<Record<string, unknown>>;
  } = {}): SqlClient {
    const commonRows: Array<Array<Record<string, unknown>>> = [
      [{ database_name: "production_db", role_name: "migration_role", schema_name: "public" }],
      [{ exists: true }],
      [
        { name: "001_worker_baseline_v1" },
        { name: "002_room_display_order_v2" },
        { name: "003_admin_optional_contact_v3" },
        { name: "004_applicant_name_visibility_v4" },
        { name: "005_recurrence_hard_delete_v5" },
      ].slice(0, overrides.v5 ? 5 : (overrides.version ?? 4)),
      [{ count: 1 }],
      [{
        state_table_exists: true,
        display_order_exists: true,
        state_singleton_constraint_exists: true,
        target_constraint_exists: true,
        active_order_index_exists: true,
        ...overrides.objects,
      }],
      [{ row_count: 1, singleton_count: 1, ...overrides.state }],
      [{
        invalid_system_count: 0,
        active_count: 3,
        invalid_active_count: 0,
        distinct_active_count: 3,
        minimum_order: "1",
        maximum_order: "3",
        ...overrides.orders,
      }],
      [{ count: 1 }],
      [{
        nullable_email_columns: 2,
        reservation_constraint_exists: true,
        recurrence_constraint_exists: true,
        old_constraints_removed: true,
        ...overrides.contactSchema,
      }],
      [{
        invalid_reservation_count: 0,
        invalid_recurrence_count: 0,
        ...overrides.contactValues,
      }],
    ];
    const visibilityRows: Array<Array<Record<string, unknown>>> = [
      [{
        visibility_columns: 2,
        history_columns: 2,
        public_constraint_exists: true,
        recurrence_deleted_at_columns: overrides.v5 ? 0 : 1,
        recurrence_deleted_at_index_exists: !overrides.v5,
        ...overrides.visibilitySchema,
      }],
      [{
        null_reservation_count: 0,
        null_recurrence_count: 0,
        exposed_public_count: 0,
        ...overrides.visibilityValues,
      }],
    ];
    if (overrides.v5) {
      return clientForRows([
        ...commonRows,
        overrides.v5Migrations ?? [
          { name: "004_applicant_name_visibility_v4", count: 1 },
          { name: "005_recurrence_hard_delete_v5", count: 1 },
        ],
        ...visibilityRows,
      ]);
    }
    return clientForRows([...commonRows, [{ count: 1 }], ...visibilityRows]);
  }

  it("accepts a complete V2 ledger and contiguous room order", async () => {
    await expect(verifyProductionV2Schema(validSchemaClient({ version: 2 }), config)).resolves.toBeUndefined();
  });

  it("accepts nullable contact columns and V3 constraints", async () => {
    await expect(verifyProductionV3Schema(validSchemaClient({ version: 3 }), config)).resolves.toBeUndefined();
  });

  it("accepts V4 applicant visibility columns, defaults and public constraint", async () => {
    await expect(verifyProductionV4Schema(validSchemaClient(), config)).resolves.toBeUndefined();
  });

  it("accepts V5 after removing the legacy recurrence deletion column and index", async () => {
    await expect(verifyProductionV5Schema(validSchemaClient({ v5: true }), config)).resolves.toBeUndefined();
  });

  it("requires exactly one V5 ledger record and complete recurrence schema removal", async () => {
    await expect(verifyProductionV5Schema(validSchemaClient({
      v5: true,
      v5Migrations: [{ name: "004_applicant_name_visibility_v4", count: 1 }],
    }), config)).rejects.toMatchObject({ stage: "schema" });
    await expect(verifyProductionV5Schema(validSchemaClient({
      v5: true,
      visibilitySchema: { recurrence_deleted_at_columns: 1 },
    }), config)).rejects.toMatchObject({ stage: "schema" });
    await expect(verifyProductionV5Schema(validSchemaClient({
      v5: true,
      visibilitySchema: { recurrence_deleted_at_index_exists: true },
    }), config)).rejects.toMatchObject({ stage: "schema" });
  });

  it("requires the legacy recurrence deletion column and index in the V4 deployment schema", async () => {
    await expect(verifyProductionV4Schema(validSchemaClient({
      visibilitySchema: { recurrence_deleted_at_columns: 0 },
    }), config)).rejects.toMatchObject({ stage: "schema" });
    await expect(verifyProductionV4Schema(validSchemaClient({
      visibilitySchema: { recurrence_deleted_at_index_exists: false },
    }), config)).rejects.toMatchObject({ stage: "schema" });
  });

  it("rejects incomplete V4 visibility schema and exposed public reservations", async () => {
    await expect(verifyProductionV4Schema(validSchemaClient({
      visibilitySchema: { history_columns: 1 },
    }), config)).rejects.toMatchObject({ stage: "schema" });
    await expect(verifyProductionV4Schema(validSchemaClient({
      visibilityValues: { exposed_public_count: 1 },
    }), config)).rejects.toMatchObject({ stage: "schema" });
  });

  it("rejects incomplete V3 contact schema and invalid values", async () => {
    await expect(verifyProductionV3Schema(validSchemaClient({
      version: 3,
      contactSchema: { nullable_email_columns: 1 },
    }), config)).rejects.toMatchObject({ stage: "schema" });
    await expect(verifyProductionV3Schema(validSchemaClient({
      version: 3,
      contactValues: { invalid_reservation_count: 1 },
    }), config)).rejects.toMatchObject({ stage: "schema" });
  });

  it("fails when the V2 schema contract is incomplete", async () => {
    await expect(verifyProductionV2Schema(validSchemaClient({
      version: 2,
      objects: { active_order_index_exists: false },
    }), config)).rejects.toMatchObject({ stage: "schema" });
    await expect(verifyProductionV2Schema(validSchemaClient({
      version: 2,
      state: { row_count: 2 },
    }), config)).rejects.toMatchObject({ stage: "schema" });
    await expect(verifyProductionV2Schema(validSchemaClient({
      version: 2,
      orders: { distinct_active_count: 2 },
    }), config)).rejects.toMatchObject({ stage: "schema" });
    await expect(verifyProductionV2Schema(validSchemaClient({
      version: 2,
      orders: { maximum_order: "4" },
    }), config)).rejects.toMatchObject({ stage: "schema" });
  });
});
