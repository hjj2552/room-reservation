package com.school.reservation.domain.reservation.dto.response;

import com.school.reservation.domain.reservation.Reservation;
import com.school.reservation.domain.room.Room;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record PublicRoomWeeklyReservationsResponse(
    RoomSummary room,
    LocalDate weekStart,
    LocalDate weekEnd,
    List<ReservationBlock> reservations
) {
    public static PublicRoomWeeklyReservationsResponse of(Room room, LocalDate weekStart, List<Reservation> reservations) {
        return new PublicRoomWeeklyReservationsResponse(
            RoomSummary.from(room),
            weekStart,
            weekStart.plusDays(6),
            reservations.stream().map(ReservationBlock::from).toList()
        );
    }

    public record RoomSummary(UUID id, String name, String location) {
        static RoomSummary from(Room room) {
            return new RoomSummary(room.getId(), room.getName(), room.getLocation());
        }
    }

    public record ReservationBlock(
        UUID id,
        OffsetDateTime startAt,
        OffsetDateTime endAt,
        Reservation.ReservationStatus status,
        String purpose
    ) {
        static ReservationBlock from(Reservation reservation) {
            return new ReservationBlock(
                reservation.getId(),
                reservation.getStartAt(),
                reservation.getEndAt(),
                reservation.getStatus(),
                reservation.getPurpose()
            );
        }
    }
}

