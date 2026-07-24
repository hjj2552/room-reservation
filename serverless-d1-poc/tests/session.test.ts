import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { hashOpaqueToken } from "../src/security/web-crypto";
import { cookieValue, ensureMigrations } from "./helpers";

describe("D1-backed session and existing CSRF contract", () => {
  beforeAll(ensureMigrations);

  it("accepts matching tokens, rejects missing/mismatched tokens, and invalidates logout", async () => {
    const login = await SELF.fetch("https://example.test/api/p3-d1/session", { method: "POST" });
    const setCookies = login.headers.getSetCookie();
    const session = cookieValue(setCookies, "P3-D1-SESSION");
    const csrf = cookieValue(setCookies, "XSRF-TOKEN");
    expect(setCookies.find((value) => value.startsWith("P3-D1-SESSION="))).toMatch(
      /HttpOnly; Secure; SameSite=Lax/i,
    );
    expect(setCookies.find((value) => value.startsWith("XSRF-TOKEN="))).toMatch(
      /Path=\/;.*Secure; SameSite=Lax/i,
    );
    expect(setCookies.find((value) => value.startsWith("XSRF-TOKEN="))).not.toMatch(/HttpOnly/i);

    const headers = { cookie: `P3-D1-SESSION=${session}; XSRF-TOKEN=${csrf}`, "X-XSRF-TOKEN": csrf };
    expect(
      (await SELF.fetch("https://example.test/api/p3-d1/protected", { method: "POST", headers })).status,
    ).toBe(200);
    expect(
      (
        await SELF.fetch("https://example.test/api/p3-d1/protected", {
          method: "POST",
          headers: { cookie: `P3-D1-SESSION=${session}; XSRF-TOKEN=${csrf}` },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await SELF.fetch("https://example.test/api/p3-d1/protected", {
          method: "POST",
          headers: {
            cookie: `P3-D1-SESSION=${session}; XSRF-TOKEN=${csrf}`,
            "X-XSRF-TOKEN": "wrong",
          },
        })
      ).status,
    ).toBe(403);

    expect(
      (await SELF.fetch("https://example.test/api/p3-d1/session", { method: "DELETE", headers })).status,
    ).toBe(204);
    expect(
      (await SELF.fetch("https://example.test/api/p3-d1/protected", { method: "POST", headers })).status,
    ).toBe(401);
  });

  it("rejects an expired session and stores only token digests", async () => {
    const login = await SELF.fetch("https://example.test/api/p3-d1/session", { method: "POST" });
    const setCookies = login.headers.getSetCookie();
    const session = cookieValue(setCookies, "P3-D1-SESSION");
    const csrf = cookieValue(setCookies, "XSRF-TOKEN");
    const digest = await hashOpaqueToken(session);
    const row = await env.DB.prepare(
      "SELECT session_id_digest, csrf_token_digest FROM p3_d1_admin_sessions WHERE session_id_digest = ?",
    )
      .bind(digest)
      .first<{ session_id_digest: string; csrf_token_digest: string }>();
    expect(row?.session_id_digest).toBe(digest);
    expect(row?.session_id_digest).not.toContain(session);
    expect(row?.csrf_token_digest).not.toContain(csrf);

    await env.DB.prepare("UPDATE p3_d1_admin_sessions SET expires_at_utc_ms = 0 WHERE session_id_digest = ?")
      .bind(digest)
      .run();
    const response = await SELF.fetch("https://example.test/api/p3-d1/protected", {
      method: "POST",
      headers: {
        cookie: `P3-D1-SESSION=${session}; XSRF-TOKEN=${csrf}`,
        "X-XSRF-TOKEN": csrf,
      },
    });
    expect(response.status).toBe(401);
  });
});
