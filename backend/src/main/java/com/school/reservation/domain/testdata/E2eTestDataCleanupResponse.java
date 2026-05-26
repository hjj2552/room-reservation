package com.school.reservation.domain.testdata;

public record E2eTestDataCleanupResponse(
    String prefix,
    boolean dryRun,
    boolean includeLegacy,
    int reservationHistoriesDeleted,
    int reservationsDeleted,
    int recurrencesDeleted,
    int roomsDeleted,
    int roomsSkipped
) {
}
