import { disposableUatOriginFromEnv } from "./cloudflare-uat-origin.mjs";

const mode = process.argv[2];
if (
  mode !== "saturate"
  && mode !== "saturate-read"
  && mode !== "recover"
  && mode !== "saturate-ingress"
  && mode !== "recover-ingress"
) {
  throw new Error(
    "Use validate-rate-limit-uat.mjs with saturate, saturate-read, recover, saturate-ingress, or recover-ingress",
  );
}
const origin = disposableUatOriginFromEnv();

function cookieHeader(response) {
  return response.headers.getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

async function loginAdmin() {
  const adminUsername = process.env.P4_UAT_ADMIN_USERNAME;
  const adminPassword = process.env.P4_UAT_ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) {
    throw new Error("P4_UAT_ADMIN_USERNAME and P4_UAT_ADMIN_PASSWORD are required for saturation mode");
  }
  const csrfResponse = await fetch(`${origin}/api/auth/csrf`);
  if (csrfResponse.status !== 200) throw new Error(`CSRF issuance failed: ${csrfResponse.status}`);
  const csrf = await csrfResponse.json();
  const cookie = cookieHeader(csrfResponse);
  const loginResponse = await fetch(`${origin}/api/auth/admin/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      "X-XSRF-TOKEN": csrf.token,
    },
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });
  if (loginResponse.status !== 200) throw new Error(`Admin login failed: ${loginResponse.status}`);
  return cookie;
}

async function verifyStaticAssetsRemainAvailable() {
  const documentResponse = await fetch(`${origin}/`);
  if (documentResponse.status !== 200) {
    throw new Error(`Static document failed after API saturation: ${documentResponse.status}`);
  }
  const document = await documentResponse.text();
  const assetPath = document.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
  if (!assetPath) throw new Error("Static document did not reference a build asset");
  const assetResponse = await fetch(`${origin}${assetPath}`);
  if (assetResponse.status !== 200) {
    throw new Error(`Static build asset failed after API saturation: ${assetResponse.status}`);
  }
}

async function observeProductLimit(method, maximum, batchSize = 60) {
  for (let requestsAttempted = batchSize; requestsAttempted <= maximum; requestsAttempted += batchSize) {
    const responses = await Promise.all(Array.from({ length: batchSize }, () => (
      fetch(`${origin}/api/public/settings`, { method })
    )));
    const limitedResponse = responses.find((response) => response.status === 429);
    if (limitedResponse) {
      const body = await limitedResponse.json();
      if (
        limitedResponse.headers.get("Retry-After") !== "60"
        || body.code !== "RATE_LIMIT_EXCEEDED"
        || body.message !== "Too many requests. Please retry later."
        || body.details?.retryAfterSeconds !== 60
      ) {
        throw new Error("Remote 429 response contract mismatch");
      }
      return;
    }
  }
  throw new Error(`${method} batches did not produce 429 within the bounded UAT attempt`);
}

async function observeIngressLimit(adminCookie, maximum, batchSize = 100, additionalHeaders = {}) {
  for (let requestsAttempted = batchSize; requestsAttempted <= maximum; requestsAttempted += batchSize) {
    const responses = await Promise.all(Array.from({ length: batchSize }, () => (
      fetch(`${origin}/api/public/settings`, {
        headers: { ...additionalHeaders, cookie: adminCookie },
      })
    )));
    const limitedResponse = responses.find((response) => response.status === 429);
    for (const response of responses) {
      if (response.status !== 200 && response.status !== 429) {
        throw new Error(`Authenticated ingress request failed: ${response.status}`);
      }
    }
    if (limitedResponse) {
      const body = await limitedResponse.json();
      if (
        limitedResponse.headers.get("Retry-After") !== "60"
        || body.code !== "RATE_LIMIT_EXCEEDED"
        || body.message !== "Too many requests. Please retry later."
        || body.details?.retryAfterSeconds !== 60
      ) {
        throw new Error("Remote ingress 429 response contract mismatch");
      }
      return;
    }
  }
  throw new Error(`Authenticated ingress burst did not produce 429 within ${maximum} requests`);
}

if (mode === "saturate-ingress") {
  const adminCookie = await loginAdmin();
  await observeIngressLimit(adminCookie, 2400);
  await observeIngressLimit(adminCookie, 300, 50, {
      "X-Forwarded-For": "192.0.2.200",
      "X-Room-Reservation-Client-IP": "192.0.2.201",
  });
  await verifyStaticAssetsRemainAvailable();
  process.stdout.write(`${JSON.stringify({
    staticAssetsWorkerPath: true,
    authenticatedAdminIngressLimited: true,
    ingress429Observed: true,
    forgedHeadersIgnored: true,
    staticAssetsUnaffected: true,
  })}\n`);
} else if (mode === "recover-ingress") {
  const response = await fetch(`${origin}/api/public/settings`);
  if (response.status !== 200) {
    throw new Error(`Ingress recovery failed: ${response.status}`);
  }
  process.stdout.write(`${JSON.stringify({
    ingressRecovered: true,
    status: response.status,
  })}\n`);
} else if (mode === "saturate-read") {
  await observeProductLimit("GET", 360);
  process.stdout.write(`${JSON.stringify({
    publicRead429Observed: true,
  })}\n`);
} else if (mode === "saturate") {
  const adminCookie = await loginAdmin();
  await observeProductLimit("GET", 360);

  const forgedResponse = await fetch(`${origin}/api/public/settings`, {
    headers: {
      "X-Forwarded-For": "192.0.2.200",
      "X-Room-Reservation-Client-IP": "192.0.2.201",
    },
  });
  if (forgedResponse.status !== 429) {
    throw new Error(`Forged client-IP headers changed the saturated bucket: ${forgedResponse.status}`);
  }

  for (let requestNumber = 1; requestNumber <= 125; requestNumber += 1) {
    const response = await fetch(`${origin}/api/public/settings`, {
      headers: { cookie: adminCookie },
    });
    if (response.status !== 200) {
      throw new Error(`Authenticated admin bypass failed at request ${requestNumber}: ${response.status}`);
    }
  }

  await observeProductLimit("POST", 120);
  await verifyStaticAssetsRemainAvailable();
  process.stdout.write(`${JSON.stringify({
    staticAssetsWorkerPath: true,
    publicRead429Observed: true,
    publicWrite429Observed: true,
    authenticatedAdminBypassRequests: 125,
    forgedHeadersIgnored: true,
    staticAssetsUnaffected: true,
  })}\n`);
} else {
  const read = await fetch(`${origin}/api/public/settings`);
  const write = await fetch(`${origin}/api/public/settings`, { method: "POST" });
  if (read.status !== 200 || write.status === 429) {
    throw new Error(`Rate-limit recovery failed: read=${read.status}, write=${write.status}`);
  }
  process.stdout.write(`${JSON.stringify({
    readRecovered: true,
    readStatus: read.status,
    writeRecovered: true,
    writeStatus: write.status,
  })}\n`);
}
