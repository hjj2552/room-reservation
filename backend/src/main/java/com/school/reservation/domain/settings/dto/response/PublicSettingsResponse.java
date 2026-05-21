package com.school.reservation.domain.settings.dto.response;

import com.school.reservation.domain.settings.OperationSettings;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record PublicSettingsResponse(
    String organizationName,
    String publicNotice,
    boolean reservationEnabled,
    String reservationDisabledMessage,
    LocalDate semesterStartDate,
    LocalDate semesterEndDate,
    LocalTime openTime,
    LocalTime closeTime,
    Integer slotMinutes,
    List<String> availableDaysOfWeek,
    Integer minReservationMinutes,
    Integer maxReservationMinutes,
    boolean requirePhone,
    String completionMessage,
    String adminContactEmail
) {
    public static PublicSettingsResponse from(OperationSettings settings) {
        return new PublicSettingsResponse(
            settings.getOrganizationName(),
            settings.getPublicNotice(),
            settings.isReservationEnabled(),
            settings.getReservationDisabledMessage(),
            settings.getSemesterStartDate(),
            settings.getSemesterEndDate(),
            settings.getOpenTime(),
            settings.getCloseTime(),
            settings.getSlotMinutes(),
            settings.availableDaySet().stream().sorted().toList(),
            settings.getMinReservationMinutes(),
            settings.getMaxReservationMinutes(),
            settings.isRequirePhone(),
            settings.getCompletionMessage(),
            settings.getAdminContactEmail()
        );
    }
}

