# 서버리스 마이그레이션 P3 최소 기술 검증 결과

검증일: 2026-07-20

대상 브랜치: `codex/serverless-migration-contract`

시작 커밋: `45b99018f806faebbc810c8876c2b3644e007e3c`

범위: `docs/serverless-migration-contract.md` 21절의 P3 기술 선택 검증만 수행했다. 이 문서의 `serverless-poc`은 P4 제품 백엔드나 Worker baseline V1이 아니다. 기존 Spring Boot, React, Render 설정, 현재 Neon schema와 운영 전 데이터는 변경하지 않았다.

## 1. 결론

현재 계약은 Cloudflare Workers + TypeScript + Neon PostgreSQL로 구현 가능하다. P4 구현을 시작할 수 있다. 다만 실제 Cloudflare/Neon 자격 증명을 사용하지 않은 로컬 최소 검증이므로 다음 세 가지는 P4 초기에 격리된 폐기 가능 Neon branch와 Cloudflare UAT에서 닫아야 하는 배포 전 gate다.

1. Neon branch에서 `btree_gist` 설치, HTTP 쿼리, WebSocket 또는 batch transaction을 실제로 왕복 검증한다.
2. Pages custom domain의 `/api/*` Worker route와 `CF-Connecting-IP`를 UAT에서 검증한다.
3. PBKDF2-HMAC-SHA256 600,000회의 실제 Workers Free CPU 사용량을 원격 관측한다. 10 ms를 지속적으로 초과하면 보안 강도를 낮추지 말고 비밀번호 해싱을 PostgreSQL `pgcrypto` bcrypt로 옮기거나 Workers Paid를 선택한다.

이 세 항목은 현재 계약을 불가능하게 만드는 blocker는 아니지만, 무료 운영과 실제 배포 구성을 확정하는 blocker다. 실제 Spring/Neon 초기화, production route 변경, Render 중지는 수행하지 않았다.

## 2. 검증용 PoC 구조

```text
serverless-poc/
├─ src/
│  ├─ core/                 # Cloudflare, Hono, Neon 타입을 모르는 포트와 실행 환경 판정
│  ├─ http/                 # Hono route, cookie/CSRF, CF client IP 변환
│  ├─ security/             # Web Crypto 기반 토큰·비밀번호 해싱
│  ├─ infra/                # Neon HTTP repository 어댑터
│  └─ index.ts              # raw Fetch 형태의 Worker 진입점
├─ migrations/              # node-pg-migrate TypeScript PoC migration
├─ tests/worker/            # workerd/Miniflare에서 실행되는 테스트
├─ tests/postgres/          # 격리된 PostgreSQL 17 통합·경쟁 테스트
└─ scripts/                 # 일회용 DB와 artifact identity 검증
```

핵심 포트에는 `Request`, `Response`, Hono context, Cloudflare `env`, Neon SDK 타입이 없다. `src/index.ts`만 Worker `fetch(request, env)`를 받고 Hono 앱과 Neon 어댑터를 조립한다. 이 경계는 계약서 4절과 일치한다.

PoC migration은 충돌·세션·rate limit·transaction 검증에 필요한 `p3_poc_*` 테이블만 만든다. 전체 예약 API, 반복 예약, 감사 이력, 운영 설정 또는 신규 제품 baseline V1은 구현하지 않았다.

## 3. 자동화 검증 결과

