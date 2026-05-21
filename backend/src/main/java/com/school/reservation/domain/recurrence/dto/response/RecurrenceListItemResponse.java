package com.school.reservation.domain.recurrence.dto.response;

import com.school.reservation.domain.recurrence.ReservationRecurrence;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

public record RecurrenceListItemResponse(
    UUID id,
    UUID roomId,
    String roomName,
    String purpose,
    LocalDate startDate,
    LocalDate endDate,
    String daysOfWeek,
    LocalTime startTime,
    LocalTime endTime,
    ReservationRecurrence.ConflictPolicy conflictPolicy,
    boolean deleted,
    OffsetDateTime createdAt
) {
    public static RecurrenceListItemResponse from(ReservationRecurrence recurrence) {
        return new RecurrenceListItemResponse(
            recurrence.getId(),
            recurrence.getRoom().getId(),
            recurrence.getRoom().getName(),
            recurrence.getPurpose(),
            recurrence.getStartDate(),
            recurrence.getEndDate(),
            recurrence.getDaysOfWeek(),
            recurrence.getStartTime(),
            recurrence.getEndTime(),
            recurrence.getConflictPolicy(),
            recurrence.getDeletedAt() != null,
            recurrence.getCreatedAt()
        );
    }
}

