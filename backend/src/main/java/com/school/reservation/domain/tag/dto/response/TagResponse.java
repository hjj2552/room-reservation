package com.school.reservation.domain.tag.dto.response;

import com.school.reservation.domain.tag.Tag;
import java.time.OffsetDateTime;
import java.util.UUID;

public record TagResponse(
    UUID id,
    String name,
    String color,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {
    public static TagResponse from(Tag tag) {
        return new TagResponse(
            tag.getId(),
            tag.getName(),
            tag.getColor(),
            tag.getCreatedAt(),
            tag.getUpdatedAt()
        );
    }
}
