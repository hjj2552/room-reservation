package com.school.reservation.domain.reservation;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ReservationConflictService {

    private final ReservationRepository reservationRepository;

    public ReservationConflictService(ReservationRepository reservationRepository) {
        this.reservationRepository = reservationRepository;
    }

    public void validateNoConflict(UUID roomId, OffsetDateTime startAt, OffsetDateTime endAt, UUID excludingReservationId) {
        if (existsConflict(roomId, startAt, endAt, excludingReservationId)) {
            throw new TimeSlotConflictException(roomId, startAt, endAt);
        }
    }

    public boolean existsConflict(UUID roomId, OffsetDateTime startAt, OffsetDateTime endAt, UUID excludingReservationId) {
        return reservationRepository.existsOverlappingReservation(
            roomId,
            startAt,
            endAt,
            List.of(
                Reservation.ReservationStatus.REQUESTED,
                Reservation.ReservationStatus.CONFIRMED
            ),
            excludingReservationId
        );
    }

    public static class TimeSlotConflictException extends RuntimeException {
        private final UUID roomId;
        private final OffsetDateTime startAt;
        private final OffsetDateTime endAt;

        public TimeSlotConflictException(UUID roomId, OffsetDateTime startAt, OffsetDateTime endAt) {
            super("Time slot is already reserved.");
            this.roomId = roomId;
            this.startAt = startAt;
            this.endAt = endAt;
        }

        public UUID getRoomId() {
            return roomId;
        }

        public OffsetDateTime getStartAt() {
            return startAt;
        }

        public OffsetDateTime getEndAt() {
            return endAt;
        }
    }
}
