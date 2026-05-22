# Room Deletion Policy

관리자 화면의 강의실 `삭제`는 운영 목록에서 강의실을 제거하되, 기존 예약과 반복 예약 row를 보존합니다.

## Sentinel Room

- `rooms.system_reserved = true`인 row를 삭제된 강의실 기록 보존용 sentinel room으로 사용합니다.
- 기본 이름은 `(삭제된 강의실)`입니다.
- sentinel room은 관리자/공개 강의실 목록과 예약 생성용 선택 목록에 노출하지 않습니다.
- sentinel room은 수정, 비활성화, 삭제할 수 없습니다.

## Delete Flow

삭제는 서비스 레이어 트랜잭션에서 처리합니다.

1. 삭제 대상 room이 sentinel room이 아닌지 확인합니다.
2. `reservations.original_room_name`에 기존 강의실명을 저장합니다.
3. `reservation_recurrences.original_room_name`에 기존 강의실명을 저장합니다.
4. 예약과 반복 예약의 `room_id`를 sentinel room id로 변경합니다.
5. 원래 room row를 hard delete합니다.

예약/반복 예약 응답에서 sentinel room을 만나면 저장된 원래 강의실명을 사용해 `원래 강의실명 (삭제됨)`으로 표시합니다. 원래 이름이 없으면 `삭제된 강의실`로 표시합니다.

## API

- `GET /api/admin/rooms/{roomId}/deletion-check`: 삭제 시 영향 범위를 반환합니다.
- `DELETE /api/admin/rooms/{roomId}`: 관련 예약/반복 예약을 sentinel room으로 이동한 뒤 원래 room을 삭제합니다.

sentinel room 삭제 요청은 `409 Conflict`와 `ROOM_DELETE_BLOCKED`를 반환합니다. 차단 사유 코드는 `SENTINEL_ROOM_PROTECTED`입니다.
