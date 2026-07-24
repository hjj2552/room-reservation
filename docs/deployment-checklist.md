# Deployment Checklist

This project must receive real production values from the deployment platform's
environment variable or secret-management screen. Do not commit real DB
credentials, admin credentials, Gmail accounts, app passwords, or tokens to this
repository.

## Required Environment Variables

| Variable | Required for | Meaning |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | all deployed runs | Must be set explicitly. Use `prod` for production, `dev` for shared development, and `local` only for a developer machine. |
| `DB_URL` | `local`, `dev`, `prod` | JDBC URL for the database used by the selected profile. |
| `DB_USERNAME` | `local`, `dev`, `prod` | Database login username. |
| `DB_PASSWORD` | `local`, `dev`, `prod` | Database login password. |
| `ADMIN_USERNAME` | `local`, `dev`, `prod` | Username for the single configured administrator login. |
| `ADMIN_PASSWORD` | `local`, `dev`, `prod` | Password for the single configured administrator login. Use a strong unique value before deployment. |
| `BACKEND_ORIGIN` | Current Spring production or explicit local/transition fallback only | Absolute HTTPS origin of the deployed backend. Local Pages Functions development may use HTTP only with `localhost` or `127.0.0.1`. The Worker target does not use this value. |
| `API_PROXY_TRANSPORT` | Cloudflare Pages | Use `backend-origin` only during the explicit Spring/local phase. Set `service-binding` for the Worker production target. There is no automatic fallback. |
| `API_BACKEND` | Worker production target | Cloudflare Pages Service Binding to the private backend Worker. This is a binding, not a URL or secret. |

## Optional Environment Variables

| Variable | Default | Meaning |
|---|---|---|
| `E2E_CLEANUP_ENABLED` | `false` for local/dev | Enables guarded E2E cleanup endpoints. Never enable this in production. |

Session cookie `HttpOnly=true`, `Secure=true`, and `SameSite=Lax` are defined in `application.yml`. Local and E2E profiles explicitly override only `Secure=false` because they run over HTTP. `SameSite=Lax` matches the production browser flow through the same-origin Cloudflare Pages `/api` proxy.

## Cloudflare Pages Frontend

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- During the current Spring phase, explicitly select `API_PROXY_TRANSPORT=backend-origin` and configure `BACKEND_ORIGIN` without a path, query, fragment, or credentials.
- For the Worker target, explicitly select `API_PROXY_TRANSPORT=service-binding`, bind `API_BACKEND`, and do not configure a public Worker origin fallback.
- Browser requests keep using relative `/api/...` URLs. The Pages Function preserves the API path, query, method, body, cookies, CSRF header, response status and separate `Set-Cookie` values.
- The Pages Function removes browser-provided `X-Forwarded-For` and `X-Room-Reservation-Client-IP`, then copies only Pages ingress `CF-Connecting-IP` to the internal header.
- The local Vite `/api` proxy remains independent and continues to use `VITE_API_PROXY_TARGET` when configured.

## Session, CSRF, and Rate Limiting

- Authentication uses a server-side session cookie, not JWT or browser local storage.
- CSRF protection is enabled for state-changing requests, including public reservation create, edit, and cancel requests.
- The SPA obtains `XSRF-TOKEN` from `GET /api/auth/csrf` and sends it as `X-XSRF-TOKEN`.
- Unauthenticated and public `GET /api/**` requests are limited to 120 requests per IP per minute.
- Unauthenticated and public state-changing `/api/**` requests are limited to 24 requests per IP per minute.
- Every `/api/**` request first passes the 600 requests/60 seconds INGRESS guard for its trusted client IP, including authenticated administrator requests.
- Authenticated `ROLE_ADMIN` requests bypass only the product READ/WRITE limits. Expired or unauthenticated admin requests do not bypass them.
- Only a 43-character unpadded base64url `ROOM-SESSION` value is eligible for a session database lookup, and only after INGRESS allows the request.
- The Worker target uses exactly three Workers Rate Limiting bindings: 600 ingress requests, 120 non-admin GET requests and 24 non-admin non-GET requests per 60 seconds per trusted client IP.
- UAT and production INGRESS/READ/WRITE bindings use six distinct positive-integer namespaces. Local and CI use fake/local adapters and never production namespaces.
- Workers Rate Limiting is Cloudflare-location-local and permissive/eventually consistent. It is abuse mitigation, not exact global accounting.
- The production Worker has no workers.dev, preview URL, route or custom domain and trusts only the Pages-owned internal IP header received through `API_BACKEND`.

## Handover Checks

- Confirm who owns access to the deployment platform, database, DNS, and mail account.
- Confirm production secrets are stored only in the deployment platform or a secret manager.
- Confirm no production value is present in `.env`, committed YAML, shell scripts, screenshots, issue comments, or chat logs.
- Rotate `ADMIN_PASSWORD` whenever the administrator changes.
- If email sending is enabled later, reissue the Gmail app password or mail-provider credential during administrator handover.
- Keep `SPRING_PROFILES_ACTIVE=prod` set in production so the app never starts with local settings.

## Before First Production Deployment

1. Create the production database and user.
2. Set `SPRING_PROFILES_ACTIVE=prod`.
3. Set every required environment variable above.
4. Start the app once and verify startup fails if any required value is missing.
5. Verify the configured administrator can log in.
6. Verify a state-changing request without a CSRF token returns `403` and a valid SPA request succeeds.
7. Verify rate-limited responses return `429` and `Retry-After` through the deployment proxy.
8. Store the final environment-variable list in the administrator handover notes, not in Git.

## Reservation Time Migration Check

- Immediately before deployment, read `operation_settings.min_reservation_minutes` and `max_reservation_minutes` without exposing database credentials or connection URLs.
- Confirm minimum is at least `30`, both values are divisible by `5`, maximum is at least minimum, and minimum fits within operating hours.
- If a value is incompatible, do not auto-convert production data. Agree on the intended values with the operator before deployment.
- V3 fails before changing constraints or trigger functions when existing settings are incompatible, so the migration rolls back atomically.
- Reservation inputs use a fixed 5-minute increment; timetable candidates and operating start/end use 30-minute intervals.
- Existing reservations and recurrences are not rewritten or retroactively validated.
- `slot_minutes` remains temporarily as a deprecated rolling-deployment compatibility column. The API returns `5`; business logic and V3 triggers do not read it. Remove the field and column in a later coordinated contract-cleanup migration.
