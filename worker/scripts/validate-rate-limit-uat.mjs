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
if (process.env.P4_UAT_CONFIRM_DISPOSABLE !== "true") {
  throw new Error("P4_UAT_CONFIRM_DISPOSABLE must be exactly true");
}

const input = process.env.P4_UAT_PAGES_URL;
if (!input) throw new Error("P4_UAT_PAGES_URL is required");
const pagesUrl = new URL(input);
if (
  pagesUrl.protocol !== "https:"
  || pagesUrl.pathname !== "/"
  || pagesUrl.search
  || pagesUrl.hash
  || !pagesUrl.hostname.endsWith(".room-reservation-jnunursing.pages.dev")
  || pagesUrl.hostname === "room-reservation-jnunursing.pages.dev"
) {
  throw new Error("P4_UAT_PAGES_URL must be the exact disposable Pages preview origin");
}

const origin = pagesUrl.origin;

function cookieHeader(response) {
  return response.headers.getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

async function loginAdmin() {
  const adminPassword = process.env.P4_UAT_ADMIN_PASSWORD;
  if (!adminPassword) throw new Error("P4_UAT_ADMIN_PASSWORD is required for saturation mode");
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
    body: JSON.stringify({ username: "admin", password: adminPassword }),
  });
  if (loginResponse.status !== 200) throw new Error(`Admin login failed: ${loginResponse.status}`);
  return cookie;
}

async function firstRateLimited(method, maximum) {
  for (let requestNumber = 1; requestNumber <= maximum; requestNumber += 1) {
    const response = await fetch(`${origin}/api/public/settings`, { method });
    if (response.status === 429) {
      const body = await response.json();
      if (
        response.headers.get("Retry-After") !== "60"
        || body.code !== "RATE_LIMIT_EXCEEDED"
        || body.message !== "Too many requests. Please retry later."
        || body.details?.retryAfterSeconds !== 60
      ) {
        throw new Error("Remote 429 response contract mismatch");
      }
      return requestNumber;
    }
  }
  throw new Error(`${method} burst did not produce 429 within ${maximum} requests`);
}

async function observeIngressLimit(adminCookie, maximum, batchSize = 100) {
  for (let requestsAttempted = batchSize; requestsAttempted <= maximum; requestsAttempted += batchSize) {
    const responses = await Promise.all(Array.from({ length: batchSize }, () => (
      fetch(`${origin}/api/public/settings`, {
        headers: { cookie: adminCookie },
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
      return requestsAttempted;
    }
  }
  throw new Error(`Authenticated ingress burst did not produce 429 within ${maximum} requests`);
}

if (mode === "saturate-ingress") {
  const adminCookie = await loginAdmin();
  const requestsAttemptedBefore429Observation = await observeIngressLimit(adminCookie, 2400);
  const forgedResponse = await fetch(`${origin}/api/public/settings`, {
    headers: {
      cookie: adminCookie,
      "X-Forwarded-For": "192.0.2.200",
      "X-Room-Reservation-Client-IP": "192.0.2.201",
    },
  });
  if (forgedResponse.status !== 429) {
    throw new Error(`Forged client-IP headers changed the saturated ingress bucket: ${forgedResponse.status}`);
  }
  process.stdout.write(`${JSON.stringify({
    serviceBindingPath: true,
    authenticatedAdminIngressLimited: true,
    ingress429Observed: true,
    requestsAttemptedBefore429Observation,
    forgedHeadersIgnored: true,
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
  const publicRead429At = await firstRateLimited("GET", 360);
  process.stdout.write(`${JSON.stringify({
    publicRead429Observed: true,
    publicRead429At,
  })}\n`);
} else if (mode === "saturate") {
  const adminCookie = await loginAdmin();
  const publicRead429At = await firstRateLimited("GET", 360);

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

  const publicWrite429At = await firstRateLimited("POST", 120);
  process.stdout.write(`${JSON.stringify({
    serviceBindingPath: true,
    publicRead429Observed: true,
    publicRead429At,
    publicWrite429Observed: true,
    publicWrite429At,
    authenticatedAdminBypassRequests: 125,
    forgedHeadersIgnored: true,
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
