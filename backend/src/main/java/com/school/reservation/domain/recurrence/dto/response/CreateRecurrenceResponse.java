package com.school.reservation.domain.recurrence.dto.response;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record CreateRecurrenceResponse(
    UUID recurrenceId,
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

