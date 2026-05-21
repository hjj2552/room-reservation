package com.school.reservation.domain.room.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateRoomRequest(
    @NotBlank @Size(max = 100) String name,
    @Size(max = 150) String location,
    @NotNull @Min(0) Integer capacity,
    String description,
    boolean enabled
) {
}

