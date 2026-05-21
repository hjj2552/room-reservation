package com.school.reservation.domain.recurrence.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public record PreviewRecurrenceRequest(
    @NotNull UUID roomId,
    @NotNull LocalDate startDate,
    @NotNull LocalDate endDate,
    @NotEmpty List<String> daysOfWeek,
    @NotNull LocalTime startTime,
    @NotNull LocalTime endTime
) {
}

