import { spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupE2eData } from './cleanup-e2e-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..');
const backendRoot = path.join(repoRoot, 'backend');
const backendUrl = process.env.E2E_BACKEND_URL || 'http://127.0.0.1:8080/api/public/settings';
const frontendUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

let backendProcess = null;
let frontendProcess = null;
let backendOutFd = null;
let backendErrFd = null;
let frontendOutFd = null;
let frontendErrFd = null;

async function main() {
  try {
    const backendAlreadyRunning = await isReachable(backendUrl);
    if (!backendAlreadyRunning) {
      console.log('Starting E2E backend...');
      backendProcess = await startBackend();
    } else {
      console.log('Using existing E2E backend.');
    }

    const frontendAlreadyRunning = await isReachable(frontendUrl);
    if (!frontendAlreadyRunning) {
      console.log('Starting E2E frontend...');
      frontendProcess = await startFrontend();
    } else {
      console.log('Using existing E2E frontend.');
    }

    await cleanupE2eData({ required: false, label: 'before-suite' });

    console.log('Running Playwright E2E...');
    const playwrightCli = path.join(frontendRoot, 'node_modules', 'playwright', 'cli.js');
    process.exitCode = await runCommand(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)]);
  } finally {
    await cleanupE2eData({ required: false, label: 'after-suite' });
    stopFrontend();
    stopBackend();
  }
}

async function startBackend() {
  const logDir = path.join(frontendRoot, 'test-results', 'backend');
  await mkdir(logDir, { recursive: true });

  backendOutFd = openSync(path.join(logDir, 'backend.out.log'), 'a');
  backendErrFd = openSync(path.join(logDir, 'backend.err.log'), 'a');
  const processRef = spawn('java', ['-jar', 'build/libs/room-reservation-backend-0.0.1-SNAPSHOT.jar'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      SPRING_PROFILES_ACTIVE: process.env.SPRING_PROFILES_ACTIVE || process.env.E2E_BACKEND_PROFILE || 'e2e',
    },
    stdio: ['ignore', backendOutFd, backendErrFd],
    windowsHide: true,
    detached: true,
  });

  await waitForBackend(processRef);
  processRef.unref();
  return processRef;
}

async function waitForBackend(processRef) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) {
      throw new Error('E2E backend process exited before it became ready.');
    }
    if (await isReachable(backendUrl)) {
      return;
    }
    await delay(1_000);
  }
  throw new Error(`E2E backend did not become ready at ${backendUrl}.`);
}

async function startFrontend() {
  const logDir = path.join(frontendRoot, 'test-results', 'frontend');
  await mkdir(logDir, { recursive: true });

  frontendOutFd = openSync(path.join(logDir, 'frontend.out.log'), 'a');
  frontendErrFd = openSync(path.join(logDir, 'frontend.err.log'), 'a');
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm.cmd', 'run', 'dev', '--', '--host', '127.0.0.1']
    : ['run', 'dev', '--', '--host', '127.0.0.1'];
  const processRef = spawn(command, args, {
    cwd: frontendRoot,
    stdio: ['ignore', frontendOutFd, frontendErrFd],
    windowsHide: true,
    detached: true,
  });

  await waitForProcessUrl(processRef, frontendUrl, 'frontend');
  processRef.unref();
  return processRef;
}

async function waitForProcessUrl(processRef, url, label) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) {
      throw new Error(`E2E ${label} process exited before it became ready.`);
    }
    if (await isReachable(url)) {
      return;
    }
    await delay(1_000);
  }
  throw new Error(`E2E ${label} did not become ready at ${url}.`);
}

async function isReachable(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: frontendRoot,
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function stopBackend() {
  if (!backendProcess || backendProcess.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(backendProcess.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    killProcessGroup(backendProcess);
  }

  closeBackendLogs();
  backendProcess = null;
}

function stopFrontend() {
  if (!frontendProcess || frontendProcess.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(frontendProcess.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    killProcessGroup(frontendProcess);
  }

  closeFrontendLogs();
  frontendProcess = null;
}

function closeBackendLogs() {
  for (const fd of [backendOutFd, backendErrFd]) {
    if (fd !== null) {
      closeSync(fd);
    }
  }
  backendOutFd = null;
  backendErrFd = null;
}

function closeFrontendLogs() {
  for (const fd of [frontendOutFd, frontendErrFd]) {
    if (fd !== null) {
      closeSync(fd);
    }
  }
  frontendOutFd = null;
  frontendErrFd = null;
}

function killProcessGroup(processRef) {
  try {
    process.kill(-processRef.pid, 'SIGTERM');
  } catch {
    processRef.kill('SIGTERM');
  }
}

process.on('exit', () => {
  stopFrontend();
  stopBackend();
});
process.on('SIGINT', () => {
  stopFrontend();
  stopBackend();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopFrontend();
  stopBackend();
  process.exit(143);
});

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
