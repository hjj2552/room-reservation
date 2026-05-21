package com.school.reservation.domain.room.dto.request;

import jakarta.validation.constraints.NotNull;

public record UpdateRoomEnabledRequest(
    @NotNull Boolean enabled
) {
}

