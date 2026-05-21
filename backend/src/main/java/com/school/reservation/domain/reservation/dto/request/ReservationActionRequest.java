package com.school.reservation.domain.reservation.dto.request;

import jakarta.validation.constraints.Size;

public record ReservationActionRequest(
    @Size(max = 1000) String memo
) {
}

