# Frontend E2E

Playwright E2E는 실제 프런트엔드와 Worker HTTP app의 제품 계약을 검증합니다. 전역 운영 설정 충돌을 피하기 위해 `workers: 1`, `fullyParallel: false`로 실행합니다.

## 검증 범위

- 관리자 인증과 보호 route
- 예약 목록·상세·등록·수정·승인·취소·삭제
- 감사 이력과 삭제 snapshot
- 날짜별·공간별 시간표와 빠른 예약
- 공개 예약 신청·조회·수정·취소
- 공간, 운영 설정, 반복 예약과 태그 smoke flow

CSV 내보내기와 rooms/settings 전체 CRUD matrix는 아직 E2E 범위가 아닙니다.

## 로컬 실행

다음 명령 하나가 고유 이름의 일회용 PostgreSQL container를 만들고 Worker baseline을 적용한 뒤, 사용 가능한 로컬 port에 Worker adapter와 Vite를 실행하여 전체 suite를 수행합니다.

```powershell
cd worker
npm.cmd run test:local-e2e
```

runner는 종료 시 자신이 만든 exact container와 process만 정리합니다. 프런트 runner인 `frontend/scripts/run-e2e.mjs`는 Worker가 이미 준비된 경우에만 직접 사용할 수 있습니다.

## GitHub Actions

`.github/workflows/ci.yml`의 `worker-frontend-e2e` job은 다음을 수행합니다.

- Worker와 Frontend clean dependency install
- Pages same-origin API proxy test
- Frontend production build
- Playwright Chromium 설치
- disposable Worker PostgreSQL 기반 전체 E2E

실패 여부와 관계없이 `worker-playwright-report`와 `worker-e2e-test-results` artifact를 7일 보관합니다.

## 환경 변수

| Variable | Default | Purpose |
| --- | --- | --- |
| `PLAYWRIGHT_BASE_URL` | `http://127.0.0.1:5173` | Playwright가 사용하는 Frontend URL |
| `E2E_BACKEND_URL` | `http://127.0.0.1:8080/api/public/settings` | Worker readiness probe |
| `E2E_API_BASE_URL` | `E2E_BACKEND_URL`에서 파생 | cleanup API origin |
| `E2E_CLEANUP_REQUIRED` | `true` | suite 전후 guarded cleanup 필수 여부 |
| `E2E_TEST_DATA_PREFIX` | `testing-` | cleanup이 허용하는 test-data prefix |
| `ADMIN_USERNAME` | E2E runner가 주입 | cleanup용 관리자 계정 |
| `ADMIN_PASSWORD` | E2E runner가 주입 | cleanup용 관리자 비밀번호 |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8080` | Vite `/api` proxy target |

## Test data와 cleanup

- 모든 생성 데이터는 `frontend/tests/e2e/fixtures.ts`의 공유 factory를 우선 사용합니다.
- room은 `testing-room-*`, reservation은 `testing-reservation-*`, recurrence 및 신청자 식별자는 `testing-*` 규칙을 사용합니다.
- 생성된 id는 fixture registry에 등록하고 teardown에서 id 기반 정리를 먼저 시도합니다.
- 반복 예약 id 정리는 그룹 DELETE API를 사용하며, 연결된 개별 예약도 같은 transaction에서 정리됩니다.
- interrupted run의 fallback cleanup도 `testing-` 소유권을 증명할 수 있는 row와 연결 row만 대상으로 합니다.
- production에는 cleanup route가 등록되지 않습니다.
- non-prod에서도 `E2E_CLEANUP_ENABLED=true`가 명시돼야 cleanup route가 등록됩니다.
- suite 종료 후 preview 결과가 0건이 아니면 test가 실패합니다.

수동 cleanup은 반드시 preview를 먼저 실행합니다.

```powershell
cd frontend
npm.cmd run e2e:cleanup:preview
npm.cmd run e2e:cleanup
```

로컬 Worker에 cleanup route가 필요하면 시작 전에 명시적으로 활성화합니다.

```powershell
$env:E2E_CLEANUP_ENABLED='true'
.\start-worker.bat
```

## Remote UAT

Remote UAT는 disposable Neon/Worker와 Pages preview만 사용합니다. production 형태의 Pages URL은 runner가 거부합니다.

```powershell
cd worker
$env:P4_UAT_CONFIRM_DISPOSABLE='true'
$env:P4_UAT_PAGES_URL='https://<preview-deployment>.pages.dev/'
npm.cmd run test:uat-e2e
```

UAT에서도 non-prod `APP_ENV`, explicit cleanup enable, suite 종료 후 0건 preview가 모두 필요합니다.
