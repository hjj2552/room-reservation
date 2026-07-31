import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runner } from "node-pg-migrate";

const { Pool } = pg;

const EXPECTED_SCHEMA = "public";
const MIGRATIONS_TABLE = "worker_migrations";
const V2_MIGRATION = "002_room_display_order_v2";
const PRODUCT_TABLES = [
  "admin_sessions",
  "operation_settings",
  "reservation_histories",
  "reservation_recurrences",
  "reservations",
  "room_order_state",
  "rooms",
  "tags",
];

export interface ProductionMigrationConfig {
  databaseUrl: string;
  expectedHost: string;
  expectedDatabase: string;
  expectedRole: string;
}

export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
}

interface ProductionMigrationDependencies {
  createClient(config: ProductionMigrationConfig): SqlClient;
  runMigrations(config: ProductionMigrationConfig): Promise<void>;
}

export class ProductionMigrationError extends Error {
  constructor(
    readonly stage: "configuration" | "identity" | "ledger" | "migration" | "schema",
    message: string,
  ) {
    super(message);
    this.name = "ProductionMigrationError";
  }
}

function requiredEnvironmentValue(
  env: NodeJS.ProcessEnv,
  name:
    | "NEON_MIGRATION_DATABASE_URL"
    | "NEON_MIGRATION_EXPECTED_HOST"
    | "NEON_MIGRATION_EXPECTED_DATABASE"
    | "NEON_MIGRATION_EXPECTED_ROLE",
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ProductionMigrationError("configuration", `Required production migration secret is missing: ${name}`);
  }
  return value;
}

export function productionMigrationConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { allowNonNeonHost?: boolean } = {},
): ProductionMigrationConfig {
  const databaseUrl = requiredEnvironmentValue(env, "NEON_MIGRATION_DATABASE_URL");
  const expectedHost = requiredEnvironmentValue(env, "NEON_MIGRATION_EXPECTED_HOST").toLowerCase();
  const expectedDatabase = requiredEnvironmentValue(env, "NEON_MIGRATION_EXPECTED_DATABASE");
  const expectedRole = requiredEnvironmentValue(env, "NEON_MIGRATION_EXPECTED_ROLE");

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new ProductionMigrationError("configuration", "Production migration URL is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new ProductionMigrationError("configuration", "Production migration URL must use PostgreSQL.");
  }
  if (!parsed.username || !parsed.password) {
    throw new ProductionMigrationError("configuration", "Production migration URL must include dedicated credentials.");
  }
  if (parsed.hostname.toLowerCase() !== expectedHost) {
    throw new ProductionMigrationError("configuration", "Production migration host identity does not match.");
  }
  if (!options.allowNonNeonHost && !expectedHost.endsWith(".neon.tech")) {
    throw new ProductionMigrationError("configuration", "Production migration host must be a Neon endpoint.");
  }
  if (expectedHost.split(".")[0]?.endsWith("-pooler")) {
    throw new ProductionMigrationError("configuration", "Production migration must use a direct Neon endpoint.");
  }
  let urlDatabase: string;
  try {
    urlDatabase = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    throw new ProductionMigrationError("configuration", "Production migration database identity is invalid.");
  }
  if (!urlDatabase || urlDatabase !== expectedDatabase) {
    throw new ProductionMigrationError("configuration", "Production migration database identity does not match.");
  }
  let urlRole: string;
  try {
    urlRole = decodeURIComponent(parsed.username);
  } catch {
    throw new ProductionMigrationError("configuration", "Production migration role identity is invalid.");
  }
  if (urlRole !== expectedRole) {
    throw new ProductionMigrationError("configuration", "Production migration role identity does not match.");
  }

  return { databaseUrl, expectedHost, expectedDatabase, expectedRole };
}

function createProductionClient(config: ProductionMigrationConfig): SqlClient {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    application_name: "room-reservation-production-migration",
  });
  return {
    async query(text, values = []) {
      const result = await pool.query(text, values);
      return { rows: result.rows as Array<Record<string, unknown>> };
    },
    async end() {
      await pool.end();
    },
  };
}

async function localMigrationNames(): Promise<string[]> {
  const entries = await readdir(new URL("../migrations", import.meta.url), { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && /^\d+_[a-z0-9_]+\.ts$/.test(entry.name))
    .map((entry) => entry.name.replace(/\.ts$/, ""))
    .sort();
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw new ProductionMigrationError("ledger", "Local production migration definitions are invalid.");
  }
  return names;
}

