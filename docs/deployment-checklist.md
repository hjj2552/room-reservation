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

세 요청 제한 네임스페이스는 서로 다른 운영 전용 양의 정수 ID여야 합니다. Worker는 Cloudflare 엣지의 `CF-Connecting-IP`만 요청 제한용 클라이언트 IP로 사용하며 브라우저가 보낸 `X-Forwarded-For`와 `X-Room-Reservation-Client-IP`를 신뢰하지 않습니다. IP가 없거나 제한기 바인딩이 실패하면 세션 DB 조회 전에 요청을 거부합니다.

API 요청은 신뢰 IP 확인 → INGRESS 제한 → 유효한 session 조회 → 비관리자 READ/WRITE 제한 → CSRF 검증 → body와 제품 처리 순서로 진행합니다.

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

`CLOUDFLARE_PRODUCTION_ORIGIN`은 path, query, fragment가 없는 exact HTTPS `workers.dev` origin입니다. Pages 전용 Secret은 Static Assets 전환 검증과 별도 삭제 승인 전까지 유지합니다. 공개 가능한 식별자도 Repository Variables나 committed configuration에 실제 값을 두지 않으며 명령 인자, build output, cache와 log에 운영 값을 출력하지 않습니다.

`NEON_MIGRATION_DATABASE_URL`은 production Neon direct connection URL이며 pooled endpoint를 사용하지 않습니다. expected host, database와 role은 연결 대상을 fail-closed로 검증합니다. schema 변경 권한이 있는 migration role과 Worker runtime role은 분리합니다.

## CI and deployment order

`main` push에서 다음 순서를 지킵니다.

1. Worker 단위·계약 테스트, 일회용 PostgreSQL 통합 테스트와 프런트엔드 운영 빌드 통과
2. combined Worker + Static Assets dry-run
3. Worker 기반 전체 Playwright E2E 통과
4. production 설정과 기존 Worker target read-only 검증
5. production Neon identity와 `worker_migrations` 정합성 검증
6. pending production migration 적용 및 schema 검증
7. combined Worker를 한 번만 배포
8. same-origin read-only smoke

Migration identity, ledger 또는 schema 검증이 실패하면 Worker를 배포하지 않습니다. pending migration이 없으면 성공적인 no-op으로 처리합니다. 자동 down migration이나 DB rollback은 수행하지 않고 forward-fix합니다.

GitHub Actions가 checkout한 immutable event commit SHA를 배포 소스 식별자로 사용하고, `npm ci`와 committed lockfile을 의존성 기준으로 사용합니다. 실제 배포 결과는 Cloudflare의 Worker version과 deployment 기록에서 확인하되 실제 운영 식별자는 Git이나 Actions log에 출력하지 않습니다.

## V9 삭제 공간 보관 예약 중복 제약

- `009_deleted_room_storage_overlap_v9`를 새 Worker 코드보다 먼저 적용합니다. 새 중복 조회는 `reservations.room_system_reserved`를 사용합니다. 운영 DB 적용은 승인된 기존 배포 절차에서만 수행합니다.
- 기존 `rooms.system_reserved`를 예약 행에 반영합니다. 공간 변경 시 트리거가 값을 갱신하고, `(room_id, room_system_reserved)` 복합 외래 키가 실제 공간 정보와의 불일치를 차단합니다. 공간 식별값 변경도 `ON UPDATE CASCADE`로 반영됩니다. UUID나 `original_room_name`은 제외 기준으로 사용하지 않습니다.
- 기존 예약의 상태·시간·공간 이름, 반복 예약 연결, 감사 이력은 변경하지 않습니다. 실제 공간의 활성 예약은 기존 GiST exclusion constraint로 동시 중복 요청까지 차단하며, 보관용 공간의 예약만 제외합니다.
- 마이그레이션은 한 트랜잭션에서 `rooms`, `reservations`에 `ACCESS EXCLUSIVE` 잠금을 잡습니다. 기존 행 반영, 복합 외래 키 검증, GiST 인덱스 재생성 동안 해당 테이블의 조회·쓰기가 대기합니다. 트래픽이 적은 유지보수 시간에 적용하고, 장기 트랜잭션과 데이터 규모에 따른 잠금 대기·실행 시간을 사전에 확인합니다. 예약 수에 따른 운영 소요 시간은 로컬 기능 테스트로 추정하지 않습니다.
- 보관용 공간에 겹치는 활성 예약이 생긴 뒤에는 이전 제약으로 되돌릴 수 없습니다. down migration은 이 경우 트랜잭션 전체가 실패하며 예약을 삭제하거나 취소하지 않습니다. 자동 rollback 대신 forward-fix 원칙을 따릅니다.

