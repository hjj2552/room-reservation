package com.school.reservation.global.exception.dto;

import org.springframework.validation.FieldError;

public record FieldErrorResponse(
    String field,
    String message
) {
    public static FieldErrorResponse from(FieldError error) {
        return new FieldErrorResponse(error.getField(), error.getDefaultMessage());
    }
}

