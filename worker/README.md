# Room Reservation Worker

P4의 Cloudflare Worker 구현이다. 기존 Spring Boot는 이 디렉터리와 독립적으로 유지되며, 이 Worker를 production에 연결하는 작업은 별도 전환 단계다.

## 구조

- `src/core`: Cloudflare/Neon API를 모르는 입력·시간·오류·보안 규칙
- `src/services`: 기존 `/api` 제품 계약과 transaction orchestration
- `src/infra`: database port와 Neon HTTP/WebSocket adapter
- `src/http`: Hono route, session cookie, CSRF, 오류 응답
- `src/index.ts`: Worker composition root
- `migrations/001_worker_baseline_v1.ts`: 빈 PostgreSQL용 Worker baseline V1
- `scripts`: migration, 격리 PostgreSQL/E2E, artifact provenance 도구

Hono는 HTTP 경계에서만 사용한다. 일반 query는 Neon HTTP를 사용하고, 중간 결과에 따라 다음 statement가 달라지는 transaction은 요청 범위 WebSocket `Client`로 `BEGIN`/`COMMIT`/`ROLLBACK` 후 항상 연결을 닫는다.

## 안전 기본값

- baseline의 `reservation_enabled`는 `false`다.
- production은 `APP_ENV=prod`, `E2E_CLEANUP_ENABLED=false`다.
- cleanup route는 production app에 등록되지 않는다.
- non-prod에서도 `E2E_CLEANUP_ENABLED=true`가 명시돼야 route가 등록된다.
- cleanup 대상은 `testing-` 식별자를 증명할 수 있는 row뿐이다.
- 실제 connection string과 관리자 자격 증명은 Wrangler secret으로만 주입한다.

## 로컬 검증

```powershell
cd worker
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd test
npm.cmd run test:isolated-postgres
npm.cmd run test:local-e2e
npm.cmd run build
```

`test:isolated-postgres`와 `test:local-e2e`는 고유 이름의 일회용 PostgreSQL container를 만들고 `finally`에서 exact container만 중지한다. 전체 E2E는 일회용 DB에서만 예약 접수를 활성화하고, suite 전후 `testing-` cleanup과 최종 0건 preview를 요구한다.

## Disposable UAT 절차

운영 Neon DB나 현재 schema를 대신 사용하지 않는다. 별도의 Neon branch 안에 빈 database와 전용 role을 만들고 다음을 구분한다.

- migration: direct connection string을 현재 shell의 `DATABASE_URL`에만 주입하고 `npm.cmd run migrate`
- Worker runtime: pooled connection string을 `wrangler secret put DATABASE_URL --env uat`로 주입
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`도 UAT 전용 값을 Wrangler secret으로 주입

baseline 적용 후 disposable UAT DB에서만 이중 guard가 있는 준비 명령으로 공개 접수를 활성화한다. 이 명령은 예상 database 이름, owner role과 제품 row 0건을 먼저 확인한다.

```powershell
$env:APP_ENV='uat'
$env:P4_UAT_CONFIRM_DISPOSABLE='true'
$env:P4_UAT_DATABASE='room_reservation_p4_uat_YYYYMMDD'
$env:P4_UAT_ROLE='<expected-disposable-branch-role>'
npm.cmd run uat:prepare
```

UAT Worker는 `workers_dev=false`, `preview_urls=false`, route/custom domain 없음으로 배포하고 공개 URL을 만들지 않는다. Pages는 기존 프로젝트의 새 preview deployment만 만들고 `API_BACKEND` Service Binding을 exact UAT Worker에 연결한다. `API_PROXY_TRANSPORT=service-binding`을 명시하며 `BACKEND_ORIGIN` fallback을 사용하지 않는다. 배포 전 project-level preview 설정을 snapshot하고 테스트 후 정확히 복원한 뒤 production과 preview 설정을 모두 재확인한다. production Pages 변수·deployment·domain은 변경하지 않는다.

UAT Worker에는 다음 여섯 namespace 중 UAT 세 개만 연결된다.

- `INGRESS_GUARD_RATE_LIMITER`: namespace `2026072305`, 모든 `/api/**` 600/60초
- `PUBLIC_READ_RATE_LIMITER`: namespace `2026072301`, 120/60초
- `PUBLIC_WRITE_RATE_LIMITER`: namespace `2026072302`, 24/60초

production namespace `2026072306`, `2026072303`, `2026072304`는 UAT에서 호출하지 않는다. INGRESS는 인증 여부와 무관하게 세션 DB 조회 전에 적용하고, 인증 관리자는 그 뒤의 READ/WRITE만 우회한다. `ROOM-SESSION`은 43자 padding 없는 base64url 형식일 때만 DB 조회 후보로 인정한다. 실제 Cloudflare 제한은 위치별 eventually consistent이므로 원격 검증은 정확한 601/121/25번째가 아니라 burst에서 429가 발생하고 60초 후 복구되는지를 확인한다. exact 경계와 내부 호출 0회는 deterministic unit test가 담당한다.

전체 원격 E2E는 preview URL과 이중 확인 flag를 모두 요구한다.

```powershell
$env:P4_UAT_CONFIRM_DISPOSABLE='true'
$env:P4_UAT_PAGES_URL='https://<preview>.<project>.pages.dev/'
npm.cmd run test:uat-e2e
```

script는 production 형태의 `<project>.pages.dev` URL을 거부한다. 테스트는 Pages preview → `API_BACKEND` Service Binding → UAT Worker 경로만 사용하며 공개 Worker URL을 사용하지 않는다. 테스트 종료 후 cleanup preview가 0건이어야 하며, 배포 정리는 exact Worker/Pages deployment와 disposable Neon 대상만 수행한다.

## Artifact와 baseline 동일성

최종 commit에서 `npm.cmd run build` 후 아래 receipt를 생성한다.

```powershell
npm.cmd run artifact:manifest
```

receipt의 `gitCommit`, Worker bundle SHA-256, baseline migration SHA-256, 결합 candidate SHA-256을 배포 기록에 함께 보관한다. receipt는 build 결과이므로 Git에 커밋하지 않는다. 실제 배포 직전 같은 commit에서 다시 생성하고 UAT에서 검증한 receipt와 일치할 때만 별도 Go-Live 작업의 후보로 사용한다.
