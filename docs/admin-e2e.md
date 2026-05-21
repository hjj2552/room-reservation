# Admin Frontend E2E

This document describes the Playwright E2E profile for the admin frontend.

## Covered Smoke Flows

- Auth and protected route behavior.
- Reservations list query persistence.
- Audit query persistence.
- Admin reservation create and detail/list reflection.
- Admin reservation edit and detail/list reflection.
- Rooms smoke: list render and one successful update.
- Settings smoke: settings load, save, and success feedback.

The suite intentionally does not cover the public frontend, CSV download, or full CRUD matrices for rooms/settings yet.

## Local Run

Prerequisites:

- JDK 21.
- Node dependencies installed in `admin-frontend`.
- Playwright browsers installed.
- PostgreSQL test database running from the repository root:

```powershell
docker compose up -d postgres-test
```

Build the backend jar when it is missing or stale:

```powershell
cd backend
.\gradlew.bat bootJar
```

Run the E2E suite:

```powershell
cd admin-frontend
npm.cmd run e2e
```

`npm run e2e` starts a backend only when `E2E_BACKEND_URL` is not reachable. The started backend uses `SPRING_PROFILES_ACTIVE=e2e` by default. It also starts the Vite dev server when `PLAYWRIGHT_BASE_URL` is not reachable.

## GitHub Actions CI

The repository CI workflow lives at `.github/workflows/ci.yml` and runs on pull requests and pushes to `main`.

Jobs:

- `backend-test`: starts a PostgreSQL 16 service on host port `5433` and runs `backend/./gradlew test` with the backend test profile.
- `admin-frontend`: starts a fresh PostgreSQL 16 service on host port `5433`, runs `npm ci`, builds the admin frontend, builds the backend jar, installs Chromium for Playwright, and runs `npm run e2e:ci`.

The E2E job reuses `admin-frontend/scripts/run-e2e.mjs`. In CI, that runner starts the backend jar with the `e2e` profile and starts the Vite dev server if they are not already reachable.

Artifacts:

- `admin-playwright-report`: Playwright HTML report from `admin-frontend/playwright-report`.
- `admin-e2e-test-results`: Playwright traces, screenshots, error contexts, and backend/frontend logs from `admin-frontend/test-results`.

Artifacts are uploaded with `if: always()`, so failed E2E runs should still leave debugging output.

## Manual CI-Shaped Run

Recommended CI shape:

```powershell
docker compose up -d postgres-test
cd backend
.\gradlew.bat bootJar
cd ..\admin-frontend
npm ci
npx playwright install --with-deps chromium
npm run e2e:ci
```

Useful environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PLAYWRIGHT_BASE_URL` | `http://127.0.0.1:5173` | Frontend URL used by Playwright. |
| `E2E_BACKEND_URL` | `http://127.0.0.1:8080/api/public/settings` | Backend readiness probe. |
| `E2E_BACKEND_PROFILE` | `e2e` | Spring profile used when the runner starts the backend. |
| `E2E_DB_URL` | `jdbc:postgresql://localhost:5433/room_reservation_test` | Database URL for `application-e2e.yml`. |
| `E2E_DB_USERNAME` | `room_reservation` | E2E database username. |
| `E2E_DB_PASSWORD` | `room_reservation` | E2E database password. |
| `ADMIN_USERNAME` | `admin` | Admin login username for auth setup and API helpers. |
| `ADMIN_PASSWORD` | `admin1234` | Admin login password for auth setup and API helpers. |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8080` | Vite `/api` proxy target. |

## Isolation and Data Cleanup

- Playwright still uses browser context isolation per test.
- Admin authentication is reused through `tests/e2e/.auth/admin.json`, but data is created per test with an `E2E ...` unique name.
- API-created rooms are soft-deleted in `finally` blocks when the test owns them.
- API-created reservations are cancelled in `finally` blocks where the flow owns them. There is no reservation delete API, so cancellation plus unique future-dated data is the cleanup boundary.
- Settings are global state. The settings smoke test reads the original payload first and restores it in a `finally` block.
- The `e2e` backend profile points at the tmpfs-backed `postgres-test` database by default, so CI can start from a disposable database without adding a heavy seed/reset command.
