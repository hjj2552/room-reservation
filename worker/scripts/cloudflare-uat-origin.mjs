export function disposableUatOriginFromEnv(env = process.env) {
  if (env.P4_UAT_CONFIRM_DISPOSABLE !== "true") {
    throw new Error("P4_UAT_CONFIRM_DISPOSABLE must be exactly true");
  }
  const workerName = env.CLOUDFLARE_WORKER_NAME?.trim();
  if (!workerName || !/(^|-)uat(?:-|$)/.test(workerName)) {
    throw new Error("CLOUDFLARE_WORKER_NAME must identify a disposable UAT Worker");
  }
  const input = env.CLOUDFLARE_UAT_ORIGIN;
  if (!input) throw new Error("CLOUDFLARE_UAT_ORIGIN is required");
  const origin = new URL(input);
  if (
    origin.protocol !== "https:"
    || origin.username
    || origin.password
    || origin.port
    || origin.pathname !== "/"
    || origin.search
    || origin.hash
    || !origin.hostname.endsWith(".workers.dev")
    || origin.hostname.split(".").length < 4
    || !origin.hostname.startsWith(`${workerName}.`)
  ) {
    throw new Error("CLOUDFLARE_UAT_ORIGIN must be the exact disposable Worker origin");
  }
  return origin.origin;
}
