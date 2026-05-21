package com.school.reservation.domain.recurrence.dto.request;

import jakarta.validation.constraints.Size;

public record CancelRecurrenceRequest(
    @Size(max = 1000) String memo
) {
}

