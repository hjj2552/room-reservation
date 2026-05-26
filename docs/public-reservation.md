# Public Reservation Requests

The public reservation page is available at `/public/reservations/new`. `/request` redirects to the same page.

## User Flow

- Public users view the same timetable-style reservation grid used by the admin UI.
- Date view shows enabled rooms for the selected date. Room view shows one room across the selected week.
- Clicking an empty timetable slot opens a public quick request panel with room, date, and time prefilled.
- Clicking an existing request/reservation block opens a public-safe detail modal.
- Public users do not log in. They provide a reservation-specific cancel password when creating the request.

## Request State

- Public submissions are stored as `REQUESTED`, not as confirmed reservations.
- The success message must say that the reservation request was received, not that the reservation is complete.
- Admin approval, rejection, forced creation, recurrence creation, audit history, and admin memo fields are not exposed in the public UI.

## Cancel Password Policy

- Public request creation requires `cancelPassword`.
- The backend stores only a password hash in `reservations.cancel_password_hash`; it must not store the raw password.
- Public cancellation requires the same password through `/api/public/reservations/{reservationId}/cancel`.
- If the password is wrong, the API returns `PUBLIC_CANCEL_PASSWORD_MISMATCH` and the UI shows a clear mismatch message.
- If the user loses the cancel password, they cannot self-cancel through the public UI and must ask an administrator for help.

## Conflict Policy

The backend is the final authority for overlap checks.

- A public request is rejected when it overlaps an existing `CONFIRMED` reservation for the same room.
- A public request is also rejected when it overlaps an existing `REQUESTED` request for the same room.
- This keeps the policy to one pending request per room/time slot.
- Cancelled reservations do not block new requests.

The public frontend maps `TIME_SLOT_CONFLICT` to:

> 이미 다른 신청 또는 예약이 있어 신청할 수 없습니다. 다른 강의실이나 시간을 선택해 주세요.
