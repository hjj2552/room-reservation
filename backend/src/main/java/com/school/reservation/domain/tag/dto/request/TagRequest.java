package com.school.reservation.domain.tag.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record TagRequest(
    @NotBlank @Size(max = 100) String name,
    @NotBlank
    @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "Tag color must be a hex color.")
    String color
) {
}