async function verifyIdentity(client: SqlClient, config: ProductionMigrationConfig): Promise<void> {
  let rows: Array<Record<string, unknown>>;
  try {
    ({ rows } = await client.query(
      "SELECT current_database() AS database_name, current_user AS role_name, current_schema() AS schema_name",
    ));
  } catch {
    throw new ProductionMigrationError("identity", "Production migration database identity could not be verified.");
  }
  const identity = rows[0];
  if (!identity || identity.database_name !== config.expectedDatabase) {
    throw new ProductionMigrationError("identity", "Production migration database identity does not match.");
  }
  if (identity.role_name !== config.expectedRole) {
    throw new ProductionMigrationError("identity", "Production migration role identity does not match.");
  }
  if (identity.schema_name !== EXPECTED_SCHEMA) {
    throw new ProductionMigrationError("identity", "Production migration schema identity does not match.");
  }
}

async function appliedMigrationNames(client: SqlClient): Promise<string[]> {
  let tableResult: { rows: Array<Record<string, unknown>> };
  try {
    tableResult = await client.query(
      "SELECT to_regclass($1) IS NOT NULL AS exists",
      [`${EXPECTED_SCHEMA}.${MIGRATIONS_TABLE}`],
    );
  } catch {
    throw new ProductionMigrationError("ledger", "Production migration ledger could not be inspected.");
  }
  if (tableResult.rows[0]?.exists !== true) {
    let productTables: { rows: Array<Record<string, unknown>> };
    try {
      productTables = await client.query(
        `SELECT count(*)::integer AS count
         FROM information_schema.tables
         WHERE table_schema=$1 AND table_name = ANY($2::text[])`,
        [EXPECTED_SCHEMA, PRODUCT_TABLES],
      );
    } catch {
      throw new ProductionMigrationError("ledger", "Production schema state could not be inspected.");
    }
    if (productTables.rows[0]?.count !== 0) {
      throw new ProductionMigrationError("ledger", "Production schema exists without its migration ledger.");
    }
    return [];
  }

  try {
    const result = await client.query(
      `SELECT name
       FROM ${EXPECTED_SCHEMA}.${MIGRATIONS_TABLE}
       ORDER BY run_on ASC, id ASC`,
    );
    if (result.rows.some((row) => typeof row.name !== "string")) {
      throw new Error("invalid ledger row");
    }
    return result.rows.map((row) => row.name as string);
  } catch {
    throw new ProductionMigrationError("ledger", "Production migration ledger could not be read.");
  }
}

function verifyMigrationPrefix(applied: string[], local: string[], requireAll: boolean): void {
  if (new Set(applied).size !== applied.length || applied.length > local.length) {
    throw new ProductionMigrationError("ledger", "Production migration ledger does not match local migrations.");
  }
  for (let index = 0; index < applied.length; index += 1) {
    if (applied[index] !== local[index]) {
      throw new ProductionMigrationError("ledger", "Production migration ledger does not match local migrations.");
    }
  }
  if (requireAll && applied.length !== local.length) {
    throw new ProductionMigrationError("ledger", "Production migration ledger is incomplete.");
  }
}

export async function inspectProductionMigrationState(
  client: SqlClient,
  config: ProductionMigrationConfig,
  options: { requireAll?: boolean } = {},
): Promise<string[]> {
  await verifyIdentity(client, config);
  const [applied, local] = await Promise.all([
    appliedMigrationNames(client),
    localMigrationNames(),
  ]);
  verifyMigrationPrefix(applied, local, options.requireAll === true);
  return local;
}

async function withProductionClient<T>(
  config: ProductionMigrationConfig,
  dependencies: ProductionMigrationDependencies,
  work: (client: SqlClient) => Promise<T>,
): Promise<T> {
  let client: SqlClient;
  try {
    client = dependencies.createClient(config);
  } catch {
    throw new ProductionMigrationError("identity", "Production migration database connection could not be created.");
  }
  try {
    return await work(client);
  } finally {
    try {
      await client.end();
    } catch {
      // The operation result remains authoritative; connection details are never surfaced.
    }
  }
}

