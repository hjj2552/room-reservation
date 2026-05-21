package com.school.reservation.domain.reservation.dto.response;

import com.school.reservation.domain.reservation.Reservation;
import java.util.UUID;

public record CreatePublicReservationResponse(
    UUID id,
    Reservation.ReservationStatus status,
    String message
) {
    public static CreatePublicReservationResponse from(Reservation reservation, String message) {
        return new CreatePublicReservationResponse(reservation.getId(), reservation.getStatus(), message);
    }
}

