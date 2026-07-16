package com.school.reservation.domain.settings;

import com.school.reservation.domain.settings.dto.request.UpdateOperationSettingsRequest;
import com.school.reservation.global.exception.ApiConflictException;
import com.school.reservation.global.time.ReservationTimePolicy;
import jakarta.persistence.EntityNotFoundException;
import java.time.Duration;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SettingsService {

    private static final Set<String> ALLOWED_DAYS = Set.of("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN");

    private final OperationSettingsRepository operationSettingsRepository;

    public SettingsService(OperationSettingsRepository operationSettingsRepository) {
        this.operationSettingsRepository = operationSettingsRepository;
    }

    @Transactional(readOnly = true)
    public OperationSettings getSettings() {
        return operationSettingsRepository.findById(OperationSettings.SINGLETON_ID)
            .orElseThrow(() -> new EntityNotFoundException("Operation settings not found."));
    }

    @Transactional
    public OperationSettings update(UpdateOperationSettingsRequest request, UUID actorId) {
        OperationSettings settings = getSettings();
        validate(request);

        if (!settings.getVersion().equals(request.version())) {
            throw new ApiConflictException("VERSION_CONFLICT", "Settings were updated by another request.");
        }

        settings.update(
            request.organizationName(),
            request.publicNotice(),
            request.reservationEnabled(),
            request.reservationDisabledMessage(),
            request.semesterStartDate(),
            request.semesterEndDate(),
            request.openTime(),
            request.closeTime(),
            ReservationTimePolicy.RESERVATION_INCREMENT_MINUTES,
            String.join(",", request.availableDaysOfWeek()),
            request.minReservationMinutes(),
            request.maxReservationMinutes(),
            request.adminContactEmail(),
            request.adminContactPhone(),
            request.completionMessage(),
            actorId
        );
        return settings;
    }

    private void validate(UpdateOperationSettingsRequest request) {
        if (request.semesterStartDate().isAfter(request.semesterEndDate())) {
            throw new IllegalArgumentException("Semester start date must be before or equal to end date.");
        }
        if (!request.openTime().isBefore(request.closeTime())) {
            throw new IllegalArgumentException("Open time must be before close time.");
        }
        if (!hasMinutePrecision(request.openTime()) || !hasMinutePrecision(request.closeTime())) {
            throw new IllegalArgumentException("Open and close time must not include seconds or fractional seconds.");
        }
        if (!isAlignedToIncrement(request.openTime().getMinute(), ReservationTimePolicy.TIMETABLE_GRID_MINUTES)
            || !isAlignedToIncrement(request.closeTime().getMinute(), ReservationTimePolicy.TIMETABLE_GRID_MINUTES)) {
            throw new IllegalArgumentException("Open and close time must align to 30-minute timetable boundaries.");
        }
        if (request.minReservationMinutes() < ReservationTimePolicy.TIMETABLE_GRID_MINUTES) {
            throw new IllegalArgumentException("Min reservation minutes must be at least 30.");
        }
        if (request.maxReservationMinutes() < request.minReservationMinutes()) {
            throw new IllegalArgumentException("Max reservation minutes must be greater than or equal to min.");
        }
        if (!isAlignedToIncrement(request.minReservationMinutes(), ReservationTimePolicy.RESERVATION_INCREMENT_MINUTES)
            || !isAlignedToIncrement(request.maxReservationMinutes(), ReservationTimePolicy.RESERVATION_INCREMENT_MINUTES)) {
            throw new IllegalArgumentException("Min and max reservation minutes must be multiples of 5.");
        }
        if (Duration.between(request.openTime(), request.closeTime()).toMinutes() < request.minReservationMinutes()) {
            throw new IllegalArgumentException("Min reservation minutes must fit within operating hours.");
        }
        boolean hasInvalidDay = request.availableDaysOfWeek().stream()
            .map(String::trim)
            .anyMatch(day -> !ALLOWED_DAYS.contains(day));
        if (hasInvalidDay) {
            throw new IllegalArgumentException("Available days must use MON,TUE,WED,THU,FRI,SAT,SUN.");
        }
    }

    private boolean isAlignedToIncrement(int minutes, int incrementMinutes) {
        return minutes % incrementMinutes == 0;
    }

    private boolean hasMinutePrecision(java.time.LocalTime value) {
        return value.getSecond() == 0 && value.getNano() == 0;
    }
}
