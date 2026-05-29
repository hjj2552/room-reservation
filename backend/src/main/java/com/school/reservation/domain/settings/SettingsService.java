package com.school.reservation.domain.settings;

import com.school.reservation.domain.settings.dto.request.UpdateOperationSettingsRequest;
import com.school.reservation.global.exception.ApiConflictException;
import jakarta.persistence.EntityNotFoundException;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SettingsService {

    private static final Set<Integer> ALLOWED_SLOT_MINUTES = Set.of(5, 10, 15, 30, 60);
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
            request.slotMinutes(),
            String.join(",", request.availableDaysOfWeek()),
            request.minReservationMinutes(),
            request.maxReservationMinutes(),
            request.requirePhone(),
            request.adminContactName(),
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
        if (!ALLOWED_SLOT_MINUTES.contains(request.slotMinutes())) {
            throw new IllegalArgumentException("Slot minutes must be one of 5, 10, 15, 30, 60.");
        }
        if (request.maxReservationMinutes() < request.minReservationMinutes()) {
            throw new IllegalArgumentException("Max reservation minutes must be greater than or equal to min.");
        }
        boolean hasInvalidDay = request.availableDaysOfWeek().stream()
            .map(String::trim)
            .anyMatch(day -> !ALLOWED_DAYS.contains(day));
        if (hasInvalidDay) {
            throw new IllegalArgumentException("Available days must use MON,TUE,WED,THU,FRI,SAT,SUN.");
        }
    }
}
