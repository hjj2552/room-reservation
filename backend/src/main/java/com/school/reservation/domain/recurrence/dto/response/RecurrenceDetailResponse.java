package com.school.reservation.domain.recurrence.dto.response;

import com.school.reservation.domain.recurrence.ReservationRecurrence;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record RecurrenceDetailResponse(
    UUID id,
    RoomSummary room,
    String applicantName,
    String applicantEmail,
    String applicantPhone,
    String purpose,
    UUID tagId,
    String tagName,
    String tagColor,
    LocalDate startDate,
    LocalDate endDate,
    String daysOfWeek,
    LocalTime startTime,
    LocalTime endTime,
    ReservationRecurrence.ConflictPolicy conflictPolicy,
    boolean deleted,
    OffsetDateTime createdAt,
    List<RecurrenceReservationResponse> reservations
) {
    public static RecurrenceDetailResponse from(
        ReservationRecurrence recurrence,
        List<RecurrenceReservationResponse> reservations
    ) {
        return new RecurrenceDetailResponse(
            recurrence.getId(),
            new RoomSummary(recurrence.getRoom().getId(), recurrence.getDisplayRoomName(), recurrence.getRoom().getLocation()),
            recurrence.getApplicantName(),
            recurrence.getApplicantEmail(),
            recurrence.getApplicantPhone(),
            recurrence.getPurpose(),
            recurrence.getTagId(),
            recurrence.getTagName(),
            recurrence.getTagColor(),
            recurrence.getStartDate(),
            recurrence.getEndDate(),
            recurrence.getDaysOfWeek(),
            recurrence.getStartTime(),
            recurrence.getEndTime(),
            recurrence.getConflictPolicy(),
            recurrence.getDeletedAt() != null,
            recurrence.getCreatedAt(),
            reservations
        );
    }

    public record RoomSummary(UUID id, String name, String location) {
    }
}
