# Backend Testing Workflow

이 문서는 Codex 또는 개발자가 백엔드 변경 후 어떤 테스트를 우선 실행할지 정리한다.

## 전제

- Windows 기준 명령은 `backend` 디렉터리에서 실행한다.
- 통합 테스트는 PostgreSQL test DB가 필요하다.
- `postgres-test` 컨테이너가 꺼져 있으면 통합 테스트가 실패할 수 있다.

```powershell
cd C:\Users\user\Desktop\personal\research\room-reservation
docker compose up -d postgres-test
docker compose ps postgres-test
cd backend
.\gradlew.bat test
```

## 기본 규칙

- 도메인 로직, API 계약, Flyway, Security, JPA 엔티티를 수정하면 `.\gradlew.bat test`를 실행한다.
- 작은 테스트 보강이나 문서만 수정했더라도 백엔드 테스트 계약에 영향을 줄 수 있으면 `.\gradlew.bat test`를 실행한다.
- 빠른 피드백이 필요하면 관련 통합 테스트 클래스를 먼저 실행하고, 최종 확인은 전체 테스트로 닫는다.

## 변경 영역별 우선 테스트

| 변경 영역 | 우선 실행 |
| --- | --- |
| 공개 예약 등록, 충돌, 정책 | `.\gradlew.bat test --tests "*PublicReservationIntegrationTest" --tests "*ReservationConflictServiceTest" --tests "*ReservationPolicyServiceTest"` |
| 관리자 예약 목록/승인/취소 | `.\gradlew.bat test --tests "*AdminReservationIntegrationTest"` |
| 관리자 예약 등록/상세/수정 | `.\gradlew.bat test --tests "*AdminReservationWriteIntegrationTest"` |
| 반복 예약 미리보기/등록/취소 | `.\gradlew.bat test --tests "*RecurrenceIntegrationTest"` |
| 감사 이력 | `.\gradlew.bat test --tests "*ReservationHistoryIntegrationTest"` |
| CSV 내보내기 | `.\gradlew.bat test --tests "*ReservationCsvExportIntegrationTest"` |
| 강의실 운영 API | `.\gradlew.bat test --tests "*AdminRoomIntegrationTest" --tests "*PublicRoomQueryIntegrationTest"` |
| 운영 설정 API | `.\gradlew.bat test --tests "*AdminSettingsIntegrationTest"` |
| 인증/세션/Security | `.\gradlew.bat test --tests "*AdminAuthIntegrationTest"` |
| Flyway 또는 DB 제약조건 | `.\gradlew.bat test` |

## 회귀 위험이 큰 계약

- 예약 상태 enum은 `REQUESTED`(승인 대기), `CONFIRMED`(승인), `CANCELLED`(취소)로 해석한다.
- `APPROVED`는 예약 상태가 아니라 `reservation_histories.action` 값이다. 승인 처리 후 예약 상태는 `CONFIRMED`, 감사 이력 action은 `APPROVED`가 된다.
- `REQUESTED`, `CONFIRMED` 예약은 모두 충돌 대상으로 본다.
- `FAIL_ALL` 반복 예약은 일부 충돌만 있어도 반복 예약 묶음과 반복 예약 건을 만들지 않는다.
- `SKIP_CONFLICTS`는 가능한 회차만 등록하고 skipped 응답을 돌려준다.
- 반복 예약 취소는 반복 예약 묶음 soft delete, 연결 예약 `CANCELLED`, `RECURRENCE_CANCELLED` 감사 이력 저장을 함께 반영한다.
- `reservation_histories.action`은 enum 문자열로 저장하고 API에서도 같은 값으로 응답한다.
- CSV 내보내기는 Excel 호환을 위해 UTF-8 BOM을 포함하고, 시간은 KST `yyyy-MM-dd HH:mm:ss` 문자열로 내보낸다.

## Codex 작업 후 체크

1. 변경 파일의 도메인 영역을 확인한다.
2. 위 표에서 관련 테스트 클래스를 먼저 실행한다.
3. 실패하면 원인을 수정하고 같은 테스트를 다시 실행한다.
4. 최종적으로 `.\gradlew.bat test`를 실행한다.
5. 답변에는 실행한 명령, 통과 여부, 남은 리스크를 적는다.
