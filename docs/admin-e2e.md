# 프런트엔드 E2E

Playwright E2E는 실제 프런트엔드와 Worker HTTP 애플리케이션의 제품 계약을 검증합니다. 전역 운영 설정 충돌을 피하기 위해 `workers: 1`, `fullyParallel: false`로 실행합니다.

## 검증 범위

- 관리자 인증과 보호 경로
- 예약 목록·상세·등록·수정·승인·취소·삭제
- 감사 이력과 삭제 당시 정보
- 날짜별·공간별 시간표와 빠른 예약
- 공개 예약 신청·조회·수정·취소
- 공간 목록·수정·삭제와 공간 표시 순서
- 운영 설정, 반복 예약과 태그의 주요 흐름
- CSV 내보내기 검색 조건 전달과 건수 초과 오류
- 주요 화면의 모바일 배치와 일부 키보드·포커스 동작

내려받은 CSV 파일 내용, 공간·운영 설정의 모든 입력 조합, 전체 화면의 접근성 기준과 브라우저 조합은 아직 E2E로 완전히 검증하지 않습니다.

## 로컬 실행

다음 명령 하나가 고유 이름의 일회용 PostgreSQL 컨테이너를 만들고 Worker 기준 마이그레이션을 적용한 뒤, 사용 가능한 로컬 포트에 Worker 어댑터와 Vite를 실행하여 전체 테스트를 수행합니다.

```powershell
cd worker
npm.cmd run test:local-e2e
```

실행기는 종료 시 자신이 만든 컨테이너와 프로세스만 정확히 정리합니다. 프런트엔드 실행기인 `frontend/scripts/run-e2e.mjs`는 Worker가 이미 준비된 경우에만 직접 사용할 수 있습니다.

## GitHub Actions

`.github/workflows/ci.yml`의 `worker-frontend-e2e` 작업은 다음을 수행합니다.

- Worker와 프런트엔드 의존성 재설치
- 프런트엔드 운영 빌드와 정적 자산 결합 Worker 사전 빌드
- Playwright Chromium 설치
- 일회용 Worker PostgreSQL 기반 전체 E2E

실패 여부와 관계없이 `worker-playwright-report`와 `worker-e2e-test-results` 결과물을 7일 보관합니다.

## 환경 변수

| 환경 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `PLAYWRIGHT_BASE_URL` | `http://127.0.0.1:5173` | Playwright가 사용하는 프런트엔드 URL |
| `E2E_BACKEND_URL` | `http://127.0.0.1:8080/api/public/settings` | Worker 준비 상태 확인 주소 |
| `E2E_API_BASE_URL` | `E2E_BACKEND_URL`에서 파생 | 정리 API 기준 주소 |
| `E2E_CLEANUP_REQUIRED` | `true` | 테스트 전후 보호된 정리 필수 여부 |
| `E2E_TEST_DATA_PREFIX` | `testing-` | 정리가 허용하는 테스트 데이터 접두사 |
| `ADMIN_USERNAME` | E2E 실행기가 주입 | 정리용 관리자 계정 |
| `ADMIN_PASSWORD` | E2E 실행기가 주입 | 정리용 관리자 비밀번호 |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8080` | Vite `/api` 프록시 대상 |

## 테스트 데이터와 정리

- 모든 생성 데이터는 `frontend/tests/e2e/fixtures.ts`의 공유 팩토리를 우선 사용합니다.
- 공간은 `testing-room-*`, 예약은 `testing-reservation-*`, 반복 예약과 신청자 식별자는 `testing-*` 규칙을 사용합니다.
- 생성된 ID는 픽스처 등록부에 등록하고 종료 처리에서 ID 기반 정리를 먼저 시도합니다.
- 반복 예약 ID 정리는 그룹 DELETE API를 사용하며, 연결된 개별 예약도 같은 트랜잭션에서 정리됩니다.
- 중단된 실행의 예비 정리도 `testing-` 소유권을 증명할 수 있는 데이터와 연결 데이터만 대상으로 합니다.
- 운영 환경에는 정리 경로가 등록되지 않습니다.
- 운영 환경이 아니어도 `E2E_CLEANUP_ENABLED=true`가 명시돼야 정리 경로가 등록됩니다.
- 테스트 종료 후 미리보기 결과가 0건이 아니면 테스트가 실패합니다.

수동 정리는 반드시 미리보기를 먼저 실행합니다.

```powershell
cd frontend
npm.cmd run e2e:cleanup:preview
npm.cmd run e2e:cleanup
```

로컬 Worker에 정리 경로가 필요하면 시작 전에 명시적으로 활성화합니다.

```powershell
$env:E2E_CLEANUP_ENABLED='true'
.\start-worker.bat
```

## 원격 UAT

원격 UAT는 일회용 Neon과 별도 UAT Worker만 사용합니다. 운영 Worker 주소는 실행기가 거부합니다.

```powershell
cd worker
$env:P4_UAT_CONFIRM_DISPOSABLE='true'
$env:CLOUDFLARE_WORKER_NAME='<disposable-uat-worker-name>'
$env:CLOUDFLARE_UAT_ORIGIN='https://<disposable-uat-worker-name>.<workers-dev-subdomain>.workers.dev/'
npm.cmd run test:uat-static-assets
npm.cmd run test:uat-e2e
```

UAT에서도 운영 환경이 아닌 `APP_ENV`, 명시적인 정리 활성화, 테스트 종료 후 0건 미리보기가 모두 필요합니다.
