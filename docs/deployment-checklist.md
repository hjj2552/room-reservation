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
| `BACKEND_ORIGIN` | Cloudflare Pages production | Absolute HTTPS origin of the deployed backend. Local Pages Functions development may use HTTP only with `localhost` or `127.0.0.1`. |

## Optional Environment Variables

| Variable | Default | Meaning |
|---|---|---|
| `E2E_CLEANUP_ENABLED` | `false` for local/dev | Enables guarded E2E cleanup endpoints. Never enable this in production. |

Session cookie `HttpOnly=true`, `Secure=true`, and `SameSite=Lax` are defined in `application.yml`. Local and E2E profiles explicitly override only `Secure=false` because they run over HTTP. `SameSite=Lax` matches the production browser flow through the same-origin Cloudflare Pages `/api` proxy.

## Cloudflare Pages Frontend

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Configure `BACKEND_ORIGIN` in the Cloudflare Pages environment without a path, query, fragment, or credentials. Do not commit the real backend URL.
- Browser requests keep using relative `/api/...` URLs. The `functions/api/[[path]].ts` Pages Function forwards `/api` and `/api/*` to `BACKEND_ORIGIN` while preserving the API path and query string.
- The local Vite `/api` proxy remains independent and continues to use `VITE_API_PROXY_TARGET` when configured.

## Session, CSRF, and Rate Limiting

- Authentication uses a server-side session cookie, not JWT or browser local storage.
- CSRF protection is enabled for state-changing requests, including public reservation create, edit, and cancel requests.
- The SPA obtains `XSRF-TOKEN` from `GET /api/auth/csrf` and sends it as `X-XSRF-TOKEN`.
- Unauthenticated and public `GET /api/**` requests are limited to 120 requests per IP per minute.
- Unauthenticated and public state-changing `/api/**` requests are limited to 24 requests per IP per minute.
- Authenticated `ROLE_ADMIN` requests bypass rate limiting. Expired or unauthenticated admin requests do not bypass it.
- Buckets are currently stored in memory and are local to one backend instance. A multi-instance deployment requires a shared bucket store.
- Client IP resolution trusts the first `X-Forwarded-For` value when present. Configure the deployment proxy to replace untrusted inbound forwarding headers.

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

- Immediately before deployment, read the deployed `operation_settings.slot_minutes` value without exposing database credentials or connection URLs.
- Allowed values after the reservation-time migration are `5`, `10`, `15`, and `30`; `60` is intentionally rejected.
- If the deployed value is `60`, do not auto-convert it. Choose the intended value manually with the operator before deployment.
- The Flyway migration fails before changing constraints when it finds `slot_minutes=60`, so the migration transaction can roll back atomically.
- Existing reservations and recurrences are not rewritten or retroactively aligned when the slot setting changes.
