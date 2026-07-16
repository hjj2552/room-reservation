package com.school.reservation.domain.settings.dto.response;

import com.school.reservation.domain.settings.OperationSettings;
import com.school.reservation.global.time.ReservationTimePolicy;
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
    // Deprecated compatibility field; always 5.
    Integer slotMinutes,
    List<String> availableDaysOfWeek,
    Integer minReservationMinutes,
    Integer maxReservationMinutes,
    String completionMessage,
    String adminContactEmail,
    String adminContactPhone
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
            ReservationTimePolicy.RESERVATION_INCREMENT_MINUTES,
            settings.availableDaySet().stream().sorted().toList(),
            settings.getMinReservationMinutes(),
            settings.getMaxReservationMinutes(),
            settings.getCompletionMessage(),
            settings.getAdminContactEmail(),
            settings.getAdminContactPhone()
        );
    }
}
