package com.school.reservation.domain.reservation;

import com.school.reservation.domain.reservation.dto.response.PublicRoomWeeklyReservationsResponse;
import com.school.reservation.domain.reservation.dto.response.ReservationAvailabilityResponse;
import com.school.reservation.domain.room.Room;
import com.school.reservation.domain.room.RoomRepository;
import jakarta.persistence.EntityNotFoundException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PublicScheduleQueryService {

    private static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");

    private final RoomRepository roomRepository;
    private final ReservationRepository reservationRepository;
    private final ReservationPolicyService policyService;
    private final ReservationConflictService conflictService;

    public PublicScheduleQueryService(
        RoomRepository roomRepository,
        ReservationRepository reservationRepository,
        ReservationPolicyService policyService,
        ReservationConflictService conflictService
    ) {
        this.roomRepository = roomRepository;
        this.reservationRepository = reservationRepository;
        this.policyService = policyService;
        this.conflictService = conflictService;
    }

    @Transactional(readOnly = true)
    public PublicRoomWeeklyReservationsResponse getWeeklyReservations(UUID roomId, LocalDate weekStart) {
        Room room = roomRepository.findByIdAndEnabledTrueAndDeletedAtIsNull(roomId)
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
        OffsetDateTime startAt = weekStart.atStartOfDay(SERVICE_ZONE).toOffsetDateTime();
        OffsetDateTime endAt = weekStart.plusDays(7).atStartOfDay(SERVICE_ZONE).toOffsetDateTime();
        List<Reservation> reservations = reservationRepository.findRoomReservationsBetween(
            roomId,
            startAt,
            endAt,
            List.of(Reservation.ReservationStatus.REQUESTED, Reservation.ReservationStatus.CONFIRMED)
        );
        return PublicRoomWeeklyReservationsResponse.of(room, weekStart, reservations);
    }

    @Transactional(readOnly = true)
    public ReservationAvailabilityResponse checkAvailability(UUID roomId, OffsetDateTime startAt, OffsetDateTime endAt) {
        try {
            Room room = roomRepository.findByIdAndEnabledTrueAndDeletedAtIsNull(roomId)
                .orElseThrow(() -> new ReservationPolicyService.PolicyViolationException("ROOM_DISABLED", "This room is not available."));
            policyService.validate(room, startAt, endAt, "availability-check");
            if (conflictService.existsConflict(roomId, startAt, endAt, null)) {
                return ReservationAvailabilityResponse.unavailable("TIME_SLOT_CONFLICT", "The selected time slot is already reserved.");
            }
            return ReservationAvailabilityResponse.open();
        } catch (ReservationPolicyService.PolicyViolationException exception) {
            return ReservationAvailabilityResponse.unavailable(exception.getCode(), exception.getMessage());
        }
    }
}
