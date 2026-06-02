package com.school.reservation.domain.reservation.dto.response;

import com.school.reservation.domain.reservation.Reservation;
import java.time.OffsetDateTime;
import java.util.UUID;

public record PublicReservationEditResponse(
    UUID id,
    RoomSummary room,
    String applicantName,
    String applicantEmail,
    String applicantPhone,
    String purpose,
    OffsetDateTime startAt,
    OffsetDateTime endAt,
    Reservation.ReservationStatus status,
    boolean editable
) {
    public static PublicReservationEditResponse from(Reservation reservation) {
        return new PublicReservationEditResponse(
            reservation.getId(),
            RoomSummary.from(reservation),
            reservation.getApplicantName(),
            reservation.getApplicantEmail(),
            reservation.getApplicantPhone(),
            reservation.getPurpose(),
            reservation.getStartAt(),
            reservation.getEndAt(),
            reservation.getStatus(),
            reservation.getStatus() != Reservation.ReservationStatus.CANCELLED
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
