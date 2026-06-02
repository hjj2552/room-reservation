package com.school.reservation.domain.reservation.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PublicReservationPasswordRequest(
    @NotBlank @Size(min = 4, max = 100) String cancelPassword
) {
}
