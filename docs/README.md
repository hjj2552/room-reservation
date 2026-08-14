# 문서 안내

문서는 현재 운영 기준을 안내합니다.

## 현재 기준 문서

- [개발자 실행과 검증](dev-setup.md): 로컬 Worker/Frontend 실행, 검사, E2E, CI
- [배포 체크리스트](deployment-checklist.md): Worker Static Assets와 Neon production 운영 기준
- [관리자 매뉴얼](admin-manual.md): 관리자 화면의 실제 운영 절차
- [공개 예약 정책](public-reservation.md): 공개 신청·수정·취소, 신청자 정보 표시와 보안 정책
- [현재 제한 사항](known-limitations.md): 미지원 기능과 운영상 주의점
- [Frontend E2E](admin-e2e.md): test-data 식별, cleanup, local/UAT 실행
- [공간 삭제 정책](room-deletion-policy.md): 공간 영구 삭제 시 연결 데이터 처리

현재 동작이나 실행 방법을 판단할 때는 위 문서를 우선합니다. 구현과 문서가 다르면 현재 `worker/`, `frontend/`, `.github/workflows/ci.yml`의 검증된 동작을 기준으로 문서를 수정합니다.
