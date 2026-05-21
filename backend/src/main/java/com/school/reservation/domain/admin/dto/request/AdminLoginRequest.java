package com.school.reservation.domain.admin.dto.request;

import jakarta.validation.constraints.NotBlank;

public record AdminLoginRequest(
    @NotBlank String username,
    @NotBlank String password
) {
}

