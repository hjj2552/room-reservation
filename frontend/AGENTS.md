# Frontend Agent Rules

These rules apply to `frontend`, especially Playwright E2E work.

## Playwright E2E Data

- Import `test` and `expect` from `tests/e2e/fixtures.ts`, not directly from `@playwright/test`, for any admin spec that creates data.
- Use the `e2eData` fixture for E2E-owned data:
  - `e2eData.name(label)` for unique `e2e-` names.
  - `e2eData.createTestRoom(label, options)` for rooms; it prefixes and registers the room id, and supports location/description display cases.
  - `e2eData.createTestTag(label, options)` for tags; it prefixes and registers the tag id.
  - `e2eData.createTestReservation(roomId, label, options)` for API-seeded reservations; it prefixes and registers the reservation id.
  - `e2eData.createTestPublicReservation(roomId, label, options)` for API-seeded public reservations; it prefixes, keeps the public password in the returned object, and registers the reservation id.
  - `e2eData.createTestRecurringReservation(roomId, label, options)` for API-seeded recurring reservations; it prefixes and registers the recurrence id.
  - `e2eData.registerReservation(id)`, `e2eData.registerRecurrence(id)`, and `e2eData.registerTag(id)` for ids created through the UI.
- Do not bypass the fixture with local one-off factories unless adding the missing capability to the shared fixture in the same change.
- UI-created data must still use `e2e-` applicant names, emails, purposes, and memos where the form allows it.
- The fixture performs best-effort id cleanup after each test; reservations and tags are hard-deleted by id, recurrences are cancelled by id, and E2E audit histories are left for the guarded prefix cleanup. The E2E runner performs guarded prefix cleanup before and after the suite.

## Manual Cleanup Commands

- Preview current `e2e-` cleanup:
  - `npm run e2e:cleanup:preview`
- Delete current `e2e-` cleanup targets:
  - `npm run e2e:cleanup`
- Preview old pre-rule `E2E ...` cleanup targets in dev/UAT:
  - `npm run e2e:cleanup:legacy:preview`
- Delete old pre-rule `E2E ...` cleanup targets in dev/UAT:
  - `npm run e2e:cleanup:legacy`

The backend must expose the guarded cleanup endpoint. For `local` or `dev`, run it with `E2E_CLEANUP_ENABLED=true`. The cleanup endpoint is not available in `prod`.
