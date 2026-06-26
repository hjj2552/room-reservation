package com.school.reservation.domain.recurrence.dto.response;

import com.school.reservation.domain.recurrence.ReservationRecurrence;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record CreateRecurrenceResponse(
    UUID recurrenceId,
    String seriesLabel,
    String seriesColor,
    ReservationRecurrence.ConflictPolicy conflictPolicy,
    int totalCandidates,
    int createdCount,
    int skippedCount,
    int failedCount,
    List<Item> items
) {
    public record Item(
        LocalDate date,
        String status,
        String reason
    ) {
    }
}
