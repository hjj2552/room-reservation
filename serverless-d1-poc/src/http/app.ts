import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { parseUtcInstant, validateReservationWindow } from "../core/time-policy";
import { D1ReservationRepository, D1SessionStore, ReservationConflictError } from "../infra/d1-adapter";
import { createOpaqueToken, hashOpaqueToken } from "../security/web-crypto";

const SESSION_COOKIE = "P3-D1-SESSION";
const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-XSRF-TOKEN";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface Env {
  DB: D1Database;
}

export function createApp(now: () => number = Date.now): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/api/p3-d1/runtime", (context) =>
    context.json({ runtime: "cloudflare-workers", database: "d1", scope: "p3-experiment" }),
  );

  app.post("/api/p3-d1/reservations", async (context) => {
    const input = await context.req.json<{
      roomId: string;
      startAt: string;
      endAt: string;
      purpose: string;
    }>();
    try {
      const startAtUtcMs = parseUtcInstant(input.startAt);
      const endAtUtcMs = parseUtcInstant(input.endAt);
      validateReservationWindow({ startAtUtcMs, endAtUtcMs }, now(), "public");
      await new D1ReservationRepository(context.env.DB).createWithAuditEvent({
        id: crypto.randomUUID(),
        roomId: input.roomId,
        status: "REQUESTED",
        startAtUtcMs,
        endAtUtcMs,
        purpose: input.purpose,
        createdAtUtcMs: now(),
      });
      return context.json({ created: true }, 201);
    } catch (error) {
      if (error instanceof ReservationConflictError) {
        return context.json({ code: "RESERVATION_CONFLICT" }, 409);
      }
      if (error instanceof Error && /^[A-Z_]+$/.test(error.message)) {
        return context.json({ code: error.message }, 400);
      }
      throw error;
    }
  });

  app.post("/api/p3-d1/session", async (context) => {
    const sessionId = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const createdAtUtcMs = now();
    const expiresAtUtcMs = createdAtUtcMs + SESSION_TTL_MS;
    await new D1SessionStore(context.env.DB).create({
      sessionIdDigest: await hashOpaqueToken(sessionId),
      csrfTokenDigest: await hashOpaqueToken(csrfToken),
      expiresAtUtcMs,
      createdAtUtcMs,
    });
    const expires = new Date(expiresAtUtcMs);
    setCookie(context, SESSION_COOKIE, sessionId, {
      expires,
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      secure: true,
    });
    setCookie(context, CSRF_COOKIE, csrfToken, {
      expires,
      httpOnly: false,
      path: "/",
      sameSite: "Lax",
      secure: true,
    });
    return context.json({ authenticated: true });
  });

  async function authenticate(context: Context<{ Bindings: Env }>) {
    const sessionId = getCookie(context, SESSION_COOKIE);
    if (!sessionId) return { error: "UNAUTHORIZED" as const };
    const record = await new D1SessionStore(context.env.DB).find(await hashOpaqueToken(sessionId));
    if (!record || record.expiresAtUtcMs <= now()) return { error: "UNAUTHORIZED" as const };
    const csrfCookie = getCookie(context, CSRF_COOKIE);
    const csrfHeader = context.req.header(CSRF_HEADER);
    if (
      !csrfCookie ||
      !csrfHeader ||
      csrfCookie !== csrfHeader ||
      record.csrfTokenDigest !== (await hashOpaqueToken(csrfHeader))
    ) {
      return { error: "INVALID_CSRF_TOKEN" as const };
    }
    return { sessionIdDigest: record.sessionIdDigest };
  }

  app.post("/api/p3-d1/protected", async (context) => {
    const auth = await authenticate(context);
    if ("error" in auth) {
      return context.json({ code: auth.error }, auth.error === "UNAUTHORIZED" ? 401 : 403);
    }
    return context.json({ ok: true });
  });

  app.delete("/api/p3-d1/session", async (context) => {
    const auth = await authenticate(context);
    if ("error" in auth) {
      return context.json({ code: auth.error }, auth.error === "UNAUTHORIZED" ? 401 : 403);
    }
    await new D1SessionStore(context.env.DB).delete(auth.sessionIdDigest);
    deleteCookie(context, SESSION_COOKIE, { path: "/", secure: true, sameSite: "Lax" });
    deleteCookie(context, CSRF_COOKIE, { path: "/", secure: true, sameSite: "Lax" });
    return context.body(null, 204);
  });

  return app;
}
