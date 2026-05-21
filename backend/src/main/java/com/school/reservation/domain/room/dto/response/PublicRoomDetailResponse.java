package com.school.reservation.domain.room.dto.response;

import com.school.reservation.domain.room.Room;
import java.util.UUID;

public record PublicRoomDetailResponse(
    UUID id,
    String name,
    String location,
    Integer capacity,
    String description
) {
    public static PublicRoomDetailResponse from(Room room) {
        return new PublicRoomDetailResponse(
            room.getId(),
            room.getName(),
            room.getLocation(),
            room.getCapacity(),
            room.getDescription()
        );
    }
}

