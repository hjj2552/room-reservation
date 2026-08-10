# Deployment Checklist

Production은 하나의 public Cloudflare Worker가 React Static Assets와 `/api/*` Hono API를 함께 제공하고 Neon PostgreSQL에 연결하는 구조를 사용합니다. 실제 배포 식별자와 자격 증명은 저장소에 기록하지 않습니다.

## Worker와 Static Assets

- `frontend`에서 표준 `npm run build`로 `frontend/dist`를 생성합니다.
- Wrangler 임시 설정은 `frontend/dist`를 Static Assets directory로 정확히 해석합니다.
- `not_found_handling=single-page-application`으로 SPA deep link를 제공합니다.
- `run_worker_first`는 `/api`와 `/api/*`에만 적용합니다.
- HTML, JavaScript, CSS와 font 요청은 Worker 코드를 실행하지 않는 asset-first 경로입니다.
- Worker code, Static Assets와 bindings는 한 번의 `wrangler deploy`로 같은 Worker version에 포함됩니다.
- Vite 개발 서버의 로컬 `/api` proxy는 개발 편의를 위해 유지합니다.

Worker runtime secrets:

- `DATABASE_URL`: pooled Neon connection string
- `ADMIN_USERNAME`: 단일 관리자 username
- `ADMIN_PASSWORD`: 강한 고유 관리자 password

Worker environment configuration:

- production `APP_ENV=prod`
- production `E2E_CLEANUP_ENABLED=false`
- `INGRESS_GUARD_RATE_LIMITER`: 모든 API 요청 600/60초
- `PUBLIC_READ_RATE_LIMITER`: 비로그인 GET 120/60초
- `PUBLIC_WRITE_RATE_LIMITER`: 비로그인 non-GET 24/60초
- `workers_dev=true`, preview URL과 route/custom domain 없음

세 rate-limit namespace는 서로 다른 production 전용 positive integer ID여야 합니다. Worker는 Cloudflare edge의 `CF-Connecting-IP`만 rate-limit client IP로 사용하며 browser가 보낸 `X-Forwarded-For`와 `X-Room-Reservation-Client-IP`를 신뢰하지 않습니다. IP가 없거나 limiter binding이 실패하면 session DB 조회 전에 fail closed 합니다.

## GitHub Actions secrets

실제 값은 모두 Repository Secrets에 저장합니다.

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PRODUCTION_WORKER_NAME`
- `CLOUDFLARE_PRODUCTION_ORIGIN`
- `CLOUDFLARE_PRODUCTION_INGRESS_RATE_LIMIT_NAMESPACE_ID`
- `CLOUDFLARE_PRODUCTION_READ_RATE_LIMIT_NAMESPACE_ID`
- `CLOUDFLARE_PRODUCTION_WRITE_RATE_LIMIT_NAMESPACE_ID`
- `CLOUDFLARE_API_TOKEN`
- `NEON_MIGRATION_DATABASE_URL`
- `NEON_MIGRATION_EXPECTED_HOST`
- `NEON_MIGRATION_EXPECTED_DATABASE`
- `NEON_MIGRATION_EXPECTED_ROLE`

`CLOUDFLARE_PRODUCTION_ORIGIN`은 path, query, fragment가 없는 exact HTTPS `workers.dev` origin입니다. Pages 전용 Secret은 Static Assets 전환 검증과 별도 삭제 승인 전까지 유지합니다. 공개 가능한 식별자도 Repository Variables나 committed configuration에 실제 값을 두지 않으며 명령 인자, artifact, cache, receipt와 log에 운영 값을 출력하지 않습니다.

`NEON_MIGRATION_DATABASE_URL`은 production Neon direct connection URL이며 pooled endpoint를 사용하지 않습니다. expected host, database와 role은 연결 대상을 fail-closed로 검증합니다. schema 변경 권한이 있는 migration role과 Worker runtime role은 분리합니다.

## CI and deployment order

`main` push에서 다음 순서를 지킵니다.

1. Worker unit/contract, disposable PostgreSQL integration과 frontend production build 통과
2. combined Worker + Static Assets dry-run 및 artifact receipt 생성
3. Worker 기반 전체 Playwright E2E 통과
4. production 설정과 기존 Worker target read-only 검증
5. production Neon identity와 `worker_migrations` 정합성 검증
6. pending production migration 적용 및 schema 검증
7. combined Worker를 한 번만 배포
8. same-origin read-only smoke

Migration identity, ledger 또는 schema 검증이 실패하면 Worker를 배포하지 않습니다. pending migration이 없으면 성공적인 no-op으로 처리합니다. 자동 down migration이나 DB rollback은 수행하지 않고 forward-fix합니다.

`artifact:manifest` receipt는 Git commit, Worker bundle, Static Assets와 migrations의 SHA-256 및 안전한 크기 통계만 포함합니다. 운영 Worker 이름, hostname, account/resource/version ID는 포함하지 않습니다.

## 전환 전 검증

1. disposable Neon과 명시적으로 격리된 UAT Worker에서 combined deploy를 수행합니다.
2. `/`, `/timetable`, 공개 상세·수정과 관리자 deep link 새로고침을 확인합니다.
3. JavaScript, CSS와 Wanted Sans font를 same-origin에서 확인합니다.
4. 전체 React E2E로 관리자 login, session refresh, CSRF와 logout을 검증합니다.
5. `Secure`, `HttpOnly`, `SameSite=Lax` cookie 계약을 확인합니다.
6. INGRESS/READ/WRITE rate limit과 forged IP header 무시를 확인합니다.
7. cleanup 후 `testing-*` 잔여가 0건인지 확인합니다.
8. production 구성에서 cleanup route가 `404`인지 확인합니다.

Production 전환은 별도 승인 후 진행합니다. 새 Worker URL에서 smoke를 통과하기 전까지 기존 Pages 프로젝트를 fallback으로 유지하며, Pages 프로젝트·binding·Secret 삭제는 다시 승인받습니다.

## Handover

- Cloudflare 계정에서 `workers.dev`가 활성화되어 있는지 확인합니다.
- 기존 Worker의 `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` secret이 combined deploy 뒤에도 유지되는지 확인합니다.
- 관리자 변경 시 `ADMIN_PASSWORD`를 회전합니다.
- 운영 DB backup/restore 절차와 장애 대응 연락 경로를 Git 외부 운영 문서에 유지합니다.
