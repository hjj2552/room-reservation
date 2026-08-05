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
  if (result.status !== 0) throw new Error(`node ${args.join(" ")} failed with ${result.status}`);
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

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "worker_test"], { encoding: "utf8" });
    if (probe.status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");

  const portOutput = run("docker", ["port", containerName, "5432/tcp"]);
  const port = /:(\d+)\s*$/.exec(portOutput)?.[1];
  if (!port) throw new Error(`Could not determine PostgreSQL port: ${portOutput}`);
  const baseUrl = `postgresql://worker_test:worker_test_password@127.0.0.1:${port}`;
  const primaryUrl = `${baseUrl}/worker_primary`;
  runProject(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], primaryUrl);
  runProject(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], primaryUrl);
  runProject(["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.postgres.config.ts"], primaryUrl);

  run("docker", ["exec", containerName, "createdb", "-U", "worker_test", "worker_replay"]);
  const replayUrl = `${baseUrl}/worker_replay`;
  runProject(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], replayUrl);

  run("docker", ["exec", containerName, "createdb", "-U", "worker_test", "worker_upgrade"]);
  const upgradeUrl = `${baseUrl}/worker_upgrade`;
  runProject(["node_modules/tsx/dist/cli.mjs", "scripts/migrate-v1-for-test.ts"], upgradeUrl);
  run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_upgrade",
    "-v", "ON_ERROR_STOP=1",
    "-c",
    `INSERT INTO rooms(name,capacity,enabled)
     VALUES ('testing-room-zulu',10,true),('testing-room-alpha',10,true),('testing-room-middle',10,true)`,
  ]);
  runProject(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], upgradeUrl);
  runProject(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], upgradeUrl);
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
    throw new Error(`V1 to V4 room order migration failed: ${JSON.stringify(upgradedOrder)}`);
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
  if (upgradedContactSchema !== "t") throw new Error("V1 to V4 contact migration failed");
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
            WHERE conname='chk_reservations_public_applicant_name_hidden') = 1`,
  ]).trim();
  if (upgradedVisibilitySchema !== "t") throw new Error("V1 to V4 visibility migration failed");

  run("docker", ["exec", containerName, "createdb", "-U", "worker_test", "worker_v4_upgrade"]);
  const v4UpgradeUrl = `${baseUrl}/worker_v4_upgrade`;
  runProject(["node_modules/tsx/dist/cli.mjs", "scripts/migrate-v3-for-test.ts"], v4UpgradeUrl);
  run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_v4_upgrade",
    "-v", "ON_ERROR_STOP=1",
    "-c",
    `INSERT INTO rooms(name,capacity,enabled,display_order)
       VALUES ('testing-room-v4-existing',10,true,1);
     INSERT INTO reservations(
       room_id,applicant_name,applicant_email,applicant_phone,purpose,start_at,end_at,
       status,source,created_by_actor_type,cancel_password_hash
     ) SELECT id,'testing-v4-existing','testing-v4@example.test','010-0000-0000',
       'testing-v4-existing',date_trunc('hour',now()) + interval '30 days',
       date_trunc('hour',now()) + interval '30 days 1 hour',
       'REQUESTED','PUBLIC_FORM','PUBLIC_USER',crypt('Aa1!',gen_salt('bf',12))
       FROM rooms WHERE name='testing-room-v4-existing';
     INSERT INTO reservation_recurrences(
       room_id,applicant_name,applicant_email,applicant_phone,purpose,start_date,end_date,
       days_of_week,start_time,end_time,conflict_policy,created_by
     ) SELECT id,'testing-v4-recurring','testing-v4@example.test','010-0000-0000',
       'testing-v4-recurring',current_date + 40,current_date + 40,'MON','10:00','11:00',
       'FAIL_ALL','admin' FROM rooms WHERE name='testing-room-v4-existing'`,
  ]);
  runProject(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], v4UpgradeUrl);
  runProject(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], v4UpgradeUrl);
  const v4UpgradeState = run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_v4_upgrade",
    "--tuples-only", "--no-align",
    "-c",
    `SELECT
       (SELECT count(*) FROM worker_migrations
        WHERE name='004_applicant_name_visibility_v4') = 1
       AND NOT EXISTS (SELECT 1 FROM reservations WHERE show_applicant_name)
       AND NOT EXISTS (SELECT 1 FROM reservation_recurrences WHERE show_applicant_name)`,
  ]).trim();
  if (v4UpgradeState !== "t") throw new Error("V4 standalone upgrade did not preserve hidden defaults");
  const publicConstraintStatus = spawnSync("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_v4_upgrade",
    "-v", "ON_ERROR_STOP=1",
    "-c", "UPDATE reservations SET show_applicant_name=true WHERE source='PUBLIC_FORM'",
  ], { encoding: "utf8", stdio: "pipe" }).status;
  if (publicConstraintStatus === 0) throw new Error("V4 public visibility constraint was not enforced");

  run("docker", ["exec", containerName, "createdb", "-U", "worker_test", "worker_v5_upgrade"]);
  const v5UpgradeUrl = `${baseUrl}/worker_v5_upgrade`;
  runProject(["node_modules/tsx/dist/cli.mjs", "scripts/migrate-v4-for-test.ts"], v5UpgradeUrl);
  run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_v5_upgrade",
    "-v", "ON_ERROR_STOP=1",
    "-c",
    `INSERT INTO rooms(name,capacity,enabled,display_order)
       VALUES ('testing-room-v5-existing',10,true,1);
     INSERT INTO reservation_recurrences(
       room_id,applicant_name,applicant_email,applicant_phone,purpose,start_date,end_date,
       days_of_week,start_time,end_time,conflict_policy,created_by,deleted_at
     ) SELECT id,'testing-v5-active','testing-v5-active@example.test','010-0000-0000',
       'testing-v5-active',current_date + 40,current_date + 40,'MON','10:00','11:00',
       'FAIL_ALL','admin',NULL FROM rooms WHERE name='testing-room-v5-existing';
     INSERT INTO reservation_recurrences(
       room_id,applicant_name,applicant_email,applicant_phone,purpose,start_date,end_date,
       days_of_week,start_time,end_time,conflict_policy,created_by,deleted_at
     ) SELECT id,'testing-v5-deleted','testing-v5-deleted@example.test','010-0000-0000',
       'testing-v5-deleted',current_date + 41,current_date + 41,'TUE','12:00','13:00',
       'SKIP_CONFLICTS','admin',now() FROM rooms WHERE name='testing-room-v5-existing';
     INSERT INTO reservations(
       room_id,recurrence_id,applicant_name,applicant_email,applicant_phone,purpose,start_at,end_at,
       status,source,created_by_actor_type,recurrence_exception
     ) SELECT rr.room_id,rr.id,rr.applicant_name,rr.applicant_email,rr.applicant_phone,
       'testing-v5-active-child',date_trunc('hour',now()) + interval '40 days',
       date_trunc('hour',now()) + interval '40 days 1 hour','CONFIRMED','RECURRING_GENERATED','ADMIN',false
       FROM reservation_recurrences rr WHERE rr.purpose='testing-v5-active';
     INSERT INTO reservations(
       room_id,recurrence_id,applicant_name,applicant_email,applicant_phone,purpose,start_at,end_at,
       status,source,created_by_actor_type,recurrence_exception
     ) SELECT rr.room_id,rr.id,rr.applicant_name,rr.applicant_email,rr.applicant_phone,
       'testing-v5-deleted-child',date_trunc('hour',now()) + interval '41 days',
       date_trunc('hour',now()) + interval '41 days 1 hour','CANCELLED','RECURRING_GENERATED','ADMIN',true
       FROM reservation_recurrences rr WHERE rr.purpose='testing-v5-deleted'`,
  ]);
  runProject(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], v5UpgradeUrl);
  runProject(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], v5UpgradeUrl);
  const v5UpgradeState = run("docker", [
    "exec", containerName, "psql", "-U", "worker_test", "-d", "worker_v5_upgrade",
    "--tuples-only", "--no-align",
    "-c",
    `SELECT
       (SELECT count(*) FROM worker_migrations WHERE name='005_recurrence_hard_delete_v5') = 1
       AND (SELECT count(*) FROM reservation_recurrences
            WHERE purpose IN ('testing-v5-active','testing-v5-deleted')) = 2
       AND (SELECT count(*) FROM reservations
            WHERE purpose='testing-v5-active-child' AND status='CONFIRMED'
              AND recurrence_exception=false) = 1
       AND (SELECT count(*) FROM reservations
            WHERE purpose='testing-v5-deleted-child' AND status='CANCELLED'
              AND recurrence_exception=true) = 1
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='reservation_recurrences' AND column_name='deleted_at'
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND tablename='reservation_recurrences'
           AND indexname='idx_recurrences_deleted_at'
       )`,
  ]).trim();
  if (v5UpgradeState !== "t") throw new Error("V5 recurrence migration did not preserve existing groups and reservations");

  const dump = (database) => run("docker", [
    "exec", containerName, "pg_dump", "--schema-only", "--no-owner", "--no-privileges",
    "-U", "worker_test", database,
  ]).split("\n").filter((line) => !line.startsWith("--") && !line.startsWith("\\")).join("\n").trim();
  const primarySchema = dump("worker_primary");
  const replaySchema = dump("worker_replay");
  if (primarySchema !== replaySchema) throw new Error("Replayed baseline schema differs");
  const v4UpgradeSchema = dump("worker_v4_upgrade");
  if (primarySchema !== v4UpgradeSchema) throw new Error("V4 standalone upgrade schema differs");
  const v5UpgradeSchema = dump("worker_v5_upgrade");
  if (primarySchema !== v5UpgradeSchema) throw new Error("V5 standalone upgrade schema differs");
  const schemaSha256 = createHash("sha256").update(primarySchema).digest("hex");
  process.stdout.write(`isolated_postgres=passed schema_sha256=${schemaSha256}\n`);
} finally {
  spawnSync("docker", ["stop", "--time", "5", containerName], { stdio: "ignore" });
}
