# Project Agent Rules

These rules apply to every Codex/agent task in this repository.

## Scope Discipline

- Do not expand reservation, timetable, room, or admin policy behavior unless the user explicitly asks for product work.
- Keep maintenance changes tightly scoped. Avoid schema rewrites, UI redesign, broad reset commands, or API contract changes for hygiene-only tasks.
- Prefer existing patterns, helpers, fixtures, scripts, and controllers over ad-hoc one-off code.

## E2E Test Data Hygiene

- Any data created by Playwright E2E must be identifiable as test data.
- Use the current naming rule:
  - rooms: `e2e-room-*`
  - reservations: `e2e-reservation-*`
  - recurring reservations: `e2e-recurring-*` or another `e2e-` purpose/applicant/email generated through the shared fixture
- New E2E code must use shared helpers/fixtures/factories first. Do not create rooms, reservations, or recurrences with raw API calls unless the helper cannot support the case yet.
- If a new data-creating flow needs a new helper, add it to the shared E2E fixture/helper layer instead of embedding local setup/teardown in one spec.
- Tests must register created resource ids for best-effort teardown whenever ids are available.
- Test teardown should be best-effort and id-based first. Prefix-based cleanup is the fallback for failed or interrupted runs.
- Cleanup targets must be limited to resources carrying the E2E marker or resources linked to those marked resources.
- Never use production-wide truncate, reset, or unscoped delete for E2E cleanup.
- Dev/UAT-only cleanup/reset paths must be guarded by environment/profile checks, explicit enable flags, and test-data identifiers.
- Production profile cleanup endpoints or scripts are not allowed.

## Safe Cleanup Policy

- The guarded E2E cleanup path is allowed only outside `prod` and only when `app.e2e-cleanup.enabled=true`.
- Manual cleanup should be previewed before deleting legacy data.
- Legacy cleanup for old `E2E ...` data is only for dev/UAT cleanup before launch or acceptance testing. Do not broaden legacy matching rules without a concrete review of affected rows.
- If cleanup cannot prove a row is E2E-owned, leave it in place and document the residual risk.

## Documentation Expectations

- When adding or changing E2E data creation, update `frontend/AGENTS.md` or `docs/admin-e2e.md` if the shared workflow changes.
- Keep manual acceptance-test cleanup commands documented.
- New Codex chats and future agents should treat these rules as the project baseline before editing tests or cleanup code.
