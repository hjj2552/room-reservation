package com.school.reservation.domain.reservation.dto.response;

import com.school.reservation.domain.reservation.Reservation;
import com.school.reservation.domain.reservation.ReservationHistory;
import java.time.OffsetDateTime;
import java.util.UUID;

public record ReservationHistoryResponse(
    UUID id,
    UUID reservationId,
    ReservationHistory.Action action,
    Reservation.ReservationStatus beforeStatus,
    Reservation.ReservationStatus afterStatus,
    String memo,
    Reservation.ActorType actorType,
    String actorId,
    OffsetDateTime createdAt
) {
    public static ReservationHistoryResponse from(ReservationHistory history) {
        return new ReservationHistoryResponse(
            history.getId(),
            history.getReservation().getId(),
            history.getAction(),
            history.getBeforeStatus(),
            history.getAfterStatus(),
            history.getMemo(),
            history.getActorType(),
            history.getActorId(),
            history.getCreatedAt()
        );
    }
}

