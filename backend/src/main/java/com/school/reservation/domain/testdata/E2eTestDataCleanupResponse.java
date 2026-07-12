package com.school.reservation.domain.testdata;

public record E2eTestDataCleanupResponse(
    String prefix,
    boolean dryRun,
    int reservationHistoriesDeleted,
    int reservationsDeleted,
    int recurrencesDeleted,
    int tagsDeleted,
    int tagsSkipped,
    int roomsDeleted,
    int roomsSkipped
) {
}
