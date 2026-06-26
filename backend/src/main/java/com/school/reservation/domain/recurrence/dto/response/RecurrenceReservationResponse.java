package com.school.reservation.domain.recurrence.dto.response;

import com.school.reservation.domain.reservation.Reservation;
import java.time.OffsetDateTime;
import java.util.UUID;

public record RecurrenceReservationResponse(
    UUID id,
    UUID roomId,
    String roomName,
    String purpose,
    OffsetDateTime startAt,
    OffsetDateTime endAt,
    Reservation.ReservationStatus status,
    boolean exception
) {
    public static RecurrenceReservationResponse from(Reservation reservation) {
        return new RecurrenceReservationResponse(
            reservation.getId(),
            reservation.getRoom().getId(),
            reservation.getDisplayRoomName(),
            reservation.getPurpose(),
            reservation.getStartAt(),
            reservation.getEndAt(),
            reservation.getStatus(),
            reservation.isRecurrenceException()
        );
    }
}
