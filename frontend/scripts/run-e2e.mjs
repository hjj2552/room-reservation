import { spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupE2eData } from './cleanup-e2e-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const backendUrl = process.env.E2E_BACKEND_URL || 'http://127.0.0.1:8080/api/public/settings';
const frontendUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const cleanupRequired = process.env.E2E_CLEANUP_REQUIRED !== 'false';

let frontendProcess = null;
let frontendOutFd = null;
let frontendErrFd = null;

async function main() {
  try {
    if (!(await isReachable(backendUrl))) {
      throw new Error(
        `E2E Worker is not reachable at ${backendUrl}. ` +
          'Run npm.cmd run test:local-e2e from the worker directory for an isolated local suite.',
      );
    }
    console.log('Using existing E2E Worker.');

    const frontendAlreadyRunning = await isReachable(frontendUrl);
    if (!frontendAlreadyRunning) {
      console.log('Starting E2E frontend...');
      frontendProcess = await startFrontend();
    } else {
      console.log('Using existing E2E frontend.');
    }

    await cleanupE2eData({ required: cleanupRequired, label: 'before-suite' });

    console.log('Running Playwright E2E...');
    const playwrightCli = path.join(frontendRoot, 'node_modules', 'playwright', 'cli.js');
    process.exitCode = await runCommand(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)]);
  } finally {
    try {
      await cleanupE2eData({ required: cleanupRequired, label: 'after-suite' });
      if (cleanupRequired) {
        const preview = await cleanupE2eData({
          required: true,
          label: 'after-suite-preview',
          preview: true,
        });
        assertNoE2eDataLeft(preview);
      }
    } finally {
      stopFrontend();
    }
  }
}

async function startFrontend() {
  const logDir = path.join(frontendRoot, 'test-results', 'frontend');
  await mkdir(logDir, { recursive: true });

  frontendOutFd = openSync(path.join(logDir, 'frontend.out.log'), 'a');
  frontendErrFd = openSync(path.join(logDir, 'frontend.err.log'), 'a');
  const frontendPort = new URL(frontendUrl).port;
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm.cmd', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', frontendPort]
    : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', frontendPort];
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

function assertNoE2eDataLeft(summary) {
  if (!summary) {
    throw new Error('E2E cleanup preview did not return a summary.');
  }
  const remaining =
    summary.reservationHistoriesDeleted +
    summary.reservationsDeleted +
    summary.recurrencesDeleted +
    summary.tagsDeleted +
    summary.tagsSkipped +
    summary.roomsDeleted +
    summary.roomsSkipped;
  if (remaining > 0) {
    throw new Error(
      'E2E cleanup left matching test data after after-suite cleanup: ' +
        `${summary.reservationHistoriesDeleted} histories, ` +
        `${summary.reservationsDeleted} reservations, ` +
        `${summary.recurrencesDeleted} recurrences, ` +
        `${summary.tagsDeleted} tags, ` +
        `${summary.tagsSkipped} skipped tags, ` +
        `${summary.roomsDeleted} rooms, ` +
        `${summary.roomsSkipped} skipped rooms.`
    );
  }
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
});
process.on('SIGINT', () => {
  stopFrontend();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopFrontend();
  process.exit(143);
});

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
