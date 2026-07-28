import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.resolve(workerRoot, "..", "frontend");
const suffix = `${process.pid}-${Date.now()}`;
const containerName = `room-reservation-worker-e2e-${suffix}`;
if (!/^room-reservation-worker-e2e-[0-9]+-[0-9]+$/.test(containerName)) {
  throw new Error("Unsafe temporary container name");
}

let serverProcess;

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Could not allocate a local E2E port"));
        return;
      }
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

async function waitFor(url, processRef) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) throw new Error("Local Worker adapter exited before readiness");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function stopProcess(processRef) {
  if (!processRef || processRef.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(processRef.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    processRef.kill("SIGTERM");
  }
}

try {
  const backendPort = await findAvailablePort();
  let frontendPort = await findAvailablePort();
  while (frontendPort === backendPort) frontendPort = await findAvailablePort();
  const backendOrigin = `http://127.0.0.1:${backendPort}`;
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;

  run("docker", [
    "run", "--detach", "--rm", "--name", containerName,
    "--env", "POSTGRES_USER=worker_e2e",
    "--env", "POSTGRES_PASSWORD=worker_e2e_password",
    "--env", "POSTGRES_DB=worker_e2e",
    "--publish", "127.0.0.1::5432",
    "postgres:17-alpine",
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "worker_e2e"], { stdio: "ignore" }).status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  const portOutput = run("docker", ["port", containerName, "5432/tcp"]);
  const port = /:(\d+)\s*$/.exec(portOutput)?.[1];
  if (!port) throw new Error(`Could not determine PostgreSQL port: ${portOutput}`);
  const databaseUrl = `postgresql://worker_e2e:worker_e2e_password@127.0.0.1:${port}/worker_e2e`;

  run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], {
    cwd: workerRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  run("docker", [
    "exec", containerName, "psql", "-U", "worker_e2e", "-d", "worker_e2e",
    "-c", "UPDATE operation_settings SET reservation_enabled=true, semester_end_date=current_date + interval '180 days';",
  ]);

  serverProcess = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/local-server.ts"], {
    cwd: workerRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      APP_ENV: "local",
      E2E_CLEANUP_ENABLED: "true",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "admin1234",
      PORT: String(backendPort),
    },
    stdio: "inherit",
    windowsHide: true,
  });
  await waitFor(`${backendOrigin}/api/public/settings`, serverProcess);

  const frontend = spawnSync(process.execPath, ["scripts/run-e2e.mjs", ...process.argv.slice(2)], {
    cwd: frontendRoot,
    env: {
      ...process.env,
      E2E_BACKEND_URL: `${backendOrigin}/api/public/settings`,
      E2E_API_BASE_URL: backendOrigin,
      VITE_API_PROXY_TARGET: backendOrigin,
      PLAYWRIGHT_BASE_URL: frontendOrigin,
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "admin1234",
    },
    stdio: "inherit",
    windowsHide: true,
  });
  if (frontend.error) throw frontend.error;
  if (frontend.status !== 0) throw new Error(`Frontend E2E failed with ${frontend.status}`);
} finally {
  stopProcess(serverProcess);
  spawnSync("docker", ["stop", "--time", "5", containerName], { stdio: "ignore" });
}
