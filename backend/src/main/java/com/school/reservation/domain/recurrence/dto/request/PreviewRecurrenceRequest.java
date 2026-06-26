package com.school.reservation.domain.recurrence.dto.request;

import com.school.reservation.domain.recurrence.ReservationRecurrence;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
    @NotNull LocalTime endTime,
    @Size(max = 50) String applicantPhone,
    @NotNull ReservationRecurrence.ConflictPolicy conflictPolicy
) {
}
