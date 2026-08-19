# Public Reservation Requests

The public reservation timetable and Quick Add flow are available at `/timetable`.

## User Flow

- Public users view the same timetable-style reservation grid used by the admin UI.
- Date view shows enabled rooms for the selected date. Room view shows one room across the selected week.
- Clicking an empty timetable slot opens a public quick request panel with room, date, and time prefilled.
- Clicking an existing request/reservation block opens a public-safe detail page.
- Public users do not log in. They provide a reservation-specific password when creating the request.

## Request State

- Public submissions are stored as 승인 대기 상태(`REQUESTED`), not as 승인 상태(`CONFIRMED`) reservations.
- The success message must say that the reservation request was received, not that the reservation is complete.
- Admin approval, rejection, forced registration, recurrence registration, audit history, and admin memo fields are not exposed in the public UI.
- Reservation state labels are `REQUESTED` = 승인 대기, `CONFIRMED` = 승인, and `CANCELLED` = 취소. `APPROVED` is not a reservation state; it is an audit history action for 승인 처리.

## Applicant Name Visibility

The public timetable and the public-safe reservation detail use a per-reservation policy to decide whether the applicant name is masked or shown as entered.

- The administrator-facing control is labeled `신청자 이름 보이기`.
- The control affects only the applicant name. Applicant email and phone remain masked on public screens regardless of this setting.
- The default value is off. Existing reservations also transition to off and remain masked unless an eligible administrator reservation is explicitly changed.
- `ADMIN_MANUAL` reservations may enable or disable the setting during administrator creation and editing.
- A recurring reservation stores the setting and passes it to each generated `RECURRING_GENERATED` reservation.
- An administrator may override the inherited value while editing an individual generated reservation.
- `PUBLIC_FORM` reservations always keep the setting off. Public create and update requests do not accept the setting, and administrator editing cannot enable it for a `PUBLIC_FORM` reservation.

`PUBLIC_FORM` reservations cannot be made public by an administrator because the public applicant did not consent to having their unmasked name exposed. Official events or group schedules that require a visible organizer must be created through an administrator single reservation or recurring reservation flow.

When the setting is off, the Worker masks the applicant name in the public timetable API and the public-safe detail API. When the setting is on for an eligible administrator reservation, those APIs may return the applicant name as entered. The Worker response is the privacy boundary; frontend-only masking is not sufficient.

Password-verified public editing may continue to show the applicant their own original information, but it does not expose or change the visibility setting. Authenticated administrator screens and APIs continue to use unmasked applicant information.

Changing this setting is a privacy-relevant administrator action, so its previous and new values must remain reviewable in audit history.

## Public Edit Policy

- Public users can edit their own 승인 대기 상태(`REQUESTED`) reservations after password verification. Saving keeps the state as `REQUESTED`.
- Public users can edit their own 승인 상태(`CONFIRMED`) reservations after password verification. Saving runs the normal room/time conflict check again and changes the state back to 승인 대기 상태(`REQUESTED`).
- Public users cannot edit 취소 상태(`CANCELLED`) reservations. Public cancellation restore is not supported.

## Reservation Password Policy

- Public request creation requires a reservation password. The API field remains `cancelPassword` for compatibility.
- The password must be 4–64 printable ASCII characters (`!` through `~`). Spaces, Korean characters, emoji, and other Unicode characters are not accepted or normalized.
- The backend stores only a password hash in `reservations.cancel_password_hash`; it must not store the raw password.
- Public editing and cancellation verify the same password hash.
- If the password is wrong, the API returns the existing action-specific error code and the UI consistently shows a reservation-password mismatch message.
- If the user loses the reservation password, they cannot self-edit or self-cancel through the public UI and must ask an administrator for help.

## Conflict Policy

The backend is the final authority for overlap checks.

- A public request is rejected when it overlaps an existing `CONFIRMED` reservation for the same room.
- A public request is also rejected when it overlaps an existing `REQUESTED` request for the same room.
- Public edits also run this conflict check before saving. The reservation being edited is excluded from its own overlap check.
- This keeps the policy to one 승인 대기 request per room/time slot.
- 취소 상태(`CANCELLED`) reservations do not block new requests.

The public frontend maps `TIME_SLOT_CONFLICT` to:

> 이미 다른 신청 또는 예약이 있어 신청할 수 없습니다. 다른 공간이나 시간을 선택해 주세요.

## Time Policy

- Facility operating hours/days and public reservation hours/days are separate settings. Public hours and days must remain inside the operating schedule.
- Public creation, availability checks, room- or time-changing edits, toolbar suggestions, and time inputs use the public schedule. Administrator single reservations, timetable Quick Add, edits, and recurrences use the operating schedule.
- Administrators may reserve inside operating hours even when that interval is unavailable to public users. Neither public users nor administrators may reserve outside operating hours or days.
- The timetable grid and empty-slot interaction candidates always use 30-minute intervals.
- Reservation start and end inputs always use 5-minute increments.
- The administrator-configured minimum duration is at least 30 minutes; minimum and maximum durations are multiples of 5.
- Suggested reservations and empty-slot hover ranges use exactly `minReservationMinutes` and must fit completely inside the applicable public or operating schedule.
- Toolbar suggestions use the first strictly future 30-minute candidate in `Asia/Seoul`, considering the semester and the applicable schedule weekdays.
- Past timetable candidates remain clickable so users can inspect the exact interval. Public creation, room- or time-changing edits, and availability checks reject past start times with `이미 지난 시간에는 예약할 수 없습니다. 예약 시간을 다시 확인해 주세요.`
- Administrators can create and edit past reservations. Public users cannot move a past reservation to another room or time, but may update applicant/contact/purpose fields without changing its room or time.
- Existing reservations are not rewritten when settings change. Public applicant/contact/purpose-only edits remain available; the current public time/day policy is applied when the room or time changes.
- Nighttime, safety, or contact guidance belongs in the existing `publicNotice` setting rather than a separate application resource or reception flow.
- The `slotMinutes` API field is retained only for frontend contract compatibility, always returns `5`, and is not a product setting. The Worker database has no `slot_minutes` column.

## Request Protection

- Public users do not need an administrator session, but state-changing requests are protected by CSRF validation.
- The frontend obtains a CSRF token from `GET /api/auth/csrf` and automatically sends `X-XSRF-TOKEN` when creating, editing, or cancelling a reservation.
- Public and unauthenticated GET requests are limited to 120 requests per IP per minute. State-changing requests are limited to 24 requests per IP per minute.
- A limit excess returns HTTP `429`, error code `RATE_LIMIT_EXCEEDED`, and a `Retry-After` header.
