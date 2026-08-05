import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const suffix = `${process.pid}-${Date.now()}`;
const containerName = `room-reservation-worker-test-${suffix}`;
if (!/^room-reservation-worker-test-[0-9]+-[0-9]+$/.test(containerName)) {
  throw new Error("Unsafe temporary container name");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function runProject(args, databaseUrl) {
  const result = spawnSync(process.execPath, args, {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: "pipe",
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`node ${args.join(" ")} failed with ${result.status}`);
    error.commandOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    throw error;
  }
}

function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "worker_test"],
      { encoding: "utf8" },
    );
    if (probe.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error("Disposable PostgreSQL did not become ready");
}

function isTransientPostgresConnectionError(error) {
  const output = `${error.message}\n${error.commandOutput ?? ""}`;
  return /Connection terminated unexpectedly|ECONNRESET|ECONNREFUSED|the database system is starting up|57P01/i.test(output);
}

function runMigration(script, databaseUrl) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    waitForPostgres();
    try {
      runProject(["node_modules/tsx/dist/cli.mjs", script], databaseUrl);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 3 || !isTransientPostgresConnectionError(error)) throw error;
      process.stderr.write(`PostgreSQL migration connection failed (${attempt}/3); retrying.\n`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 1_000);
    }
  }
  throw lastError;
}

