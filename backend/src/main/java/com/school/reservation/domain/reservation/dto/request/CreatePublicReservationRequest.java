package com.school.reservation.domain.reservation.dto.request;

import com.school.reservation.domain.reservation.Reservation;
import com.school.reservation.domain.reservation.ReservationService;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.UUID;

public record CreatePublicReservationRequest(
    @NotNull UUID roomId,
    @NotBlank @Size(max = 100) String applicantName,
    @NotBlank @Email @Size(max = 255) String applicantEmail,
    @Size(max = 50) String applicantPhone,
    @NotBlank @Size(max = 500) String purpose,
    @NotNull OffsetDateTime startAt,
    @NotNull OffsetDateTime endAt,
    @NotBlank @Size(min = 4, max = 100) String cancelPassword
) {
    public ReservationService.CreateReservationCommand toCommand() {
        return new ReservationService.CreateReservationCommand(
            roomId,
            applicantName,
            applicantEmail,
            applicantPhone,
            purpose,
            startAt,
            endAt,
            Reservation.ReservationStatus.REQUESTED,
            Reservation.ReservationSource.PUBLIC_FORM
        );
    }
}
