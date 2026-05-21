package com.school.reservation.global.exception.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public record ApiErrorResponse(
    String code,
    String message,
    Map<String, Object> details,
    List<FieldErrorResponse> fieldErrors,
    OffsetDateTime timestamp,
    String path
) {
    public static ApiErrorResponse of(
        String code,
        String message,
        Map<String, Object> details,
        List<FieldErrorResponse> fieldErrors,
        String path
    ) {
        return new ApiErrorResponse(code, message, details, fieldErrors, OffsetDateTime.now(), path);
    }
}

