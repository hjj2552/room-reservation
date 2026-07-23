import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { RuntimeConfig } from "../core/config";
import { shouldRegisterCleanup } from "../core/config";
import { parseUuid } from "../core/domain";
import { AppError } from "../core/errors";
import type { ClientIpProvider, RateLimiter, RateLimitPolicy } from "../core/rate-limit";
import { constantTimeSecretEqual, sha256 } from "../core/security";
import type { ProductService } from "../services/product-service";
import type { SessionRecord, SessionService } from "../services/session-service";

const SESSION_COOKIE = "ROOM-SESSION";
const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-XSRF-TOKEN";
const safeMethods = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

type Variables = {
  session: SessionRecord | null;
  adminUsername: string | null;
};

interface Dependencies {
  products: ProductService;
  sessions: SessionService;
  rateLimiter: RateLimiter;
  clientIpProvider: ClientIpProvider;
  adminUsername: string;
  adminPassword: string;
}

function jsonBody(context: Context): Promise<unknown> {
  const contentType = context.req.header("content-type") || "";
  if (!contentType.includes("application/json")) return Promise.resolve(undefined);
  return context.req.json().catch(() => {
    throw new AppError(400, "VALIDATION_ERROR", "Please check the request fields.");
  });
}

function uuidParam(context: Context, name: string): string {
  return parseUuid(context.req.param(name), name);
}

function setSessionCookies(context: Context, config: RuntimeConfig, sessionId: string, csrfToken: string, expires: Date) {
  setCookie(context, SESSION_COOKIE, sessionId, {
    expires, httpOnly: true, path: "/", sameSite: "Lax", secure: config.secureCookies,
  });
  setCookie(context, CSRF_COOKIE, csrfToken, {
    expires, httpOnly: false, path: "/", sameSite: "Lax", secure: config.secureCookies,
  });
}

function adminGuard(): MiddlewareHandler<{ Variables: Variables }> {
  return async (context, next) => {
    const username = context.get("adminUsername");
    if (!username) throw new AppError(401, "ADMIN_UNAUTHORIZED", "Admin login is required.");
    await next();
  };
}

