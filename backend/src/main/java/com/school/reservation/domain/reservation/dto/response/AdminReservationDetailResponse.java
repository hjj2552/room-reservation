package com.school.reservation.domain.reservation.dto.response;

import com.school.reservation.domain.reservation.Reservation;
import java.time.OffsetDateTime;
import java.util.UUID;

public record AdminReservationDetailResponse(
    UUID id,
    RoomSummary room,
    UUID recurrenceId,
    String applicantName,
    String applicantEmail,
    String applicantPhone,
    String purpose,
    OffsetDateTime startAt,
    OffsetDateTime endAt,
    Reservation.ReservationStatus status,
    Reservation.ReservationSource source,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {
    public static AdminReservationDetailResponse from(Reservation reservation) {
        return new AdminReservationDetailResponse(
            reservation.getId(),
            RoomSummary.from(reservation),
            reservation.getRecurrenceId(),
            reservation.getApplicantName(),
            reservation.getApplicantEmail(),
            reservation.getApplicantPhone(),
            reservation.getPurpose(),
            reservation.getStartAt(),
            reservation.getEndAt(),
            reservation.getStatus(),
            reservation.getSource(),
            reservation.getCreatedAt(),
            reservation.getUpdatedAt()
        );
    }

    public record RoomSummary(UUID id, String name, String location) {
        static RoomSummary from(Reservation reservation) {
            return new RoomSummary(
                reservation.getRoom().getId(),
                reservation.getDisplayRoomName(),
                reservation.getRoom().getLocation()
            );
        }
    }
}
