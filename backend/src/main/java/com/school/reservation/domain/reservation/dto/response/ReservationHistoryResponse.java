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
    UUID reservationRoomId,
    String reservationPurpose,
    String reservationRoomName,
    OffsetDateTime reservationStartAt,
    OffsetDateTime reservationEndAt,
    Reservation.ActorType actorType,
    String actorId,
    OffsetDateTime createdAt
) {
    public static ReservationHistoryResponse from(ReservationHistory history) {
        return new ReservationHistoryResponse(
            history.getId(),
            history.getReservationIdForDisplay(),
            history.getAction(),
            history.getBeforeStatus(),
            history.getAfterStatus(),
            history.getMemo(),
            history.getReservationRoomId(),
            history.getReservationPurpose(),
            history.getReservationRoomName(),
            history.getReservationStartAt(),
            history.getReservationEndAt(),
            history.getActorType(),
            history.getActorId(),
            history.getCreatedAt()
        );
    }
}
