package com.school.reservation.domain.room;

public enum RoomDeletionBlockerCode {
    SENTINEL_ROOM_PROTECTED(
        "SENTINEL_ROOM_PROTECTED",
        "삭제된 공간 기록 보존용 시스템 공간은 삭제할 수 없습니다."
    );

    private final String code;
    private final String message;

    RoomDeletionBlockerCode(String code, String message) {
        this.code = code;
        this.message = message;
    }

    public String code() {
        return code;
    }

    public String message() {
        return message;
    }
}
