# Room Reservation Worker

현재 React Static Assets와 `/api/*` production API를 한 version으로 제공하는 Cloudflare Worker 구현이다.

프로젝트 전체 문서의 현재 기준과 역사적 검증 기록 구분은 [`docs/README.md`](../docs/README.md)를 따른다.

## 구조

- `src/core`: Cloudflare/Neon API를 모르는 입력·시간·오류·보안 규칙
- `src/services`: 기존 `/api` 제품 계약과 transaction orchestration
- `src/infra`: database port와 Neon HTTP/WebSocket adapter
- `src/http`: Hono route, session cookie, CSRF, 오류 응답
- `src/index.ts`: Worker composition root
- `migrations/001_worker_baseline_v1.ts`: 빈 PostgreSQL용 Worker baseline V1
- `scripts`: migration, 격리 PostgreSQL/E2E와 Static Assets 배포 도구

Hono는 HTTP 경계에서만 사용한다. 일반 query는 Neon HTTP를 사용하고, 중간 결과에 따라 다음 statement가 달라지는 transaction은 요청 범위 WebSocket `Client`로 `BEGIN`/`COMMIT`/`ROLLBACK` 후 항상 연결을 닫는다.

## 안전 기본값

- baseline의 `reservation_enabled`는 `false`다.
- production은 `APP_ENV=prod`, `E2E_CLEANUP_ENABLED=false`다.
- cleanup route는 production app에 등록되지 않는다.
- non-prod에서도 `E2E_CLEANUP_ENABLED=true`가 명시돼야 route가 등록된다.
- cleanup 대상은 `testing-` 식별자를 증명할 수 있는 row뿐이다.
- 실제 connection string과 관리자 자격 증명은 Wrangler secret으로만 주입한다.

## 로컬 검증

일반 로컬 개발은 저장소 루트의 `.env`에 로컬 DB 및 관리자 값을 설정한 뒤 다음처럼 시작한다. 이 명령은 `room_reservation_worker` database를 로컬 PostgreSQL 안에 자동 생성하고 Worker migration을 적용한다. Cloudflare binding 대신 로컬 PostgreSQL/allow-all rate-limit adapter를 사용해 `http://127.0.0.1:8080`에서 서버를 열며, DB URL은 안전상 loopback 주소만 허용한다.

```powershell
cd <repo>
.\start-worker.bat
```

Docker를 별도로 실행 중이라면 `worker` 디렉터리에서 `npm.cmd run dev`만 실행할 수도 있다. 프런트엔드는 기존 `start-frontend.bat`을 사용하며 `/api`를 이 로컬 Worker로 프록시한다.

전체 검증 명령은 다음과 같다.

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
$env:P4_UAT_DATABASE='<uat-database-name>'
$env:P4_UAT_ROLE='<expected-disposable-branch-role>'
npm.cmd run uat:prepare
```

먼저 `frontend`에서 표준 Vite production build를 생성한다. Worker 배포 이름과 Cloudflare Rate Limiting namespace ID는 저장소에 넣지 않는다. 대상 환경에 맞는 값을 현재 shell에만 주입한 뒤 환경별 wrapper를 사용한다. 값이 없거나 양의 정수 형식이 아니거나 namespace가 중복되면 Wrangler 실행 전에 실패한다.

```powershell
cd ..\frontend
npm.cmd run build
cd ..\worker
$env:CLOUDFLARE_WORKER_NAME='<worker-name>'
$env:CLOUDFLARE_INGRESS_RATE_LIMIT_NAMESPACE_ID='<ingress-rate-limit-namespace-id>'
$env:CLOUDFLARE_READ_RATE_LIMIT_NAMESPACE_ID='<read-rate-limit-namespace-id>'
$env:CLOUDFLARE_WRITE_RATE_LIMIT_NAMESPACE_ID='<write-rate-limit-namespace-id>'
npm.cmd run deploy:uat
```

UAT Worker는 `workers_dev=true`, `preview_urls=false`, route/custom domain 없음으로 배포한다. `frontend/dist`, Worker code와 bindings는 한 version으로 배포된다. SPA fallback을 사용하며 `/api`와 `/api/*`만 Worker code를 먼저 실행한다. HTML, JavaScript, CSS와 font는 asset-first 경로다. Production Worker와 기존 Pages는 UAT 중 변경하지 않는다.

UAT Worker에는 환경변수로 전달한 다음 세 namespace만 연결된다.

- `INGRESS_GUARD_RATE_LIMITER`: `<ingress-rate-limit-namespace-id>`, 모든 `/api/**` 600/60초
- `PUBLIC_READ_RATE_LIMITER`: `<read-rate-limit-namespace-id>`, 120/60초
- `PUBLIC_WRITE_RATE_LIMITER`: `<write-rate-limit-namespace-id>`, 24/60초

production namespace 값은 별도 운영 환경변수로만 관리하며 UAT에서 호출하지 않는다. INGRESS는 인증 여부와 무관하게 세션 DB 조회 전에 적용하고, 인증 관리자는 그 뒤의 READ/WRITE만 우회한다. `ROOM-SESSION`은 43자 padding 없는 base64url 형식일 때만 DB 조회 후보로 인정한다. 실제 Cloudflare 제한은 위치별 eventually consistent이므로 원격 검증은 정확한 601/121/25번째가 아니라 burst에서 429가 발생하고 60초 후 복구되는지를 확인한다. exact 경계와 내부 호출 0회는 deterministic unit test가 담당한다.

전체 원격 E2E는 exact disposable Worker origin과 이중 확인 flag를 모두 요구한다.

```powershell
$env:P4_UAT_CONFIRM_DISPOSABLE='true'
$env:CLOUDFLARE_WORKER_NAME='<disposable-uat-worker-name>'
$env:CLOUDFLARE_UAT_ORIGIN='https://<disposable-uat-worker-name>.<workers-dev-subdomain>.workers.dev/'
npm.cmd run test:uat-static-assets
npm.cmd run test:uat-e2e
```

script는 입력 origin의 첫 label이 exact UAT Worker 이름과 일치하는 HTTPS `workers.dev` URL만 허용한다. 테스트 종료 후 cleanup preview가 0건이어야 하며, 배포 정리는 exact disposable Worker와 Neon 대상만 수행한다.
