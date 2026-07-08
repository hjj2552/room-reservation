const fallbackReservationDurationMinutes = 30;

// Quick-create defaults should be valid starting points, while manual time input stays flexible.
export function defaultReservationDurationMinutes(
  minReservationMinutes = fallbackReservationDurationMinutes,
) {
  return Math.max(minReservationMinutes || fallbackReservationDurationMinutes, 1);
}

export function reservationSlotUnitMinutes(slotMinutes = fallbackReservationDurationMinutes) {
  return Math.max(slotMinutes || fallbackReservationDurationMinutes, 1);
}
