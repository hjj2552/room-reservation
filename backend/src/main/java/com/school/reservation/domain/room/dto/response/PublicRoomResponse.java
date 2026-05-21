package com.school.reservation.domain.room.dto.response;

import com.school.reservation.domain.room.Room;
import java.util.UUID;

public record PublicRoomResponse(
    UUID id,
    String name,
    String location,
    Integer capacity,
    String description
) {
    public static PublicRoomResponse from(Room room) {
        return new PublicRoomResponse(
            room.getId(),
            room.getName(),
            room.getLocation(),
            room.getCapacity(),
            room.getDescription()
        );
    }
}

