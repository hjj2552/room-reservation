package com.school.reservation.domain.settings.dto.response;

import com.school.reservation.domain.settings.OperationSettings;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record OperationSettingsResponse(
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
    String adminContactName,
    String adminContactEmail,
    String adminContactPhone,
    String completionMessage,
    Long version
) {
    public static OperationSettingsResponse from(OperationSettings settings) {
        return new OperationSettingsResponse(
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
            settings.getAdminContactName(),
            settings.getAdminContactEmail(),
            settings.getAdminContactPhone(),
            settings.getCompletionMessage(),
            settings.getVersion()
        );
    }
}

