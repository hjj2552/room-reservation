package com.school.reservation.domain.reservation;

import com.school.reservation.domain.room.Room;
import com.school.reservation.domain.settings.OperationSettings;
import com.school.reservation.domain.settings.OperationSettingsRepository;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import org.springframework.stereotype.Service;

@Service
public class ReservationPolicyService {

    private static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");

    private final OperationSettingsRepository operationSettingsRepository;

    public ReservationPolicyService(OperationSettingsRepository operationSettingsRepository) {
        this.operationSettingsRepository = operationSettingsRepository;
    }

    public void validate(Room room, OffsetDateTime startAt, OffsetDateTime endAt, String applicantPhone) {
        if (room == null || !room.isUsable()) {
            throw new PolicyViolationException("ROOM_DISABLED", "This room is not available.");
        }

        if (!startAt.isBefore(endAt)) {
            throw new PolicyViolationException("VALIDATION_ERROR", "Start time must be before end time.");
        }

        OperationSettings settings = operationSettingsRepository.findById(OperationSettings.SINGLETON_ID)
            .orElseThrow(() -> new PolicyViolationException("POLICY_NOT_CONFIGURED", "Operation settings are missing."));

        if (!settings.isReservationEnabled()) {
            throw new PolicyViolationException("RESERVATION_DISABLED", settings.getReservationDisabledMessage());
        }

        var localStart = startAt.atZoneSameInstant(SERVICE_ZONE).toLocalDateTime();
        var localEnd = endAt.atZoneSameInstant(SERVICE_ZONE).toLocalDateTime();
        var date = localStart.toLocalDate();

        if (!localStart.toLocalDate().equals(localEnd.toLocalDate())) {
            throw new PolicyViolationException("OUTSIDE_OPERATING_HOURS", "Reservations must be within a single day.");
        }

        if (date.isBefore(settings.getSemesterStartDate()) || date.isAfter(settings.getSemesterEndDate())) {
            throw new PolicyViolationException("OUTSIDE_SEMESTER_PERIOD", "The requested date is outside the semester period.");
        }

        String dayName = localStart.getDayOfWeek().name().substring(0, 3);
        if (!settings.availableDaySet().contains(dayName)) {
            throw new PolicyViolationException("OUTSIDE_OPERATING_DAYS", "The requested day is not available for reservations.");
        }

        if (localStart.toLocalTime().isBefore(settings.getOpenTime())
            || localEnd.toLocalTime().isAfter(settings.getCloseTime())) {
            throw new PolicyViolationException("OUTSIDE_OPERATING_HOURS", "The requested time is outside operating hours.");
        }

        long minutes = Duration.between(startAt, endAt).toMinutes();
        if (minutes < settings.getMinReservationMinutes() || minutes > settings.getMaxReservationMinutes()) {
            throw new PolicyViolationException("INVALID_DURATION", "The requested duration is not allowed.");
        }

        if (!isAlignedToSlot(localStart.getMinute(), settings.getSlotMinutes())
            || !isAlignedToSlot(localEnd.getMinute(), settings.getSlotMinutes())) {
            throw new PolicyViolationException("INVALID_SLOT_UNIT", "The requested time must match the configured slot unit.");
        }

        if (settings.isRequirePhone() && (applicantPhone == null || applicantPhone.isBlank())) {
            throw new PolicyViolationException("VALIDATION_ERROR", "Phone number is required.");
        }
    }

    private boolean isAlignedToSlot(int minute, int slotMinutes) {
        return minute % slotMinutes == 0;
    }

    public static class PolicyViolationException extends RuntimeException {
        private final String code;

        public PolicyViolationException(String code, String message) {
            super(message == null || message.isBlank() ? "Reservation policy violation." : message);
            this.code = code;
        }

        public String getCode() {
            return code;
        }
    }
}

