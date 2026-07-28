# 문서 안내

문서는 현재 운영 기준과 서버리스 전환 당시의 검증 기록으로 구분합니다.

## 현재 기준 문서

- [개발자 실행과 검증](dev-setup.md): 로컬 Worker/Frontend 실행, 검사, E2E, CI
- [배포 체크리스트](deployment-checklist.md): Cloudflare Pages/Worker와 Neon production 운영 기준
- [관리자 매뉴얼](admin-manual.md): 관리자 화면의 실제 운영 절차
- [공개 예약 정책](public-reservation.md): 공개 신청·수정·취소와 보안 정책
- [현재 제한 사항](known-limitations.md): 미지원 기능과 운영상 주의점
- [Frontend E2E](admin-e2e.md): test-data 식별, cleanup, local/UAT 실행
- [공간 삭제 정책](room-deletion-policy.md): 공간 영구 삭제 시 연결 데이터 처리

현재 동작이나 실행 방법을 판단할 때는 위 문서를 우선합니다. 구현과 문서가 다르면 현재 `worker/`, `frontend/`, `.github/workflows/ci.yml`의 검증된 동작을 기준으로 문서를 수정합니다.

## 역사적 설계·검증 기록

아래 문서는 2026년 7월 서버리스 전환 과정의 판단 근거를 보존한 시점별 기록입니다. 문서 안의 “현재”, “미구현”, “전환 전” 표현은 각 문서의 검증일을 기준으로 하며 지금의 운영 상태를 뜻하지 않습니다.

- [서버리스 마이그레이션 계약](serverless-migration-contract.md)
- [P3 최소 기술 검증](serverless-p3-validation.md)
- [Worker + Neon 원격 검증](serverless-neon-remote-validation.md)
- [P4 구현 검증](serverless-p4-validation.md)
- [Go-Live 전 rate-limit/신뢰 경계 검증](serverless-go-live-rate-limit-validation.md)
- [D1 최소 기술 검증](serverless-d1-validation.md)
- [D1 원격 후속 검증](serverless-d1-remote-validation.md)
- [PBKDF2 100,000회 원격 재검증](serverless-d1-pbkdf2-100k-validation.md)

최종 채택은 Cloudflare Worker + Neon PostgreSQL입니다. D1과 PBKDF2 실험은 채택되지 않았으며 제품 실행 경로가 아닙니다. 검증에 사용한 `serverless-poc/`와 `serverless-d1-poc/` 소스는 최종 제품 구현 후 현재 트리에서 제거했으며, 아래 문서와 Git 이력에 당시 구조와 결과를 보존합니다.
