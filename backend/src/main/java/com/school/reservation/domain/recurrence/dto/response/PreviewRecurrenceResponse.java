package com.school.reservation.domain.recurrence.dto.response;

import com.school.reservation.domain.recurrence.ReservationRecurrence;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public record PreviewRecurrenceResponse(
    ReservationRecurrence.ConflictPolicy conflictPolicy,
    int totalCandidates,
    int availableCount,
    int conflictCount,
    boolean createAllowed,
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

    public static PreviewRecurrenceResponse from(ReservationRecurrence.ConflictPolicy conflictPolicy, List<Item> items) {
        int availableCount = (int) items.stream().filter(Item::available).count();
        int conflictCount = items.size() - availableCount;
        return new PreviewRecurrenceResponse(
            conflictPolicy,
            items.size(),
            availableCount,
            conflictCount,
            conflictPolicy == ReservationRecurrence.ConflictPolicy.FAIL_ALL
                ? items.size() > 0 && conflictCount == 0
                : availableCount > 0,
            items
        );
    }
}