export function createHttpApp(config: RuntimeConfig, dependencies: Dependencies): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();

  app.onError((error, context) => {
    if (error instanceof AppError) {
      if (error.code === "RATE_LIMIT_EXCEEDED") {
        context.header("Retry-After", "60");
      }
      return context.json({
        code: error.code,
        message: error.message,
        details: error.details,
        fieldErrors: error.fieldErrors,
        path: new URL(context.req.url).pathname,
      }, error.status as 400);
    }
    const databaseCode = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
    console.error(JSON.stringify({
      event: "request_failed",
      path: new URL(context.req.url).pathname,
      method: context.req.method,
      databaseCode,
    }));
    return context.json({ code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." }, 500);
  });

  app.use("/api/*", async (context, next) => {
    const clientIp = dependencies.clientIpProvider.getClientIp(context.req.raw);
    if (!clientIp) {
      console.error(JSON.stringify({
        event: "trusted_client_ip_unavailable",
        path: new URL(context.req.url).pathname,
        method: context.req.method,
      }));
      throw new AppError(
        503,
        "RATE_LIMIT_UNAVAILABLE",
        "The rate limit service is temporarily unavailable.",
      );
    }

    const sessionCookie = getCookie(context, SESSION_COOKIE);
    const session = sessionCookie
      ? await dependencies.sessions.find(sessionCookie)
      : null;
    context.set("session", session);
    context.set("adminUsername", session?.adminUsername ?? null);
    if (!session?.adminUsername) {
      const policy: RateLimitPolicy = context.req.method.toUpperCase() === "GET" ? "READ" : "WRITE";
      let allowed: boolean;
      try {
        ({ allowed } = await dependencies.rateLimiter.check({ policy, actorKey: clientIp }));
      } catch {
        console.error(JSON.stringify({
          event: "rate_limiter_failed",
          policy,
          path: new URL(context.req.url).pathname,
          method: context.req.method,
        }));
        throw new AppError(
          503,
          "RATE_LIMIT_UNAVAILABLE",
          "The rate limit service is temporarily unavailable.",
        );
      }
      if (!allowed) {
        throw new AppError(
          429,
          "RATE_LIMIT_EXCEEDED",
          "Too many requests. Please retry later.",
          { retryAfterSeconds: 60 },
        );
      }
    }
    if (!safeMethods.has(context.req.method.toUpperCase())) {
      const valid = await dependencies.sessions.validateCsrf(
        session,
        getCookie(context, CSRF_COOKIE),
        context.req.header(CSRF_HEADER),
      );
      if (!valid) throw new AppError(403, "INVALID_CSRF_TOKEN", "Invalid CSRF token.");
    }
    await next();
  });

  app.get("/health", (context) => context.json({ status: "UP" }));

  app.get("/api/auth/csrf", async (context) => {
    const existingSession = context.get("session");
    const existingToken = getCookie(context, CSRF_COOKIE);
    if (existingSession && existingToken && existingSession.csrfTokenHash === await sha256(existingToken)) {
      return context.json({ headerName: CSRF_HEADER, parameterName: "_csrf", token: existingToken });
    }
    const issued = await dependencies.sessions.issue();
    setSessionCookies(context, config, issued.sessionId, issued.csrfToken, issued.record.expiresAt);
    return context.json({ headerName: CSRF_HEADER, parameterName: "_csrf", token: issued.csrfToken });
  });

  app.post("/api/auth/admin/login", async (context) => {
    const body = await jsonBody(context);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError(400, "VALIDATION_ERROR", "Please check the request fields.");
    const username = (body as Record<string, unknown>).username;
    const password = (body as Record<string, unknown>).password;
    if (typeof username !== "string" || typeof password !== "string") throw new AppError(400, "VALIDATION_ERROR", "Please check the request fields.");
    const [usernameMatches, passwordMatches] = await Promise.all([
      constantTimeSecretEqual(username, dependencies.adminUsername),
      constantTimeSecretEqual(password, dependencies.adminPassword),
    ]);
    if (!usernameMatches || !passwordMatches) throw new AppError(401, "ADMIN_UNAUTHORIZED", "Admin login is required.");
    const session = context.get("session");
    if (!session) throw new AppError(403, "INVALID_CSRF_TOKEN", "Invalid CSRF token.");
    await dependencies.sessions.authenticate(session, dependencies.adminUsername);
    const sessionId = getCookie(context, SESSION_COOKIE);
    const csrfToken = getCookie(context, CSRF_COOKIE);
    if (!sessionId || !csrfToken) throw new AppError(403, "INVALID_CSRF_TOKEN", "Invalid CSRF token.");
    setSessionCookies(context, config, sessionId, csrfToken, session.expiresAt);
    return context.json({ id: dependencies.adminUsername, username: dependencies.adminUsername, role: "OPERATOR" });
  });

  app.get("/api/auth/admin/me", adminGuard(), (context) => {
    const username = context.get("adminUsername")!;
    return context.json({ id: username, username, role: "OPERATOR" });
  });

  app.post("/api/auth/admin/logout", adminGuard(), async (context) => {
    await dependencies.sessions.delete(context.get("session"));
    deleteCookie(context, SESSION_COOKIE, { path: "/", secure: config.secureCookies });
    deleteCookie(context, CSRF_COOKIE, { path: "/", secure: config.secureCookies });
    return context.body(null, 204);
  });

  app.get("/api/public/settings", async (context) => context.json(await dependencies.products.getPublicSettings()));
  app.get("/api/public/rooms", async (context) => context.json(await dependencies.products.listPublicRooms()));
  app.get("/api/public/rooms/:roomId", async (context) => context.json(await dependencies.products.getPublicRoom(uuidParam(context, "roomId"))));
  app.get("/api/public/rooms/:roomId/weekly-reservations", async (context) => {
    const weekStart = context.req.query("weekStart");
    if (!weekStart) throw new AppError(400, "VALIDATION_ERROR", "weekStart is required.");
    return context.json(await dependencies.products.getWeeklyReservations(uuidParam(context, "roomId"), weekStart));
  });
  app.get("/api/public/availability", async (context) => context.json(await dependencies.products.checkAvailability(new URL(context.req.url))));
  app.post("/api/public/reservations", async (context) => {
    const result = await dependencies.products.createPublicReservation(await jsonBody(context));
    context.header("Location", `/api/public/reservations/${result.id}`);
    return context.json(result, 201);
  });
  app.get("/api/public/reservations/:reservationId", async (context) => context.json(await dependencies.products.getPublicReservation(uuidParam(context, "reservationId"))));
  app.post("/api/public/reservations/:reservationId/edit", async (context) => context.json(await dependencies.products.verifyPublicReservationForEdit(uuidParam(context, "reservationId"), await jsonBody(context))));
  app.put("/api/public/reservations/:reservationId", async (context) => context.json(await dependencies.products.updatePublicReservation(uuidParam(context, "reservationId"), await jsonBody(context))));
  app.post("/api/public/reservations/:reservationId/cancel", async (context) => context.json(await dependencies.products.cancelPublicReservation(uuidParam(context, "reservationId"), await jsonBody(context))));

  app.use("/api/admin/*", adminGuard());
  app.get("/api/admin/settings", async (context) => context.json(await dependencies.products.getSettings()));
  app.put("/api/admin/settings", async (context) => context.json(await dependencies.products.updateSettings(await jsonBody(context), context.get("adminUsername")!)));

  app.get("/api/admin/rooms", async (context) => context.json(await dependencies.products.listRooms(new URL(context.req.url))));
  app.get("/api/admin/rooms/:roomId", async (context) => context.json(await dependencies.products.getAdminRoomResponse(uuidParam(context, "roomId"))));
  app.get("/api/admin/rooms/:roomId/deletion-check", async (context) => context.json(await dependencies.products.getRoomDeletionCheck(uuidParam(context, "roomId"))));
  app.post("/api/admin/rooms", async (context) => {
    const result = await dependencies.products.createRoom(await jsonBody(context));
    context.header("Location", `/api/admin/rooms/${result.id}`);
    return context.json(result, 201);
  });
  app.put("/api/admin/rooms/:roomId", async (context) => context.json(await dependencies.products.updateRoom(uuidParam(context, "roomId"), await jsonBody(context))));
  app.patch("/api/admin/rooms/:roomId/enabled", async (context) => context.json(await dependencies.products.updateRoomEnabled(uuidParam(context, "roomId"), await jsonBody(context))));
  app.delete("/api/admin/rooms/:roomId", async (context) => { await dependencies.products.deleteRoom(uuidParam(context, "roomId")); return context.body(null, 204); });

  app.get("/api/admin/tags", async (context) => context.json(await dependencies.products.listTags(new URL(context.req.url))));
  app.post("/api/admin/tags", async (context) => {
    const result = await dependencies.products.createTag(await jsonBody(context));
    context.header("Location", `/api/admin/tags/${result.id}`);
    return context.json(result, 201);
  });
  app.put("/api/admin/tags/:tagId", async (context) => context.json(await dependencies.products.updateTag(uuidParam(context, "tagId"), await jsonBody(context))));
  app.delete("/api/admin/tags/:tagId", async (context) => { await dependencies.products.deleteTag(uuidParam(context, "tagId")); return context.body(null, 204); });

  app.get("/api/admin/reservations", async (context) => context.json(await dependencies.products.listReservations(new URL(context.req.url))));
  app.post("/api/admin/reservations", async (context) => {
    const result = await dependencies.products.createAdminReservation(await jsonBody(context), context.get("adminUsername")!);
    context.header("Location", `/api/admin/reservations/${result.id}`);
    return context.json(result, 201);
  });
  app.get("/api/admin/reservations/:reservationId", async (context) => context.json(await dependencies.products.getReservationDetail(uuidParam(context, "reservationId"))));
  app.put("/api/admin/reservations/:reservationId", async (context) => context.json(await dependencies.products.updateAdminReservation(uuidParam(context, "reservationId"), await jsonBody(context), context.get("adminUsername")!)));
  app.post("/api/admin/reservations/:reservationId/approve", async (context) => context.json(await dependencies.products.changeReservationStatus(uuidParam(context, "reservationId"), "APPROVED", await jsonBody(context), context.get("adminUsername")!)));
  app.post("/api/admin/reservations/:reservationId/cancel", async (context) => context.json(await dependencies.products.changeReservationStatus(uuidParam(context, "reservationId"), "CANCELLED", await jsonBody(context), context.get("adminUsername")!)));
  app.delete("/api/admin/reservations/:reservationId", async (context) => { await dependencies.products.deleteReservation(uuidParam(context, "reservationId"), await jsonBody(context), context.get("adminUsername")!); return context.body(null, 204); });
  app.get("/api/admin/reservations/:reservationId/histories", async (context) => context.json(await dependencies.products.getReservationHistories(uuidParam(context, "reservationId"))));
  app.get("/api/admin/audit/reservation-histories", async (context) => context.json(await dependencies.products.listHistories(new URL(context.req.url))));
  app.get("/api/admin/exports/reservations.csv", async (context) => {
    const csv = await dependencies.products.exportReservationsCsv(new URL(context.req.url));
    return new Response(csv, { headers: { "Content-Type": "text/csv;charset=UTF-8", "Content-Disposition": 'attachment; filename="reservations.csv"' } });
  });

  app.post("/api/admin/recurrences/preview", async (context) => context.json(await dependencies.products.previewRecurrence(await jsonBody(context))));
  app.post("/api/admin/recurrences", async (context) => {
    const result = await dependencies.products.createRecurrence(await jsonBody(context), context.get("adminUsername")!);
    context.header("Location", `/api/admin/recurrences/${result.recurrenceId}`);
    return context.json(result, 201);
  });
  app.get("/api/admin/recurrences", async (context) => context.json(await dependencies.products.listRecurrences(new URL(context.req.url))));
  app.get("/api/admin/recurrences/:recurrenceId", async (context) => context.json(await dependencies.products.getRecurrence(uuidParam(context, "recurrenceId"))));
  app.post("/api/admin/recurrences/:recurrenceId/cancel", async (context) => { await dependencies.products.cancelRecurrence(uuidParam(context, "recurrenceId"), await jsonBody(context), context.get("adminUsername")!); return context.body(null, 204); });

  if (shouldRegisterCleanup(config)) {
    app.get("/api/admin/test-data/e2e/preview", async (context) => context.json(await dependencies.products.cleanupE2e(context.req.query("prefix") || "testing-", true)));
    app.delete("/api/admin/test-data/e2e", async (context) => context.json(await dependencies.products.cleanupE2e(context.req.query("prefix") || "testing-", false)));
  }

  app.notFound((context) => context.json({ code: "NOT_FOUND", message: "Resource not found." }, 404));
  return app;
}