| 검증 항목 | 자동화 근거 | 결과 |
|---|---|---|
| Worker HTTP 구조 | Cloudflare Vitest pool(workerd)에서 Hono route 실행 | 성공 |
| Neon Worker 호환성 | workerd 안에서 `@neondatabase/serverless` HTTP driver가 parameterized query를 실제 fetch로 직렬화 | 성공 |
| Worker bundle | Wrangler 4.112.0 dry-run | 성공, 273.33 KiB / gzip 71.56 KiB |
| transaction | PostgreSQL 17에서 commit 후 row 존재, rollback 후 row 부재 | 성공 |
| 예약 충돌 | 같은 공간·겹치는 시간으로 8개 동시 INSERT | 1개 성공, 7개 SQLSTATE `23P01` 실패 |
| 취소 예약 | partial exclusion constraint에서 `CANCELLED` overlap | 성공 |
| 세션·CSRF | session cookie와 `XSRF-TOKEN`/`X-XSRF-TOKEN`, session-bound token 검증 | 성공 |
| 비밀번호 해싱 | workerd Web Crypto PBKDF2 생성·성공 검증·오류 검증 | 성공 |
| 분산 rate limit | PostgreSQL 원자 UPSERT에 동시 요청 | read 120, write 24에서 정확히 차단 |
| cleanup 이중 보호 | `uat+true`만 204, `uat+false`와 `prod+true`는 404 | 성공 |
| 빈 DB baseline 재현 | 서로 다른 빈 PostgreSQL DB에 migration 적용 후 schema-only 비교 | 성공, SHA-256 `dc1202b9b008379d694dbd7ba961d77263cb71a6cab85ceb1b21424bda6f1ef6` |
| 기존 Pages proxy 회귀 | 기존 Node test 9개 | 성공 |
| 기존 React production build | TypeScript 검사와 Vite build | 성공 |

격리 DB 스크립트는 임의 이름의 `postgres:17-alpine` 컨테이너와 두 개의 빈 DB만 사용하고 `finally`에서 그 컨테이너를 중지한다. 고정된 현재 Neon/Render URL을 읽거나 사용하지 않는다.

실행 명령과 결과:

```text
cd serverless-poc
npm ci
npm run check
# 성공

npm test
# 5 files, 9 tests passed

npm run test:isolated-postgres
# 1 file, 5 tests passed
# isolated_postgres=passed
# schema_sha256=dc1202b9b008379d694dbd7ba961d77263cb71a6cab85ceb1b21424bda6f1ef6

npm run build
# Wrangler dry-run 성공
# Total Upload 273.33 KiB / gzip 71.56 KiB

cd ../frontend
npm run test:functions
# 9 tests passed

npm run build
# TypeScript 및 Vite production build 성공
```

## 4. P4에 적용할 기술 결정

### HTTP와 도메인 경계

- Hono를 사용한다. 사용 범위는 route 등록, middleware, request parsing, response/cookie 생성, 오류의 HTTP 변환뿐이다.
- Worker 진입점은 표준 module Worker의 raw `fetch(request, env)`로 유지한다.
- 서비스와 도메인은 Hono context나 Worker binding을 받지 않고 포트에만 의존한다.
- Hono를 제외하고 raw Fetch만 사용하는 대안은 의존성은 더 적지만 route/middleware/오류 변환을 반복 구현하게 된다. Hono 전체 context를 서비스에 전달하는 대안은 계약의 Cloudflare 격리 원칙을 위반하므로 제외한다.

