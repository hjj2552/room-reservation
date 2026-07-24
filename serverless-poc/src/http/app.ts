import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { CleanupPort, SessionStore } from "../core/ports";
import type { RuntimeConfig } from "../core/runtime-config";
import { shouldRegisterCleanup } from "../core/runtime-config";
import { createOpaqueToken, hashOpaqueToken } from "../security/web-crypto";
import { getTrustedClientIp } from "./client-ip";

const SESSION_COOKIE = "P3-SESSION";
const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-XSRF-TOKEN";

export interface HttpDependencies {
  sessions: SessionStore;
  cleanup: CleanupPort;
  now(): Date;
}

export function createHttpApp(config: RuntimeConfig, dependencies: HttpDependencies): Hono {
  const app = new Hono();

  app.get("/api/p3/runtime", (context) =>
    context.json({ runtime: "cloudflare-workers", http: "hono", core: "web-api-independent" }),
  );

  app.get("/api/p3/client-ip", (context) => {
    try {
      return context.json({ clientIp: getTrustedClientIp(context.req.raw, config.appEnvironment) });
    } catch {
      return context.json({ code: "TRUSTED_CLIENT_IP_UNAVAILABLE" }, 400);
    }
  });

  app.post("/api/p3/session", async (context) => {
    const sessionId = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const expiresAt = new Date(dependencies.now().getTime() + 8 * 60 * 60 * 1000);
    await dependencies.sessions.create({
      sessionIdHash: await hashOpaqueToken(sessionId),
      csrfTokenHash: await hashOpaqueToken(csrfToken),
      expiresAt,
    });

    setCookie(context, SESSION_COOKIE, sessionId, {
      expires: expiresAt,
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      secure: true,
    });
    setCookie(context, CSRF_COOKIE, csrfToken, {
      expires: expiresAt,
      httpOnly: false,
      path: "/",
      sameSite: "Lax",
      secure: true,
    });
    return context.json({ authenticated: true });
  });

  app.post("/api/p3/protected", async (context) => {
    const sessionId = getCookie(context, SESSION_COOKIE);
    const csrfCookie = getCookie(context, CSRF_COOKIE);
    const csrfHeader = context.req.header(CSRF_HEADER);
    if (!sessionId) return context.json({ code: "UNAUTHORIZED" }, 401);
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return context.json({ code: "INVALID_CSRF_TOKEN" }, 403);
    }

    const session = await dependencies.sessions.find(await hashOpaqueToken(sessionId));
    if (!session || session.expiresAt.getTime() <= dependencies.now().getTime()) {
      return context.json({ code: "UNAUTHORIZED" }, 401);
    }
    if (session.csrfTokenHash !== (await hashOpaqueToken(csrfHeader))) {
      return context.json({ code: "INVALID_CSRF_TOKEN" }, 403);
    }
    return context.json({ ok: true });
  });

  if (shouldRegisterCleanup(config)) {
    app.delete("/api/p3/e2e-cleanup", async (context) => {
      await dependencies.cleanup.deleteMarkedTestData();
      return context.body(null, 204);
    });
  }

  return app;
}