## 운영 배포 전 검증

1. 일회용 Neon과 명시적으로 격리된 UAT Worker에서 정적 자산 결합 배포를 수행합니다.
2. `/`, `/timetable`, 공개 상세·수정과 관리자 deep link 새로고침을 확인합니다.
3. JavaScript, CSS와 Wanted Sans 글꼴을 동일 출처에서 확인합니다.
4. 전체 React E2E로 관리자 로그인, 세션 갱신, CSRF와 로그아웃을 검증합니다.
5. `Secure`, `HttpOnly`, `SameSite=Lax` 쿠키 계약을 확인합니다.
6. INGRESS/READ/WRITE 요청 제한과 위조 IP 헤더 무시를 확인합니다.
7. 정리 후 `testing-*` 잔여가 0건인지 확인합니다.
8. 운영 구성에서 정리 경로가 `404`인지 확인합니다.

현재 배포 구조는 프런트엔드 정적 자산과 `/api/*`를 하나의 운영 Worker 버전으로 배포하는 방식입니다. 운영 배포와 실제 서비스 주소 전환은 별도 승인 후 진행합니다.

## 롤백 확인

운영 배포 전에 다음 조건을 모두 만족해야 합니다.

1. 현재 운영 Worker의 안정 버전과 배포를 Git 외부 운영 기록에 식별합니다. 실제 버전 ID는 저장소와 Actions 로그에 기록하지 않습니다.
2. 해당 버전이 Cloudflare Deployments 화면에서 롤백 대상으로 선택 가능한지 확인합니다. Worker 버전에는 코드, 정적 자산, 바인딩과 호환성 설정이 함께 보존됩니다.
3. 격리된 UAT Worker에서 새 버전 배포 후 직전 버전 롤백을 연습하고, 롤백 뒤 API·세션·CSRF·요청 제한과 정적 진입점이 복구되는지 확인합니다.
4. 사전 검사에서 적용 대기 중인 마이그레이션이 없거나 이전 Worker와 호환됨을 확인합니다. 호환되지 않는 DB 변경이 있으면 자동 DB 롤백을 시도하지 않고 배포를 중단합니다.

운영 장애 시 Cloudflare 대시보드의 **Workers & Pages → 운영 Worker → Deployments**에서 사전에 확인한 안정 버전의 **Rollback**을 실행합니다. 이 작업은 해당 버전을 전체 트래픽에 즉시 배포합니다. 롤백 뒤 Worker 직접 주소와 실제 운영 주소에서 `/`, `/timetable`, `/api/public/settings`, 공개 공간 조회, 미인증 관리자 `401`, 관리자 세션·CSRF·로그아웃을 확인합니다. 실패하면 데이터베이스를 되돌리지 않고 접근을 제한한 뒤 수정 버전을 배포합니다. Cloudflare는 최근 100개 버전까지만 롤백 대상으로 유지하므로 배포 전 대상 존재 확인을 생략하지 않습니다. 세부 동작은 [Cloudflare Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)를 기준으로 합니다.

이전에 사용하던 Pages 프로젝트가 아직 남아 있다면 별도 폐기 승인 전까지 보존할 수 있습니다. 다만 Pages의 `API_BACKEND`도 현재 Worker를 호출하므로 Pages 주소는 이전 API로 돌아가는 롤백 수단이 아닙니다. Pages 프로젝트·바인딩·Secret 삭제는 실제 보존 여부를 확인하고 별도로 승인받습니다.

## Handover

- Cloudflare 계정에서 `workers.dev`가 활성화되어 있는지 확인합니다.
- 기존 Worker의 `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` secret이 combined deploy 뒤에도 유지되는지 확인합니다.
- 관리자 변경 시 `ADMIN_PASSWORD`를 회전합니다.
- 운영 DB backup/restore 절차와 장애 대응 연락 경로를 Git 외부 운영 문서에 유지합니다.
