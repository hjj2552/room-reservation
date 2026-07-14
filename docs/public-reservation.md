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

## Public Edit Policy

- Public users can edit their own 승인 대기 상태(`REQUESTED`) reservations after password verification. Saving keeps the state as `REQUESTED`.
- Public users can edit their own 승인 상태(`CONFIRMED`) reservations after password verification. Saving runs the normal room/time conflict check again and changes the state back to 승인 대기 상태(`REQUESTED`).
- Public users cannot edit 취소 상태(`CANCELLED`) reservations. Public cancellation restore is not supported.

## Reservation Password Policy

- Public request creation requires a reservation password. The API field remains `cancelPassword` for compatibility.
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

> 이미 다른 신청 또는 예약이 있어 신청할 수 없습니다. 다른 강의실이나 시간을 선택해 주세요.

## Time Policy

- The timetable grid and empty-slot interaction candidates always use 30-minute intervals.
- `slotMinutes` remains the manual time-input increment and accepts only `5`, `10`, `15`, or `30`.
- Suggested reservations use `max(30, minReservationMinutes)` minutes and must fit completely inside operating hours.
- Toolbar suggestions use the first strictly future 30-minute candidate in `Asia/Seoul`, considering the semester and operating weekdays.
- Public creation, editing, availability checks, and past timetable candidates reject past start times with `과거의 시간표는 예약할 수 없습니다. 예약 시간을 다시 확인해 주세요.`
- Existing reservations are not rewritten when `slotMinutes` changes. A later content/time edit is validated against the current setting.

## Request Protection

- Public users do not need an administrator session, but state-changing requests are protected by CSRF validation.
- The frontend obtains a CSRF token from `GET /api/auth/csrf` and automatically sends `X-XSRF-TOKEN` when creating, editing, or cancelling a reservation.
- Public and unauthenticated GET requests are limited to 120 requests per IP per minute. State-changing requests are limited to 24 requests per IP per minute.
- A limit excess returns HTTP `429`, error code `RATE_LIMIT_EXCEEDED`, and a `Retry-After` header.