try {
  run("docker", [
    "run", "--detach", "--rm", "--name", containerName,
    "--env", "POSTGRES_USER=worker_test",
    "--env", "POSTGRES_PASSWORD=worker_test_password",
    "--env", "POSTGRES_DB=worker_primary",
    "--publish", "127.0.0.1::5432",
    "postgres:17-alpine",
  ]);

  waitForPostgres();

  const portOutput = run("docker", ["port", containerName, "5432/tcp"]);
  const port = /:(\d+)\s*$/.exec(portOutput)?.[1];
  if (!port) throw new Error(`Could not determine PostgreSQL port: ${portOutput}`);
  const baseUrl = `postgresql://worker_test:worker_test_password@127.0.0.1:${port}`;
  const primaryUrl = `${baseUrl}/worker_primary`;
  runMigration("scripts/migrate.ts", primaryUrl);
  runMigration("scripts/migrate.ts", primaryUrl);
  runProject(["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.postgres.config.ts"], primaryUrl);

  run("docker", ["exec", containerName, "createdb", "-U", "worker_test", "worker_replay"]);
  const replayUrl = `${baseUrl}/worker_replay`;
  runMigration("scripts/migrate.ts", replayUrl);

  run("docker", ["exec", containerName, "createdb", "-U", "worker_test", "worker_upgrade"]);
  const upgradeUrl = `${baseUrl}/worker_upgrade`;
  runMigration("scripts/migrate-v1-for-test.ts", upgradeUrl);
  run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_upgrade",
    "-v", "ON_ERROR_STOP=1",
    "-c",
    `INSERT INTO rooms(name,capacity,enabled)
     VALUES ('testing-room-zulu',10,true),('testing-room-alpha',10,true),('testing-room-middle',10,true)`,
  ]);
  runMigration("scripts/migrate.ts", upgradeUrl);
  runMigration("scripts/migrate.ts", upgradeUrl);
  runProject([
    "node_modules/vitest/vitest.mjs",
    "run",
    "--config",
    "vitest.postgres.config.ts",
    "tests/postgres/production-migration.integration.test.ts",
  ], upgradeUrl);
  const upgradedOrder = run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_upgrade",
    "--tuples-only", "--no-align",
    "-c",
    `SELECT name || '|' || display_order
     FROM rooms
     WHERE system_reserved=false
     ORDER BY display_order`,
  ]).split("\n").map((line) => line.trim()).filter(Boolean);
  if (JSON.stringify(upgradedOrder) !== JSON.stringify([
    "testing-room-alpha|1",
    "testing-room-middle|2",
    "testing-room-zulu|3",
  ])) {
    throw new Error(`V1 to V5 room order migration failed: ${JSON.stringify(upgradedOrder)}`);
  }
  const sentinelDisplayOrder = run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_upgrade",
    "--tuples-only", "--no-align",
    "-c",
    "SELECT display_order IS NULL FROM rooms WHERE system_reserved=true",
  ]).trim();
  if (sentinelDisplayOrder !== "t") throw new Error("System room received a display order");
  const upgradedContactSchema = run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_upgrade",
    "--tuples-only", "--no-align",
    "-c",
    `SELECT
       (SELECT count(*) FROM worker_migrations
        WHERE name='003_admin_optional_contact_v3') = 1
       AND (SELECT count(*) FROM information_schema.columns
            WHERE table_schema='public'
              AND table_name IN ('reservations','reservation_recurrences')
              AND column_name='applicant_email'
              AND is_nullable='YES') = 2
       AND (SELECT count(*) FROM pg_constraint
            WHERE conname IN (
              'chk_reservations_applicant_email_optional',
              'chk_recurrences_applicant_email_optional'
            )) = 2`,
  ]).trim();
  if (upgradedContactSchema !== "t") throw new Error("V1 to V5 contact migration failed");
  const upgradedVisibilitySchema = run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_upgrade",
    "--tuples-only", "--no-align",
    "-c",
    `SELECT
       (SELECT count(*) FROM worker_migrations
        WHERE name='004_applicant_name_visibility_v4') = 1
       AND (SELECT count(*) FROM information_schema.columns
            WHERE table_schema='public'
              AND table_name IN ('reservations','reservation_recurrences')
              AND column_name='show_applicant_name'
              AND is_nullable='NO'
              AND column_default='false') = 2
       AND (SELECT count(*) FROM information_schema.columns
            WHERE table_schema='public'
              AND table_name='reservation_histories'
              AND column_name IN (
                'reservation_show_applicant_name',
                'before_reservation_show_applicant_name'
              )) = 2
       AND (SELECT count(*) FROM pg_constraint
            WHERE conname='chk_reservations_public_applicant_name_hidden') = 1
       AND (SELECT count(*) FROM worker_migrations
            WHERE name='005_recurrence_hard_delete_v5') = 1
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public'
           AND table_name='reservation_recurrences'
           AND column_name='deleted_at'
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname='public'
           AND tablename='reservation_recurrences'
           AND indexname='idx_recurrences_deleted_at'
       )`,
  ]).trim();
  if (upgradedVisibilitySchema !== "t") throw new Error("V1 to V5 schema migration failed");

  run("docker", ["exec", containerName, "createdb", "-U", "worker_test", "worker_v4_upgrade"]);
  const v4UpgradeUrl = `${baseUrl}/worker_v4_upgrade`;
  runMigration("scripts/migrate-v4-for-test.ts", v4UpgradeUrl);
  run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_v4_upgrade",
    "-v", "ON_ERROR_STOP=1",
    "-c",
    `INSERT INTO rooms(name,capacity,enabled,display_order)
       VALUES ('testing-room-v5-existing',10,true,1);
     INSERT INTO reservation_recurrences(
       room_id,applicant_name,applicant_email,applicant_phone,purpose,start_date,end_date,
       days_of_week,start_time,end_time,conflict_policy,created_by,show_applicant_name,deleted_at
     ) SELECT id,'testing-v5-active','testing-v5-active@example.test','010-0000-0001',
       'testing-v5-active',DATE '2035-01-08',DATE '2035-01-08','MON','10:00','11:00',
       'FAIL_ALL','admin',false,NULL
       FROM rooms WHERE name='testing-room-v5-existing';
     INSERT INTO reservation_recurrences(
       room_id,applicant_name,applicant_email,applicant_phone,purpose,start_date,end_date,
       days_of_week,start_time,end_time,conflict_policy,created_by,show_applicant_name,deleted_at
     ) SELECT id,'testing-v5-legacy','testing-v5-legacy@example.test','010-0000-0002',
       'testing-v5-legacy',DATE '2035-01-09',DATE '2035-01-09','TUE','12:00','13:00',
       'SKIP_CONFLICTS','admin',true,TIMESTAMPTZ '2025-01-02 03:04:05+00'
       FROM rooms WHERE name='testing-room-v5-existing';
     INSERT INTO reservations(
       room_id,recurrence_id,applicant_name,applicant_email,applicant_phone,purpose,
       start_at,end_at,status,source,created_by_actor_type,recurrence_exception,show_applicant_name
     ) SELECT room_id,id,applicant_name,applicant_email,applicant_phone,
       purpose || '-child',TIMESTAMPTZ '2035-01-08 01:00:00+00',
       TIMESTAMPTZ '2035-01-08 02:00:00+00','CONFIRMED','RECURRING_GENERATED',
       'ADMIN',false,false
       FROM reservation_recurrences WHERE purpose='testing-v5-active';
     INSERT INTO reservations(
       room_id,recurrence_id,applicant_name,applicant_email,applicant_phone,purpose,
       start_at,end_at,status,source,created_by_actor_type,recurrence_exception,show_applicant_name
     ) SELECT room_id,id,applicant_name,applicant_email,applicant_phone,
       purpose || '-child',TIMESTAMPTZ '2035-01-09 03:00:00+00',
       TIMESTAMPTZ '2035-01-09 04:00:00+00','CANCELLED','RECURRING_GENERATED',
       'ADMIN',true,true
       FROM reservation_recurrences WHERE purpose='testing-v5-legacy';
     INSERT INTO reservation_histories(
       reservation_id,action,after_status,memo,actor_type,reservation_room_id,
       reservation_purpose,reservation_applicant_name,reservation_applicant_email,
       reservation_applicant_phone,reservation_show_applicant_name
     ) SELECT id,'RECURRENCE_GENERATED',status,'testing-v5-history','ADMIN',room_id,
       purpose,applicant_name,applicant_email,applicant_phone,show_applicant_name
       FROM reservations WHERE purpose LIKE 'testing-v5-%-child'`,
  ]);

  const v4LegacyState = run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_v4_upgrade",
    "--tuples-only", "--no-align",
    "-c",
    `SELECT
       (SELECT count(*) FROM reservation_recurrences WHERE deleted_at IS NULL) = 1
       AND (SELECT count(*) FROM reservation_recurrences WHERE deleted_at IS NOT NULL) = 1
       AND (SELECT count(*) FROM reservations WHERE recurrence_id IS NOT NULL) = 2
       AND (SELECT count(*) FROM reservation_histories) = 2
       AND EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname='public'
           AND tablename='reservation_recurrences'
           AND indexname='idx_recurrences_deleted_at'
       )`,
  ]).trim();
  if (v4LegacyState !== "t") throw new Error("V4 recurrence preservation fixture is incomplete");

  const preservationSnapshot = (database) => run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", database,
    "--tuples-only", "--no-align",
    "-c",
    `SELECT jsonb_build_object(
       'recurrences', (SELECT jsonb_agg(to_jsonb(r) - 'deleted_at' ORDER BY id)
                       FROM reservation_recurrences r),
       'reservations', (SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM reservations v),
       'histories', (SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM reservation_histories h)
     )::text`,
  ]).trim();
  const beforeV5 = preservationSnapshot("worker_v4_upgrade");
  runMigration("scripts/migrate.ts", v4UpgradeUrl);
  runMigration("scripts/migrate.ts", v4UpgradeUrl);
  const v4UpgradeState = run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_v4_upgrade",
    "--tuples-only", "--no-align",
    "-c",
    `SELECT
       (SELECT count(*) FROM worker_migrations
        WHERE name='005_recurrence_hard_delete_v5') = 1
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public'
           AND table_name='reservation_recurrences'
           AND column_name='deleted_at'
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname='public'
           AND tablename='reservation_recurrences'
           AND indexname='idx_recurrences_deleted_at'
       )
       AND (SELECT count(*) FROM reservation_recurrences) = 2
       AND (SELECT count(*) FROM reservations WHERE recurrence_id IS NOT NULL) = 2
       AND (SELECT count(*) FROM reservation_histories) = 2`,
  ]).trim();
  if (v4UpgradeState !== "t") throw new Error("V4 to V5 standalone migration contract failed");
  const afterV5 = preservationSnapshot("worker_v4_upgrade");
  if (beforeV5 !== afterV5) throw new Error("V4 to V5 migration changed recurrence product data");

  const dump = (database) => run("docker", [
    "exec", containerName, "pg_dump", "--schema-only", "--no-owner", "--no-privileges",
    "-U", "worker_test", database,
  ]).split("\n").filter((line) => !line.startsWith("--") && !line.startsWith("\\")).join("\n").trim();
  const primarySchema = dump("worker_primary");
  const replaySchema = dump("worker_replay");
  if (primarySchema !== replaySchema) throw new Error("Replayed baseline schema differs");
  const v4UpgradeSchema = dump("worker_v4_upgrade");
  if (primarySchema !== v4UpgradeSchema) throw new Error("V4 to V5 standalone upgrade schema differs");
  const schemaSha256 = createHash("sha256").update(primarySchema).digest("hex");
  process.stdout.write(`isolated_postgres=passed schema_sha256=${schemaSha256}\n`);
} finally {
  spawnSync("docker", ["stop", "--time", "5", containerName], { stdio: "ignore" });
}
