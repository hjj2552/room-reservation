import assert from "node:assert/strict";
import test from "node:test";

import { proxyApiRequest } from "../../cloudflare/apiProxy.ts";

function captureUpstream(response = new Response("ok")) {
  let capturedRequest;
  let calls = 0;

  return {
    fetch: async (request) => {
      calls += 1;
      capturedRequest = request;
      return response;
    },
    get request() {
      return capturedRequest;
    },
    get calls() {
      return calls;
    },
  };
}

test("forwards a GET path and query without a body", async () => {
  const upstream = captureUpstream();
  const request = new Request(
    "https://reservation.example/api/public/settings?name=room%20one&status=OPEN",
  );

  const response = await proxyApiRequest(request, "https://backend.example", upstream.fetch);

  assert.equal(response.status, 200);
  assert.equal(
    upstream.request.url,
    "https://backend.example/api/public/settings?name=room%20one&status=OPEN",
  );
  assert.equal(upstream.request.method, "GET");
  assert.equal(upstream.request.body, null);
  assert.equal(upstream.request.cache, "no-store");
  assert.equal(upstream.request.redirect, "manual");
});

test("forwards the root API path without adding or removing path segments", async () => {
  const upstream = captureUpstream();

  await proxyApiRequest(
    new Request("https://reservation.example/api?probe=true"),
    "https://backend.example/",
    upstream.fetch,
  );

  assert.equal(upstream.request.url, "https://backend.example/api?probe=true");
});

test("forwards a POST body, cookies, CSRF, authorization, and safe headers", async () => {
  const upstream = captureUpstream();
  const request = new Request("https://reservation.example/api/admin/reservations", {
    method: "POST",
    body: JSON.stringify({ purpose: "seminar" }),
    headers: {
      accept: "application/json",
      authorization: "Bearer test-token",
      connection: "keep-alive, x-remove-me",
      "content-length": "999",
      "content-type": "application/json",
      cookie: "SESSION=session-value; XSRF-TOKEN=csrf-cookie",
      "cf-connecting-ip": "203.0.113.10",
      "proxy-authorization": "should-not-pass",
      "x-remove-me": "connection-token-value",
      "x-xsrf-token": "csrf-header",
      "x-forwarded-for": "198.51.100.20, 198.51.100.21",
    },
  });

  await proxyApiRequest(request, "https://backend.example", upstream.fetch);

  assert.equal(await upstream.request.text(), JSON.stringify({ purpose: "seminar" }));
  assert.equal(upstream.request.headers.get("content-type"), "application/json");
  assert.equal(upstream.request.headers.get("accept"), "application/json");
  assert.equal(upstream.request.headers.get("authorization"), "Bearer test-token");
  assert.equal(
    upstream.request.headers.get("cookie"),
    "SESSION=session-value; XSRF-TOKEN=csrf-cookie",
  );
  assert.equal(upstream.request.headers.get("x-xsrf-token"), "csrf-header");
  assert.equal(upstream.request.headers.get("x-forwarded-for"), "203.0.113.10");
  assert.equal(upstream.request.headers.get("x-forwarded-proto"), "https");
  assert.equal(upstream.request.headers.get("x-forwarded-host"), "reservation.example");
  assert.equal(upstream.request.headers.get("host"), null);
  assert.equal(upstream.request.headers.get("content-length"), null);
  assert.equal(upstream.request.headers.get("connection"), null);
  assert.equal(upstream.request.headers.get("proxy-authorization"), null);
  assert.equal(upstream.request.headers.get("x-remove-me"), null);
});

test("does not trust a client X-Forwarded-For without CF-Connecting-IP", async () => {
  const upstream = captureUpstream();
  const request = new Request("https://reservation.example:8443/api/public/settings", {
    headers: { "x-forwarded-for": "198.51.100.25" },
  });

  await proxyApiRequest(request, "https://backend.example", upstream.fetch);

  assert.equal(upstream.request.headers.get("x-forwarded-for"), null);
  assert.equal(upstream.request.headers.get("x-forwarded-proto"), "https");
  assert.equal(upstream.request.headers.get("x-forwarded-host"), "reservation.example:8443");
});

test("returns the upstream response unchanged, including separate Set-Cookie headers", async () => {
  const headers = new Headers({
    "content-type": "application/json",
    location: "/admin/reservations",
    "x-upstream-header": "preserved",
  });
  headers.append("set-cookie", "SESSION=session-value; Path=/; Secure; HttpOnly");
  headers.append("set-cookie", "XSRF-TOKEN=csrf-value; Path=/; Secure");
  const upstreamResponse = new Response('{"status":"ok"}', { status: 201, headers });
  const upstream = captureUpstream(upstreamResponse);

  const response = await proxyApiRequest(
    new Request("https://reservation.example/api/auth/login", { method: "POST" }),
    "https://backend.example",
    upstream.fetch,
  );

  assert.strictEqual(response, upstreamResponse);
  assert.equal(response.status, 201);
  assert.equal(await response.text(), '{"status":"ok"}');
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("location"), "/admin/reservations");
  assert.equal(response.headers.get("x-upstream-header"), "preserved");
  assert.deepEqual(response.headers.getSetCookie(), [
    "SESSION=session-value; Path=/; Secure; HttpOnly",
    "XSRF-TOKEN=csrf-value; Path=/; Secure",
  ]);
});

test("rejects missing or unsafe backend origins without calling upstream", async () => {
  const invalidOrigins = [
    undefined,
    "",
    "not-a-url",
    "http://backend.example",
    "ftp://backend.example",
    "https://user:password@backend.example",
    "https://backend.example?debug=true",
    "https://backend.example#fragment",
    "https://backend.example/base-path",
  ];

  for (const origin of invalidOrigins) {
    const upstream = captureUpstream();
    const response = await proxyApiRequest(
      new Request("https://reservation.example/api/public/settings"),
      origin,
      upstream.fetch,
    );

    assert.equal(response.status, 500, String(origin));
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(upstream.calls, 0);
    assert.deepEqual(await response.json(), {
      code: "PROXY_CONFIGURATION_ERROR",
      message: "The API proxy is not configured correctly.",
    });
  }
});

test("allows HTTP only for explicit local development hosts", async () => {
  for (const origin of ["http://localhost:8080", "http://127.0.0.1:8080"]) {
    const upstream = captureUpstream();
    const response = await proxyApiRequest(
      new Request("http://localhost:8788/api/public/settings"),
      origin,
      upstream.fetch,
    );

    assert.equal(response.status, 200);
    assert.equal(upstream.calls, 1);
  }
});

test("returns a generic 502 without retrying or exposing the backend URL", async () => {
  let calls = 0;
  const response = await proxyApiRequest(
    new Request("https://reservation.example/api/public/settings"),
    "https://sensitive-backend.example",
    async () => {
      calls += 1;
      throw new Error("connect ECONNREFUSED https://sensitive-backend.example");
    },
  );

  assert.equal(response.status, 502);
  assert.equal(calls, 1);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.text();
  assert.match(body, /UPSTREAM_UNAVAILABLE/);
  assert.doesNotMatch(body, /sensitive-backend/);
});

test("does not attach a body to HEAD requests", async () => {
  const upstream = captureUpstream();

  await proxyApiRequest(
    new Request("https://reservation.example/api/public/settings", { method: "HEAD" }),
    "https://backend.example",
    upstream.fetch,
  );

  assert.equal(upstream.request.method, "HEAD");
  assert.equal(upstream.request.body, null);
});
