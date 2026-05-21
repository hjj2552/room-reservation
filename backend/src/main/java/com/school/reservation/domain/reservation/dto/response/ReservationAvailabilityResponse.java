package com.school.reservation.domain.reservation.dto.response;

public record ReservationAvailabilityResponse(
    boolean available,
    String reason,
    String message
) {
    public static ReservationAvailabilityResponse open() {
        return new ReservationAvailabilityResponse(true, null, null);
    }

    public static ReservationAvailabilityResponse unavailable(String reason, String message) {
        return new ReservationAvailabilityResponse(false, reason, message);
    }
}
