package com.school.reservation.domain.recurrence.dto.request;

import com.school.reservation.domain.recurrence.ReservationRecurrence;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public record CreateRecurrenceRequest(
    @NotNull UUID roomId,
    @NotBlank @Size(max = 100) String applicantName,
    @NotBlank @Email @Size(max = 255) String applicantEmail,
    @NotBlank @Size(max = 50) String applicantPhone,
    @NotBlank @Size(max = 500) String purpose,
    UUID tagId,
    @NotNull LocalDate startDate,
    @NotNull LocalDate endDate,
    @NotEmpty List<String> daysOfWeek,
    @NotNull LocalTime startTime,
    @NotNull LocalTime endTime,
    @NotNull ReservationRecurrence.ConflictPolicy conflictPolicy
) {
    public PreviewRecurrenceRequest toPreviewRequest() {
        return new PreviewRecurrenceRequest(roomId, startDate, endDate, daysOfWeek, startTime, endTime, applicantPhone, conflictPolicy);
    }
}
