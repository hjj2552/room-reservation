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
    UUID beforeReservationRoomId,
    String reservationPurpose,
    String beforeReservationPurpose,
    String reservationRoomName,
    String beforeReservationRoomName,
    OffsetDateTime reservationStartAt,
    OffsetDateTime beforeReservationStartAt,
    OffsetDateTime reservationEndAt,
    OffsetDateTime beforeReservationEndAt,
    String reservationApplicantName,
    String beforeReservationApplicantName,
    String reservationApplicantEmail,
    String beforeReservationApplicantEmail,
    String reservationApplicantPhone,
    String beforeReservationApplicantPhone,
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
            history.getBeforeReservationRoomId(),
            history.getReservationPurpose(),
            history.getBeforeReservationPurpose(),
            history.getReservationRoomName(),
            history.getBeforeReservationRoomName(),
            history.getReservationStartAt(),
            history.getBeforeReservationStartAt(),
            history.getReservationEndAt(),
            history.getBeforeReservationEndAt(),
            history.getReservationApplicantName(),
            history.getBeforeReservationApplicantName(),
            history.getReservationApplicantEmail(),
            history.getBeforeReservationApplicantEmail(),
            history.getReservationApplicantPhone(),
            history.getBeforeReservationApplicantPhone(),
            history.getActorType(),
            history.getActorId(),
            history.getCreatedAt()
        );
    }
}
