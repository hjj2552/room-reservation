package com.school.reservation.domain.room.dto.response;

import com.school.reservation.domain.room.Room;
import java.time.OffsetDateTime;
import java.util.UUID;

public record AdminRoomResponse(
    UUID id,
    String name,
    String location,
    Integer capacity,
    String description,
    boolean enabled,
    boolean deleted,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt,
    OffsetDateTime deletedAt
) {
    public static AdminRoomResponse from(Room room) {
        return new AdminRoomResponse(
            room.getId(),
            room.getName(),
            room.getLocation(),
            room.getCapacity(),
            room.getDescription(),
            room.isEnabled(),
            room.getDeletedAt() != null,
            room.getCreatedAt(),
            room.getUpdatedAt(),
            room.getDeletedAt()
        );
    }
}

