package com.school.reservation.domain.reservation.dto.response;

import com.school.reservation.domain.reservation.Reservation;
import java.time.OffsetDateTime;
import java.util.UUID;

public record AdminReservationListItemResponse(
    UUID id,
    UUID roomId,
    String roomName,
    String applicantName,
    String applicantEmail,
    String applicantPhone,
    String purpose,
    OffsetDateTime startAt,
    OffsetDateTime endAt,
    Reservation.ReservationStatus status,
    Reservation.ReservationSource source,
    OffsetDateTime createdAt
) {
    public static AdminReservationListItemResponse from(Reservation reservation) {
        return new AdminReservationListItemResponse(
            reservation.getId(),
            reservation.getRoom().getId(),
            reservation.getDisplayRoomName(),
            reservation.getApplicantName(),
            reservation.getApplicantEmail(),
            reservation.getApplicantPhone(),
            reservation.getPurpose(),
            reservation.getStartAt(),
            reservation.getEndAt(),
            reservation.getStatus(),
            reservation.getSource(),
            reservation.getCreatedAt()
        );
    }
}
