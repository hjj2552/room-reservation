package com.school.reservation.domain.recurrence.dto.response;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public record PreviewRecurrenceResponse(
    int totalCandidates,
    int availableCount,
    int conflictCount,
    List<Item> items
) {
    public record Item(
        LocalDate date,
        OffsetDateTime startAt,
        OffsetDateTime endAt,
        boolean available,
        String reason,
        String message
    ) {
    }

    public static PreviewRecurrenceResponse from(List<Item> items) {
        int availableCount = (int) items.stream().filter(Item::available).count();
        return new PreviewRecurrenceResponse(
            items.size(),
            availableCount,
            items.size() - availableCount,
            items
        );
    }
}