Hono는 공식 Cloudflare Workers 예제와 Workers test 구성을 제공한다. [Hono Cloudflare Workers 가이드](https://hono.dev/docs/getting-started/cloudflare-workers), [Cloudflare Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)

### Neon 연결과 query 계층

- `@neondatabase/serverless`를 선택한다.
- 일반 단건 쿼리는 `neon()`의 HTTP fetch와 tagged template parameter binding을 쓴다.
- 미리 결정된 여러 statement는 HTTP `sql.transaction([...])`을 사용한다.
- 쿼리 중간 결과로 다음 쿼리를 결정해야 하는 interactive transaction만 `Client` WebSocket을 요청 안에서 생성하고 `BEGIN`/`COMMIT`/`ROLLBACK`, `finally client.end()`로 닫는다. 전역 `Client`/`Pool`을 재사용하지 않는다.
- HTTP transport와 interactive transport 모두 repository/unit-of-work 어댑터 뒤에 둔다. 도메인은 transport를 모른다.
- runtime ORM/query builder는 도입하지 않고 repository의 parameterized SQL을 사용한다. 충돌 constraint, 부분 조건, CTE, 감사 원자 기록처럼 PostgreSQL 의미가 핵심이어서 추상 ORM보다 SQL이 명확하다. P4에서 schema 타입 생성은 별도로 할 수 있으나 query semantics를 숨기지 않는다.

Neon 공식 드라이버는 HTTP query, 비대화형 transaction, 요청 범위 WebSocket `Client`를 구분하며 Workers에서 연결을 요청 밖에 유지하지 말라고 명시한다. [Neon serverless driver 공식 저장소](https://github.com/neondatabase/serverless#sessions-transactions-and-node-postgres-compatibility)

오류는 infra에서 SQLSTATE로 분류한다. 최소한 `23P01`은 기존 예약 충돌 오류로, `23505`는 자원별 중복 오류로, `40001`/`40P01`은 제한된 retry 대상 또는 일반 서버 오류로 변환한다. SQL 메시지와 DB URL은 외부 응답에 노출하지 않는다.

### transaction과 동시 예약 충돌

- 예약의 최종 중복 방지는 `btree_gist`와 다음 partial exclusion constraint로 한다.

```sql
EXCLUDE USING gist (
  room_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
) WHERE (status IN ('REQUESTED', 'CONFIRMED'))
```

- `CANCELLED`는 constraint 대상에서 빠진다. 반열린 구간 `[)`이므로 앞 예약 종료와 다음 예약 시작이 같은 것은 충돌하지 않는다.
- 애플리케이션 사전 조회는 친절한 오류를 위한 최적화일 뿐 정합성 근거가 아니다.
- 예약과 감사 이력을 함께 기록하는 동작은 같은 transaction에 넣는다.
- `SKIP_CONFLICTS` 반복 예약은 각 후보의 `23P01`을 분리해 수집하고, `FAIL_ALL`은 전체 transaction을 rollback한다. 이 전체 반복 예약 구현은 P4 범위다.

PostgreSQL은 range와 exclusion constraint를 공식적으로 비겹침 보장 용도로 설명하고 `btree_gist`로 방 식별자와 range를 함께 제약하는 예제를 제공한다. [PostgreSQL range constraint 문서](https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT)

### TypeScript migration과 빈 DB 재현

- `node-pg-migrate`를 선택한다. migration을 TypeScript로 작성하고 Node 기반 배포/CI 단계에서 실행한다. Worker request가 migration을 실행하지 않는다.
- production 시작 전 V1은 하나의 immutable baseline migration으로 고정한다. 운영 시작 뒤에는 V2 이상의 forward migration만 추가한다.
- `push`나 schema 자동 동기화는 사용하지 않는다. migration source를 review하고 빈 DB 적용을 CI에서 검증한다.
- Drizzle Kit도 검토했으나 runtime ORM을 선택하지 않았고, 핵심 constraint가 명시적 PostgreSQL SQL이므로 별도 schema DSL을 진실의 원천으로 하나 더 두지 않기로 했다. Flyway는 Spring 폐기 대상이어서 제외한다.
- P4 baseline V1은 이 PoC migration을 확장하지 않고 제품 요구를 다시 작성한다. PoC table과 `p3_poc_*` 이름은 폐기한다.

재현 절차는 새 disposable DB 생성 → V1 단독 적용 → 재적용 시 no-op 확인 → 두 번째 빈 DB에 적용 → `pg_dump --schema-only --no-owner --no-privileges` 정규화 hash 비교 순서다.

### 관리자 session과 CSRF

- session은 Neon PostgreSQL table에 저장한다. cookie에는 CSPRNG 256-bit opaque id만 두고 DB에는 id의 SHA-256 digest, CSRF digest, 만료 시각, 감사에 필요한 최소 metadata만 둔다.
- session cookie는 `Secure; HttpOnly; SameSite=Lax; Path=/`다. 이름은 프런트가 의존하지 않으므로 P4에서 확정할 수 있다.
- 로그인·요청 시 만료를 확인하고 로그아웃은 session row를 삭제한다. 만료 index와 주기적/표본 cleanup을 둔다.
- KV는 계약 범위에서 제외되어 있고, isolate memory는 새로고침·isolate 교체·다중 위치를 견디지 못하므로 제외한다. JWT-only session은 즉시 logout/revoke 요구를 복잡하게 만들어 제외한다.

CSRF는 session-bound synchronizer token으로 구현한다.

1. 서버가 무작위 token을 `XSRF-TOKEN` cookie에 `Secure; HttpOnly=false; SameSite=Lax; Path=/`로 보낸다.
2. 기존 React가 같은 값을 `X-XSRF-TOKEN` header로 보낸다.
3. 쓰기 요청에서 cookie와 header를 비교하고, 그 digest가 현재 session row에 저장된 digest와 같은지 다시 확인한다.
4. Origin/Fetch-Metadata 검사는 방어 심화로 추가할 수 있지만 기존 cookie/header 계약을 대체하지 않는다.

### 공개 예약 비밀번호

- 기본 선택은 Workers Web Crypto의 PBKDF2-HMAC-SHA256, unique 128-bit salt, 600,000 iterations, 256-bit output, versioned encoded format이다.
- 평문이나 fast SHA-256은 저장하지 않는다. 검증은 constant-time 비교를 사용한다.
- Argon2id WASM은 Workers Free의 128 MB memory와 10 ms CPU risk, bundle 복잡성 때문에 이번 선택에서 제외했다. 순수 JS bcrypt도 CPU risk와 구현 품질 때문에 제외했다.
- OWASP의 현재 권고는 PBKDF2-HMAC-SHA256 600,000회이며 Cloudflare Web Crypto는 PBKDF2 `deriveBits`를 지원한다. [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2), [Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)

로컬 workerd 실행 성공은 Cloudflare billing CPU가 10 ms 안이라는 뜻이 아니다. 원격 UAT telemetry에서 초과가 확인되면 iteration을 임의로 낮추지 않는다. Neon에서 지원되는 `pgcrypto` bcrypt로 adapter를 교체하는 방안과 Workers Paid를 비교한다. Neon은 `pgcrypto`를 지원하며 bcrypt 사용 예를 공개한다. [Neon pgcrypto 설명](https://neon.com/blog/ten-most-popular-postgres-extensions#pgcrypto)

### rate limit과 client IP

- 기존 수치인 IP별 read 120/min, write 24/min을 유지한다.
- Neon table의 `(scope, hashed_ip, window_start)` row를 `INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit RETURNING`으로 원자 증가시킨다.
- IP는 Worker secret pepper를 포함해 digest한 값을 key로 저장한다. 평문 IP를 장기 보관하지 않는다.
- 허용 실패 시 429, `RATE_LIMIT_EXCEEDED`, `Retry-After`와 다음 retry 시각을 반환한다.
- 인증된 관리자 session 확인 뒤에는 기존 계약대로 이 limiter를 우회한다.
- 오래된 bucket은 짧은 보존 기간 후 제한된 batch로 삭제한다. cleanup은 E2E cleanup route와 분리한다.

Cloudflare Rate Limiting binding은 빠르지만 counter가 Cloudflare location별이고 eventually consistent이며 정확한 accounting 용도가 아니라고 공식 문서가 명시한다. 따라서 현 계약의 전역 exact limit 근거로 사용하지 않는다. [Workers Rate Limiting API의 locality와 accuracy](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/#locality)

클라이언트 IP 어댑터는 production에서 `CF-Connecting-IP`만 읽고 임의 `X-Forwarded-For`를 신뢰하지 않는다. local/test에서만 명시적인 test header를 허용한다. Cloudflare는 origin이 원래 방문자 IP를 읽을 때 `CF-Connecting-IP`를 권고한다. [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip)

### Pages, Worker route와 same-origin

- 1차 전환의 우선 선택은 기존 Pages custom hostname의 `https://<host>/api/*`를 Worker route에 직접 연결하는 것이다. React의 `/api`와 credentials 동작은 바꾸지 않고 정적 경로는 Pages가 계속 제공한다.
- 이 방식은 API 요청당 Worker 한 번만 실행하고 Worker가 직접 `CF-Connecting-IP`를 받는다.
- 현재 Pages Function proxy는 실제 UAT route가 준비될 때까지 fallback으로 유지한다. P3에서 삭제하지 않는다.
- Pages Function proxy를 계속 쓰면 API 요청이 Pages Function과 backend Worker를 연속 호출하고, IP 전달 신뢰 경계를 별도로 인증해야 한다. 또한 Pages Functions도 Workers 사용량에 포함된다. 이 때문에 최종 1차 구성으로는 제외한다.
- Worker custom domain은 host 전체를 Worker origin으로 삼으므로 현재 Pages 정적 host와 `/api`만 분리하는 첫 단계에는 맞지 않는다. Workers Static Assets 통합은 계약대로 후속 작업이다.

Cloudflare는 route가 URL pattern에 맞는 요청에서 Worker를 실행한다고 설명한다. 실제 Pages custom domain과의 route 우선순위는 UAT에서 확인한다. [Workers routes](https://developers.cloudflare.com/workers/configuration/routing/routes/), [Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/)

### 실행 환경과 cleanup 보호

- `APP_ENV`는 `local | test | e2e | uat | prod` exact enum이다. `production`, 빈 값, 알 수 없는 값은 시작 오류다.
- Cloudflare Worker deployment는 최소 `uat`와 `production`을 별도 이름으로 둔다. `prod`는 시간적 상태나 branch 이름에서 추론하지 않고 명시적 variable로만 식별한다.
- `E2E_CLEANUP_ENABLED`는 문자열 `true`/`false`만 허용하며 기본값은 `false`다.
- 앱 생성 시 `APP_ENV !== prod && E2E_CLEANUP_ENABLED === true`일 때만 cleanup route를 등록한다. handler 내부에서 거부하는 방식이 아니다.
- `prod + true`도 route가 등록되지 않아 404다. non-prod + false도 404다.
- 실제 cleanup은 `testing-*`와 등록된 id만 대상으로 하며 preview와 id-first 삭제를 유지한다. PoC의 삭제 SQL은 proof용 최소 범위이며 P4에서 기존 shared E2E workflow에 맞춰 새로 구현한다.

### artifact와 baseline 동일성

- 마지막 전체 E2E 후보는 Git commit SHA, Wrangler bundle SHA-256, baseline migration set SHA-256의 tuple로 식별한다.
- `serverless-poc/scripts/artifact-manifest.mjs`가 세 값과 결합 `candidateSha256`을 출력하는 방식을 검증했다.
- UAT와 prod는 같은 clean checkout에서 생성한 동일 bundle digest와 동일 baseline digest를 사용한다. 환경 이름, secret, route와 운영 variable만 다르게 주입한다.
- E2E 뒤 코드나 migration source가 바뀌면 새 candidate로 간주하고 전체 gate를 다시 수행한다.
- build output과 manifest 결과는 repository에 커밋하지 않고 CI artifact/attestation으로 보관한다. secret이나 DB URL은 manifest 입력에 넣지 않는다.

### 감사와 관측성

- 감사 행위자는 현재 단일 관리자 username의 stable string과 source(`ADMIN`, `PUBLIC`, `SYSTEM`)로 저장한다. Spring `admins` FK는 승계하지 않는다.
- 구조화 로그에는 request id/`CF-Ray`, route template, status, latency, DB error class만 남긴다. cookie, CSRF, password, connection string, 원문 개인정보는 남기지 않는다.
- 기본은 Workers Logs/Traces와 Neon console metrics다. 별도 유료 observability 또는 신규 제품 binding은 P4 필수 범위에 넣지 않는다.

## 5. 무료 한도와 예상 사용량

2026-07-20 공식 문서 기준 Workers Free는 일 100,000 requests, 요청당 CPU 10 ms, isolate memory 128 MB, 요청당 subrequest 50개, bundle 3 MB다. 네트워크/DB 대기 시간은 CPU time에 포함되지 않는다. 현재 PoC bundle은 gzip 71.56 KiB다. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

Neon Free는 카드 없이 프로젝트당 월 100 CU-hours, storage 0.5 GB, 최대 2 CU와 scale-to-zero를 제공한다. [Neon pricing](https://neon.com/pricing)

현재 저장소에는 실제 production traffic 측정치가 없으므로 비용을 허위로 단일 숫자로 예측하지 않는다. P4 capacity gate는 다음처럼 잡는다.

- API 1,000 requests/day이면 Worker 약 30,000 requests/month이고 무료 일 한도의 1%다.
- direct Worker route에서는 API 요청당 Worker invocation 1회다. Pages proxy를 유지하면 대략 2회가 되어 무료 quota 여유가 절반으로 줄 수 있다.
- 비인증 요청은 rate limit 판정으로 PostgreSQL write 1회가 추가된다. 예약 읽기/쓰기를 합쳐 평균 2~4 DB statement/request로 측정하고 Neon CU-hour를 UAT에서 관측한다.
- rate bucket과 session은 retention delete를 적용한다. 0.5 GB의 70%를 경고선으로 두고 실제 row/index 크기를 측정한다.
- Workers 100,000/day 또는 Neon 100 CU-hours/0.5 GB에 근접하면 무료라는 가정을 유지한 채 기능을 축소하지 않고 사용자에게 유료 전환/구조 변경을 보고한다.
- 가장 큰 즉시 위험은 DB 대기가 아니라 secure password hashing의 10 ms CPU limit다. 원격 telemetry gate 전에는 무료 적합성을 완료 판정하지 않는다.

## 6. P4에서 재사용할 것과 폐기할 것

재사용할 수 있는 부분:

- core port와 Worker/Hono/Neon adapter 경계
- strict environment parser와 conditional route 등록 패턴
- session id와 CSRF token digest 저장 패턴
- Web Crypto password encoded format과 테스트
- PostgreSQL exclusion constraint 패턴과 SQLSTATE `23P01` 처리 원칙
- PostgreSQL atomic rate limit counter 패턴
- disposable DB migration replay와 schema hash script
- Worker/baseline candidate manifest 방식

폐기하거나 다시 작성할 부분:

- 모든 `p3_poc_*` table과 PoC migration
- `/api/p3/*` endpoint
- PoC session login shortcut과 최소 cleanup SQL
- PoC용 `P3-SESSION` cookie 이름
- 전체 제품 schema를 대신하지 않는 room/reservation 최소 열
- 로컬 PostgreSQL `pg` test transport

P4에서는 기존 제품 API 이름과 응답을 기준 버전에서 옮기고, PoC endpoint를 제품 endpoint로 확장하지 않는다.

## 7. 추가 결정과 blocker

P4 시작 전에 사용자 정책 변경이 필요한 항목은 발견하지 못했다. 계약과 실질적으로 충돌한 항목도 없다.

P4 초기에 추가로 닫아야 할 기술 항목:

1. 실제 Neon의 disposable branch에서 `btree_gist`, HTTP batch transaction, 요청 범위 WebSocket transaction을 검증하고 선택 transport별 latency를 기록한다.
2. direct `/api/*` route를 Pages UAT custom domain에 붙여 route 우선순위, cookie, CSRF, `CF-Connecting-IP`를 확인한다. 불가능하면 Pages proxy + service binding/인증된 내부 header 설계를 선택한다.
3. PBKDF2의 Workers Free CPU telemetry를 확인한다. 초과 시 `pgcrypto` bcrypt와 Workers Paid 중 하나를 결정한다.
4. rate limit이 DB write load에 주는 CU-hour와 storage를 UAT traffic simulation으로 측정한다.
5. P4 전체 schema를 설계하면서 interactive transaction이 필요한 use case를 목록화한다. HTTP batch/atomic SQL로 충분한 동작에는 WebSocket을 사용하지 않는다.

이 gate들을 통과하기 전에는 기존 Spring schema/Flyway 폐기, 현재 Neon 초기화, production route 전환 또는 Render 중지를 진행하면 안 된다.

## 8. 참고한 1차 자료

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Cloudflare Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/)
- [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/)
- [Cloudflare Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Cloudflare Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Neon serverless driver](https://github.com/neondatabase/serverless)
- [Neon pricing](https://neon.com/pricing)
- [Neon Postgres compatibility](https://neon.com/docs/reference/compatibility)
- [PostgreSQL range constraints](https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT)
- [node-pg-migrate](https://salsita.github.io/node-pg-migrate/)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

시간에 따라 바뀌는 한도와 platform 동작은 P4 시작 시점과 production 배포 직전에 다시 확인한다.
