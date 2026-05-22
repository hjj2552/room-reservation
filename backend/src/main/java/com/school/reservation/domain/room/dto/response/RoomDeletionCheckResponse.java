package com.school.reservation.domain.room.dto.response;

import com.school.reservation.domain.room.Room;
import com.school.reservation.domain.room.RoomDeletionBlockerCode;
import java.util.List;
import java.util.UUID;

public record RoomDeletionCheckResponse(
    UUID roomId,
    String roomName,
    boolean deletable,
    List<DeletionCheckItem> checks,
    List<DeletionBlocker> blockers
) {
    public static RoomDeletionCheckResponse of(
        Room room,
        List<DeletionCheckItem> checks,
        List<DeletionBlocker> blockers
    ) {
        return new RoomDeletionCheckResponse(
            room.getId(),
            room.getName(),
            blockers.isEmpty(),
            checks,
            blockers
        );
    }

    public record DeletionCheckItem(
        String code,
        String label,
        String description,
        boolean passed,
        long count
    ) {
        public static DeletionCheckItem impact(String code, String label, String description, long count) {
            return new DeletionCheckItem(code, label, description, true, count);
        }
    }

    public record DeletionBlocker(
        String code,
        String message,
        long count
    ) {
        public static DeletionBlocker of(RoomDeletionBlockerCode code) {
            return new DeletionBlocker(code.code(), code.message(), 1);
        }
    }
}
