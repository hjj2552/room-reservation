package com.school.reservation.domain.reservation.dto.request;

import com.school.reservation.domain.reservation.Reservation;
import com.school.reservation.domain.reservation.ReservationService;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.UUID;

public record UpdatePublicReservationRequest(
    @NotNull UUID roomId,
    @NotBlank @Size(max = 100) String applicantName,
    @NotBlank @Email @Size(max = 255) String applicantEmail,
    @NotBlank @Size(max = 50) String applicantPhone,
    @NotBlank @Size(max = 500) String purpose,
    @NotNull OffsetDateTime startAt,
    @NotNull OffsetDateTime endAt,
    @NotBlank @Size(min = 4, max = 100) String cancelPassword
) {
    public ReservationService.UpdateReservationCommand toCommand() {
        return new ReservationService.UpdateReservationCommand(
            roomId,
            applicantName,
            applicantEmail,
            applicantPhone,
            purpose,
            startAt,
            endAt,
            Reservation.ReservationStatus.REQUESTED
        );
    }
}
