package com.school.reservation.domain.settings.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record UpdateOperationSettingsRequest(
    @NotBlank @Size(max = 150) String organizationName,
    String publicNotice,
    boolean reservationEnabled,
    String reservationDisabledMessage,
    @NotNull LocalDate semesterStartDate,
    @NotNull LocalDate semesterEndDate,
    @NotNull LocalTime openTime,
    @NotNull LocalTime closeTime,
    @NotNull Integer slotMinutes,
    @NotEmpty List<String> availableDaysOfWeek,
    @NotNull @Min(1) Integer minReservationMinutes,
    @NotNull @Min(1) Integer maxReservationMinutes,
    @Size(max = 100) String adminContactName,
    @Email @Size(max = 255) String adminContactEmail,
    @Size(max = 50) String adminContactPhone,
    String completionMessage,
    @Size(max = 500) String logoUrl,
    @NotNull Long version
) {
}
