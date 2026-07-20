import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const suffix = `${process.pid}-${Date.now()}`;
const containerName = `room-reservation-p3-poc-${suffix}`;
if (!/^room-reservation-p3-poc-[0-9]+-[0-9]+$/.test(containerName)) {
  throw new Error("Unsafe temporary container name");
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
};

const runProjectCommand = (args, databaseUrl) => {
  const result = spawnSync(process.execPath, args, {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0) throw new Error(`node ${args.join(" ")} failed with ${result.status}`);
};

try {
  run("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "--env",
    "POSTGRES_USER=p3_poc",
    "--env",
    "POSTGRES_PASSWORD=p3_poc_password",
    "--env",
    "POSTGRES_DB=p3_poc",
    "--publish",
    "127.0.0.1::5432",
    "postgres:17-alpine",
  ]);

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "p3_poc"], {
      encoding: "utf8",
    });
    if (probe.status === 0) {
      ready = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");

  const portOutput = run("docker", ["port", containerName, "5432/tcp"]);
  const port = /:(\d+)\s*$/.exec(portOutput)?.[1];
  if (!port) throw new Error(`Could not determine mapped PostgreSQL port: ${portOutput}`);

  const baseUrl = `postgresql://p3_poc:p3_poc_password@127.0.0.1:${port}`;
  const primaryUrl = `${baseUrl}/p3_poc`;
  runProjectCommand(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], primaryUrl);
  runProjectCommand(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], primaryUrl);
  runProjectCommand(
    ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.postgres.config.ts"],
    primaryUrl,
  );

  run("docker", ["exec", containerName, "createdb", "-U", "p3_poc", "p3_poc_replay"]);
  const replayUrl = `${baseUrl}/p3_poc_replay`;
  runProjectCommand(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], replayUrl);

  const dump = (database) =>
    run("docker", [
      "exec",
      containerName,
      "pg_dump",
      "--schema-only",
      "--no-owner",
      "--no-privileges",
      "-U",
      "p3_poc",
      database,
    ])
      .split("\n")
      .filter((line) => !line.startsWith("--") && !line.startsWith("\\"))
      .join("\n")
      .trim();
  const primarySchema = dump("p3_poc");
  const replaySchema = dump("p3_poc_replay");
  if (primarySchema !== replaySchema) throw new Error("Replayed baseline schema differs");
  const schemaSha256 = createHash("sha256").update(primarySchema).digest("hex");
  process.stdout.write(`isolated_postgres=passed schema_sha256=${schemaSha256}\n`);
} finally {
  spawnSync("docker", ["stop", "--time", "5", containerName], { stdio: "ignore" });
}
