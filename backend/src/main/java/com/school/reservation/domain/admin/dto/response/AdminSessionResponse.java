package com.school.reservation.domain.admin.dto.response;

public record AdminSessionResponse(
    String id,
    String username,
    String role
) {
}

