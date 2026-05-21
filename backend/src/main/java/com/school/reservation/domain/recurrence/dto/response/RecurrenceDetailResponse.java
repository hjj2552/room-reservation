package com.school.reservation.domain.recurrence.dto.response;

import com.school.reservation.domain.recurrence.ReservationRecurrence;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

public record RecurrenceDetailResponse(
    UUID id,
    RoomSummary room,
    String applicantName,
    String applicantEmail,
    String applicantPhone,
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
    public static RecurrenceDetailResponse from(ReservationRecurrence recurrence) {
        return new RecurrenceDetailResponse(
            recurrence.getId(),
            new RoomSummary(recurrence.getRoom().getId(), recurrence.getRoom().getName(), recurrence.getRoom().getLocation()),
            recurrence.getApplicantName(),
            recurrence.getApplicantEmail(),
            recurrence.getApplicantPhone(),
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

    public record RoomSummary(UUID id, String name, String location) {
    }
}

