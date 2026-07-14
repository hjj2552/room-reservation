package com.school.reservation.domain.reservation;

import com.school.reservation.domain.room.Room;
import com.school.reservation.domain.settings.OperationSettings;
import com.school.reservation.domain.settings.OperationSettingsRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import org.springframework.stereotype.Service;

@Service
public class ReservationPolicyService {

    private static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");
    private static final String PUBLIC_PAST_RESERVATION_MESSAGE =
        "과거의 시간표는 예약할 수 없습니다. 예약 시간을 다시 확인해 주세요.";

    private final OperationSettingsRepository operationSettingsRepository;
    private final Clock clock;

    public ReservationPolicyService(OperationSettingsRepository operationSettingsRepository, Clock clock) {
        this.operationSettingsRepository = operationSettingsRepository;
        this.clock = clock;
    }

    public void validatePublicReservation(Room room, OffsetDateTime startAt, OffsetDateTime endAt, String applicantPhone) {
        validate(room, startAt, endAt, applicantPhone, ValidationContext.PUBLIC);
    }

    public void validateAdminReservation(Room room, OffsetDateTime startAt, OffsetDateTime endAt, String applicantPhone) {
        validate(room, startAt, endAt, applicantPhone, ValidationContext.ADMIN);
    }

    private void validate(
        Room room,
        OffsetDateTime startAt,
        OffsetDateTime endAt,
        String applicantPhone,
        ValidationContext context
    ) {
        if (room == null || !room.isUsable()) {
            throw new PolicyViolationException("ROOM_DISABLED", "This room is not available.");
        }

        if (!startAt.isBefore(endAt)) {
            throw new PolicyViolationException("VALIDATION_ERROR", "Start time must be before end time.");
        }

        if (context == ValidationContext.PUBLIC && startAt.toInstant().isBefore(clock.instant())) {
            throw new PolicyViolationException("PAST_RESERVATION_TIME", PUBLIC_PAST_RESERVATION_MESSAGE);
        }

        OperationSettings settings = operationSettingsRepository.findById(OperationSettings.SINGLETON_ID)
            .orElseThrow(() -> new PolicyViolationException("POLICY_NOT_CONFIGURED", "Operation settings are missing."));

        if (!settings.isReservationEnabled()) {
            throw new PolicyViolationException("RESERVATION_DISABLED", settings.getReservationDisabledMessage());
        }

        var localStart = startAt.atZoneSameInstant(SERVICE_ZONE).toLocalDateTime();
        var localEnd = endAt.atZoneSameInstant(SERVICE_ZONE).toLocalDateTime();
        var date = localStart.toLocalDate();

        if (!hasMinutePrecision(localStart) || !hasMinutePrecision(localEnd)) {
            throw new PolicyViolationException(
                "INVALID_SLOT_UNIT",
                "Reservation start and end times must not include seconds or fractional seconds."
            );
        }

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
            || !isAlignedToSlot(localEnd.getMinute(), settings.getSlotMinutes())
            || !isAlignedToSlot(minutes, settings.getSlotMinutes())) {
            throw new PolicyViolationException("INVALID_SLOT_UNIT", "The requested time must match the configured slot unit.");
        }

        if (applicantPhone == null || applicantPhone.isBlank()) {
            throw new PolicyViolationException("VALIDATION_ERROR", "Phone number is required.");
        }
    }

    private boolean hasMinutePrecision(java.time.LocalDateTime value) {
        return value.getSecond() == 0 && value.getNano() == 0;
    }

    private boolean isAlignedToSlot(long minutes, int slotMinutes) {
        return minutes % slotMinutes == 0;
    }

    private enum ValidationContext {
        PUBLIC,
        ADMIN
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