const defaultDependencies: ProductionMigrationDependencies = {
  createClient: createProductionClient,
  async runMigrations(config) {
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    try {
      await runner({
        databaseUrl: config.databaseUrl,
        direction: "up",
        dir: path.join(projectRoot, "migrations"),
        migrationsTable: MIGRATIONS_TABLE,
        migrationsSchema: EXPECTED_SCHEMA,
        schema: EXPECTED_SCHEMA,
        count: Infinity,
        log: () => undefined,
        logger: {
          debug: () => undefined,
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });
    } catch {
      throw new ProductionMigrationError("migration", "Production database migration failed.");
    }
  },
};

export async function preflightProductionMigration(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: Partial<ProductionMigrationDependencies> = {},
): Promise<void> {
  const config = productionMigrationConfigFromEnv(env);
  const resolved = { ...defaultDependencies, ...dependencies };
  await withProductionClient(config, resolved, async (client) => {
    await inspectProductionMigrationState(client, config);
  });
}

export async function applyProductionMigration(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: Partial<ProductionMigrationDependencies> = {},
): Promise<void> {
  const config = productionMigrationConfigFromEnv(env);
  const resolved = { ...defaultDependencies, ...dependencies };
  await withProductionClient(config, resolved, async (client) => {
    await inspectProductionMigrationState(client, config);
  });
  try {
    await resolved.runMigrations(config);
  } catch (error) {
    if (error instanceof ProductionMigrationError) throw error;
    throw new ProductionMigrationError("migration", "Production database migration failed.");
  }
}

export async function verifyProductionV2Schema(
  client: SqlClient,
  config: ProductionMigrationConfig,
): Promise<void> {
  const local = await inspectProductionMigrationState(client, config, { requireAll: true });
  if (!local.includes(V2_MIGRATION)) {
    throw new ProductionMigrationError("schema", "Required V2 migration definition is missing.");
  }

  try {
    const migration = await client.query(
      `SELECT count(*)::integer AS count
       FROM ${EXPECTED_SCHEMA}.${MIGRATIONS_TABLE}
       WHERE name=$1`,
      [V2_MIGRATION],
    );
    if (migration.rows[0]?.count !== 1) {
      throw new ProductionMigrationError("schema", "Required V2 migration record is invalid.");
    }

    const objects = await client.query(
      `SELECT
         to_regclass('public.room_order_state') IS NOT NULL AS state_table_exists,
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='rooms' AND column_name='display_order'
         ) AS display_order_exists,
         EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE conname='chk_room_order_state_singleton'
             AND conrelid='public.room_order_state'::regclass
         ) AS state_singleton_constraint_exists,
         EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE conname='chk_rooms_display_order_target'
             AND conrelid='public.rooms'::regclass
         ) AS target_constraint_exists,
         EXISTS (
           SELECT 1 FROM pg_indexes
           WHERE schemaname='public'
             AND tablename='rooms'
             AND indexname='ux_rooms_display_order_active'
         ) AS active_order_index_exists`,
    );
    const objectState = objects.rows[0];
    if (
      !objectState
      || objectState.state_table_exists !== true
      || objectState.display_order_exists !== true
      || objectState.state_singleton_constraint_exists !== true
      || objectState.target_constraint_exists !== true
      || objectState.active_order_index_exists !== true
    ) {
      throw new ProductionMigrationError("schema", "Production V2 schema objects are incomplete.");
    }

    const state = await client.query(
      `SELECT
         count(*)::integer AS row_count,
         count(*) FILTER (WHERE id=1)::integer AS singleton_count
       FROM public.room_order_state`,
    );
    if (state.rows[0]?.row_count !== 1 || state.rows[0]?.singleton_count !== 1) {
      throw new ProductionMigrationError("schema", "Production room order singleton state is invalid.");
    }

    const orders = await client.query(
      `SELECT
         count(*) FILTER (
           WHERE system_reserved=true AND display_order IS NOT NULL
         )::integer AS invalid_system_count,
         count(*) FILTER (
           WHERE system_reserved=false AND deleted_at IS NULL
         )::integer AS active_count,
         count(*) FILTER (
           WHERE system_reserved=false
             AND deleted_at IS NULL
             AND (display_order IS NULL OR display_order <= 0)
         )::integer AS invalid_active_count,
         count(DISTINCT display_order) FILTER (
           WHERE system_reserved=false AND deleted_at IS NULL
         )::integer AS distinct_active_count,
         min(display_order) FILTER (
           WHERE system_reserved=false AND deleted_at IS NULL
         )::text AS minimum_order,
         max(display_order) FILTER (
           WHERE system_reserved=false AND deleted_at IS NULL
         )::text AS maximum_order
       FROM public.rooms`,
    );
    const orderState = orders.rows[0];
    if (!orderState || orderState.invalid_system_count !== 0 || orderState.invalid_active_count !== 0) {
      throw new ProductionMigrationError("schema", "Production room display order values are invalid.");
    }
    const activeCount = orderState.active_count;
    if (typeof activeCount !== "number" || orderState.distinct_active_count !== activeCount) {
      throw new ProductionMigrationError("schema", "Production room display orders are not unique.");
    }
    if (
      activeCount > 0
      && (orderState.minimum_order !== "1" || orderState.maximum_order !== String(activeCount))
    ) {
      throw new ProductionMigrationError("schema", "Production room display orders are not contiguous.");
    }
  } catch (error) {
    if (error instanceof ProductionMigrationError) throw error;
    throw new ProductionMigrationError("schema", "Production V2 schema could not be verified.");
  }
}

export async function verifyProductionMigration(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: Partial<ProductionMigrationDependencies> = {},
): Promise<void> {
  const config = productionMigrationConfigFromEnv(env);
  const resolved = { ...defaultDependencies, ...dependencies };
  await withProductionClient(config, resolved, async (client) => {
    await verifyProductionV2Schema(client, config);
  });
}
