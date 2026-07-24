import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");

function parseVars(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)].toFixed(3));
}

async function timedFetch(url, options) {
  const started = performance.now();
  const response = await fetch(url, options);
  const json = await response.json();
  return { status: response.status, json, wallMs: Number((performance.now() - started).toFixed(3)) };
}

const runtime = parseVars(await readFile(path.join(projectRoot, ".dev.vars.p3-neon-runtime"), "utf8"));
const idle = parseVars(await readFile(path.join(projectRoot, ".dev.vars.p3-neon-idle"), "utf8"));
const idleMs = Date.now() - new Date(idle.P3_NEON_IDLE_STARTED_AT).getTime();
assert(idleMs >= 300_000, `Neon idle period is only ${Math.floor(idleMs / 1000)} seconds`);

const headers = { "X-P3-Probe-Token": runtime.P3_NEON_PROBE_TOKEN };
const first = await timedFetch(`${runtime.P3_NEON_WORKER_ORIGIN}/api/p3-neon/query?value=idle-resume`, { headers });
assert(first.status === 200 && first.json.value === "idle-resume", "first query after idle failed");

const transaction = await timedFetch(`${runtime.P3_NEON_WORKER_ORIGIN}/api/p3-neon/transaction/websocket/commit`, {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ marker: `testing-idle-resume-${randomUUID()}` }),
});
assert(transaction.status === 200 && transaction.json.committed === true && transaction.json.connectionClosed === true, "WebSocket transaction after idle failed");

const reconnect = await timedFetch(`${runtime.P3_NEON_WORKER_ORIGIN}/api/p3-neon/transaction/websocket/rollback`, {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ marker: `testing-idle-reconnect-${randomUUID()}` }),
});
assert(reconnect.status === 200 && reconnect.json.rolledBack === true && reconnect.json.connectionClosed === true, "WebSocket reconnect rollback failed");

const warm = [];
for (let index = 0; index < 10; index += 1) {
  const result = await timedFetch(`${runtime.P3_NEON_WORKER_ORIGIN}/api/p3-neon/query?value=warm-${index}`, { headers });
  assert(result.status === 200 && result.json.value === `warm-${index}`, `warm query ${index} failed`);
  warm.push(result.wallMs);
}

process.stdout.write(`${JSON.stringify({
  idleSeconds: Math.floor(idleMs / 1000),
  firstQueryAfterIdle: { status: first.status, wallMs: first.wallMs },
  firstWebSocketTransactionAfterIdle: { status: transaction.status, wallMs: transaction.wallMs, connectionClosed: true },
  websocketReconnectRollback: { status: reconnect.status, wallMs: reconnect.wallMs, connectionClosed: true },
  warmQueries: {
    samples: warm.length,
    p50: percentile(warm, 0.5),
    p95: percentile(warm, 0.95),
    max: Number(Math.max(...warm).toFixed(3)),
  },
})}\n`);
