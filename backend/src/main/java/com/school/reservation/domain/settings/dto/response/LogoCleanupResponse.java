package com.school.reservation.domain.settings.dto.response;

public record LogoCleanupResponse(
    int scanned,
    int deleted,
    int skippedReferenced,
    int skippedRecent,
    int failed
) {
}
