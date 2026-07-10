# Frontend E2E

This document describes the Playwright E2E profile for the frontend.

## Covered Smoke Flows

- Auth and protected route behavior.
- Root entry choices for the public timetable and admin login.
- Reservations list query persistence.
- Audit query persistence and deleted reservation snapshot rendering.
- Admin reservation registration, edit, detail/list reflection, timetable links, duplication, and hard deletion.
- Admin timetable date/room views and reservation creation from empty slots or the toolbar.
- Public reservation timetable request, detail, and reservation-password cancellation.
- Public edit of a confirmed reservation and transition back to `REQUESTED`.
- Rooms smoke: list render, one successful update, deletion modal confirmation, and preserved reservation-record copy.
- Settings smoke: settings load, save, and success feedback.
- Recurrence list, preview, create, detail, cancel, `SKIP_CONFLICTS`, and tag selection.
- Tag create, update, and delete.

현재 E2E 스위트는 CSV 내보내기와 rooms/settings 전체 CRUD matrix를 아직 다루지 않습니다.

Playwright는 전역 운영 설정처럼 singleton 데이터를 바꾸는 테스트 사이의 충돌을 피하기 위해 `workers: 1`, `fullyParallel: false`로 실행합니다.

## Local Run

Prerequisites:

- JDK 21.
- Node dependencies installed in `frontend`.
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
cd frontend
npm.cmd run e2e
```

`npm run e2e` starts a backend only when `E2E_BACKEND_URL` is not reachable. The started backend uses `SPRING_PROFILES_ACTIVE=e2e` by default. It also starts the Vite dev server when `PLAYWRIGHT_BASE_URL` is not reachable.

If a backend is already reachable on `E2E_BACKEND_URL`, the runner reuses it. Make sure that existing backend is either running with the `e2e` profile or was started with cleanup explicitly enabled. The runner treats before/after cleanup as required by default, so a reachable backend without the cleanup endpoint fails fast instead of silently leaving E2E data behind.

## GitHub Actions CI

The repository CI workflow lives at `.github/workflows/ci.yml` and runs on pull requests, pushes to any branch, and manual `workflow_dispatch` runs.

Jobs:

- `backend-test`: starts a PostgreSQL 16 service on host port `5433` and runs `backend/./gradlew test` with the backend test profile.
- `frontend`: starts a fresh PostgreSQL 16 service on host port `5433`, runs `npm ci`, builds the frontend, builds the backend jar, installs Chromium for Playwright, and runs `npm run e2e:ci`.

The E2E job reuses `frontend/scripts/run-e2e.mjs`. In CI, that runner starts the backend jar with the `e2e` profile and starts the Vite dev server if they are not already reachable.

Artifacts:

- `admin-playwright-report`: Playwright HTML report from `frontend/playwright-report`.
- `admin-e2e-test-results`: Playwright traces, screenshots, error contexts, and backend/frontend logs from `frontend/test-results`.

Artifacts are uploaded with `if: always()`, so failed E2E runs should still leave debugging output.

## Manual CI-Shaped Run

Recommended CI shape:

```powershell
docker compose up -d postgres-test
cd backend
.\gradlew.bat bootJar
cd ..\frontend
npm ci
npx playwright install --with-deps chromium
npm run e2e:ci
```

Useful environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PLAYWRIGHT_BASE_URL` | `http://127.0.0.1:5173` | Frontend URL used by Playwright. |
| `E2E_BACKEND_URL` | `http://127.0.0.1:8080/api/public/settings` | Backend readiness probe. |
| `E2E_API_BASE_URL` | Derived from `E2E_BACKEND_URL` | Backend API origin used by manual cleanup scripts. |
| `E2E_BACKEND_PROFILE` | `e2e` | Spring profile used when the runner starts the backend. |
| `E2E_CLEANUP_REQUIRED` | `true` | Requires before/after suite cleanup to reach the guarded cleanup endpoint. Set to `false` only for intentional debugging against a cleanup-disabled backend. |
| `E2E_DB_URL` | `jdbc:postgresql://localhost:5433/room_reservation_test` | Database URL for `application-e2e.yml`. |
| `E2E_DB_USERNAME` | `room_reservation` | E2E database username. |
| `E2E_DB_PASSWORD` | `room_reservation` | E2E database password. |
| `E2E_CLEANUP_ENABLED` | `true` for `e2e`, `false` for `local`/`dev` | Enables the guarded E2E cleanup API outside `prod`. |
| `E2E_TEST_DATA_PREFIX` | `e2e-` | Prefix used by the manual cleanup script. The backend only accepts prefixes that start with `e2e-`. |
| `ADMIN_USERNAME` | `admin` | Admin login username for auth setup and API helpers. |
| `ADMIN_PASSWORD` | `admin1234` | Admin login password for auth setup and API helpers. |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8080` | Vite `/api` proxy target. |

## Isolation and Data Cleanup

- Playwright still uses browser context isolation per test.
- Admin authentication is reused through `tests/e2e/.auth/admin.json`, but E2E-owned rooms, tags, reservations, recurrences, applicant names, emails, memos, and purposes use the `e2e-` prefix.
- Data-creating specs import from `tests/e2e/fixtures.ts` and use the `e2eData` factory. Prefer `e2eData.createTestRoom`, `e2eData.createTestTag`, `e2eData.createTestReservation`, `e2eData.createTestPublicReservation`, `e2eData.createTestRecurringReservation`, `e2eData.name`, and the id registration helpers over direct setup calls.
- Public UI-created reservations use `e2e-` applicant names, emails, and purposes, then register returned ids for cleanup.
- Data-creating specs use a Playwright fixture registry for created room, tag, reservation, and recurrence ids. Fixture teardown tries best-effort API deletion for reservations, cancellation for recurrences, deletion for tags, and deletion for rooms by id.
- `npm run e2e` also runs cleanup before and after the full suite through `frontend/scripts/run-e2e.mjs`. After the final cleanup, the runner performs a cleanup preview and fails if any matching E2E data remains.
- The cleanup endpoint can preview or hard-delete rows identified by the `e2e-` prefix:
  - rooms whose name starts with `e2e-`;
  - tags whose name starts with `e2e-` and are not still referenced by a remaining recurrence;
  - recurrences whose purpose/applicant/email starts with `e2e-`, plus recurrences attached to an `e2e-` room;
  - reservations whose purpose/applicant/email starts with `e2e-`, plus reservations attached to an `e2e-` room or an `e2e-` recurrence;
  - reservation histories for those reservations, including hard-deleted reservation histories identified by E2E snapshot purpose or room name.
- Recurring reservations are cleaned by deleting the recurrence row and every generated reservation linked by `recurrence_id`.
- `e2e-` rooms are deleted only after their matching reservations and recurrences are removed. If any non-E2E row still references the room, the room is skipped instead of deleting or reassigning unrelated data.
- `e2e-` tags are deleted only after matching recurrences are removed. If any remaining recurrence still references the tag, the tag is skipped instead of clearing that recurrence's tag.
- For pre-rule data from older tests, manual cleanup can include old `E2E ...` names only when `includeLegacy=true`. Use preview first.
- Settings are global state. The settings smoke test reads the original payload first and restores it in a `finally` block.
- The cleanup controller is not loaded in the `prod` profile and is disabled by default in `local`/`dev` unless `E2E_CLEANUP_ENABLED=true` is set.
- The `e2e` backend profile points at the tmpfs-backed `postgres-test` database by default, so CI can still start from a disposable database without a broad reset command.

Manual cleanup before acceptance testing:

```powershell
cd frontend
npm.cmd run e2e:cleanup:preview
npm.cmd run e2e:cleanup
```

Legacy cleanup for existing dev/UAT data left by old E2E naming:

```powershell
cd frontend
npm.cmd run e2e:cleanup:legacy:preview
npm.cmd run e2e:cleanup:legacy
```

When running against a local/dev backend, start that backend with `E2E_CLEANUP_ENABLED=true` first. From the repository root you can use `.\start-backend-cleanup-enabled.bat`. Without that opt-in, `/api/admin/test-data/e2e/preview` returns 404 because the controller is not registered. The manual cleanup command logs in as the admin user and calls the guarded `/api/admin/test-data/e2e` cleanup endpoints. If the backend is not on `http://127.0.0.1:8080`, set `E2E_API_BASE_URL`.

`start-backend-cleanup-enabled.bat` starts the normal local PostgreSQL service, then runs the backend with `--spring.profiles.active=local` and `E2E_CLEANUP_ENABLED=true`. It is intended only for local/dev test-data cleanup. Do not use it for production. For CI-shaped E2E runs against the disposable test database, prefer `postgres-test` plus the `e2e` profile.
