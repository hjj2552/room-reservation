# Cloudflare D1 P3 최소 기술 검증

검증일: 2026-07-21 (Asia/Seoul)

대상 브랜치: `codex/serverless-migration-contract`

범위: D1 채택 가능성 판단을 위한 격리된 P3 PoC. 제품 baseline V1, 전체 API, 운영 DB, Pages proxy, rate limit, 프런트엔드는 변경하지 않았다.

## 결론

**최종 권고는 `D1 채택 보류`다.**

로컬 workerd/D1에서는 최소 제품 계약을 구현할 수 있었다. SQLite trigger가 8개의 실제 동시 Worker 요청 중 정확히 1건만 허용했고, `batch()` commit/rollback, D1 session 저장, 기존 `XSRF-TOKEN`/`X-XSRF-TOKEN` 흐름, UTC instant와 Asia/Seoul 날짜 경계, PBKDF2-HMAC-SHA256 600,000회 실행도 검증했다.

그러나 다음 두 필수 근거가 없다.

1. `wrangler whoami` 결과가 `You are not authenticated`이므로 Cloudflare 계정 소유권을 확인하지 못했고 disposable 원격 D1/Worker를 만들지 않았다.
2. PBKDF2의 로컬 workerd 벽시계 시간은 두 실행에서 hash 357~358 ms, verify 352~369 ms였다. 벽시계 시간은 Workers CPU time이 아니므로 Free의 요청당 10 ms CPU 적합성을 판정할 수 없다. 원격 Worker의 공식 CPU telemetry가 필수다.

또한 현재 `docs/serverless-migration-contract.md`는 PostgreSQL을 확정한 계약이다. D1 채택은 단순 어댑터 교체가 아니라 원자성, transaction, SQL, 시간 타입, migration/backup 계약을 바꾸므로 별도 승인 없이 P4에서 선택할 수 없다. 이 P3에서는 계약 문서를 수정하지 않았다.

## PoC 구조와 경계

`serverless-d1-poc/`는 기존 `serverless-poc/`(Neon PostgreSQL)를 보존한 별도 실험이다.

```text
serverless-d1-poc/
├── migrations/0001_p3_d1_poc.sql  # 실험 전용 최소 schema/trigger
├── src/core/                       # Cloudflare/D1 비의존 port와 시간 정책
├── src/http/                       # Hono + 기존 cookie/CSRF 계약
├── src/infra/d1-adapter.ts         # 유일한 D1Database 의존 경계
├── src/security/                   # Workers Web Crypto
└── tests/                          # workerd + local D1 통합/경쟁 테스트
```

핵심은 `ReservationRepository`와 `SessionStore`가 `D1Database`를 모른다는 점이다. Hono는 HTTP parsing/cookie/status mapping에만 사용하며, 시간 정책과 port는 Web API 및 Cloudflare API와 분리했다. D1 binding, SQL, trigger 오류 변환은 `D1ReservationRepository`/`D1SessionStore`에만 있다. P4에서 DB를 바꿀 때 core와 HTTP 계약의 변경을 제한할 수 있지만, SQL migration과 transaction 구현은 DB별로 다시 작성해야 한다.

PoC endpoint는 `/api/p3-d1/*`, table은 `p3_d1_*`로 명확히 격리했다. 이 이름과 endpoint는 제품 API가 아니며 폐기 대상이다.

## 검증 환경과 버전

- Windows 로컬 개발 환경
- Node/npm에서 실행한 Cloudflare Workers Vitest pool
- Wrangler `4.112.0`
- `@cloudflare/vitest-pool-workers` `0.18.6`
- Miniflare `4.20260714.0`
- workerd `1.20260714.1`
- Hono `4.12.31`
- Vitest `4.1.10`
- TypeScript `5.9.3`

Cloudflare 문서에 따르면 local D1은 Wrangler/Miniflare/workerd를 사용하고 remote와 기본적으로 분리된다. 이번 검증은 가짜 UUID를 가진 local-only binding만 사용했으며 실제 Cloudflare/Neon/Render 자원은 생성·조회·수정하지 않았다. [Cloudflare D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)

## 최소 schema와 시간 저장

실험 schema는 공간, 예약/상태/시간, 예약 감사 이벤트, 관리자 session/CSRF digest만 포함한다. 전체 제품 schema를 재작성하지 않았다.

- 시간은 UTC Unix epoch **milliseconds**를 D1 `INTEGER`로 저장한다.
- 제품에 필요한 연도 범위의 millisecond 값은 JavaScript safe integer 안이며 UTC/KST 표기가 같은 instant로 정확히 수렴한다.
- 입력 문자열에는 `Z` 또는 명시적 offset을 요구한다.
- schema `CHECK`와 core 정책이 시작/종료 5분 정렬, 종료 > 시작, 최소 30분을 검증한다.
- 운영 시작/종료의 30분 정렬은 pure core 함수로 검증한다.
- Asia/Seoul 날짜 조회는 `[YYYY-MM-DDT00:00:00+09:00, 다음 날 00:00:00+09:00)`의 반개구간을 epoch ms로 변환한다. `23:59:59.999999`을 millisecond로 잘라 저장하지 않는다.
- 서버의 주입 가능한 UTC `now`가 공개 과거 예약을 거부하고 관리자는 같은 과거 window를 허용한다.

PostgreSQL `timestamptz`와 달리 D1/SQLite가 시간 타입 의미를 보존하지 않으므로 이 encoding과 validation은 애플리케이션 계약이 된다. 초·subsecond가 0이 아닌 입력은 5분 modulo 검증에서 거부된다.

## 예약 충돌의 원자적 방어

우선 검증한 방식은 SQLite `BEFORE INSERT`/`BEFORE UPDATE` trigger다. 활성 상태는 `REQUESTED`, `CONFIRMED`이며 충돌 조건은 다음 반개구간 비교다.

```sql
existing.start_at_utc_ms < NEW.end_at_utc_ms
AND existing.end_at_utc_ms > NEW.start_at_utc_ms
```

동일 공간의 활성 행이 존재하면 `RAISE(ABORT, 'reservation_conflict')`로 statement를 중단한다. UPDATE trigger는 `existing.id <> OLD.id`로 자기 자신을 제외한다. 검증 결과:

- 활성 예약과 겹치는 INSERT 거부: 통과
- 시간을 겹치게 만드는 UPDATE 거부: 통과
- `CANCELLED`를 활성 상태로 바꾸며 겹치는 UPDATE 거부: 통과
- 자기 행을 동일 값으로 수정: 통과
- 활성 예약과 겹치는 `CANCELLED` INSERT: 통과
- 애플리케이션 사전 조회 없이 DB trigger가 최종 방어선: 통과

충돌 lookup에는 `(room_id, status, start_at_utc_ms, end_at_utc_ms)` index를 두었다. PostgreSQL의 partial GiST exclusion constraint를 흉내 낸 것이 아니라 SQLite에 맞춘 별도 구현이다.

### 8개 동시 요청

`SELF.fetch()`로 동일 공간/동일 시간에 8개의 Worker 요청을 `Promise.all`로 동시에 보냈다.

| 결과 | 실제 수치 |
|---|---:|
| HTTP 201 | 1 |
| HTTP 409 `RESERVATION_CONFLICT` | 7 |
| 최종 활성 예약 | 1 |
| 최종 `CREATED` 감사 이벤트 | 1 |

중간 실패 행은 남지 않았다. 이 결과는 local D1의 실제 binding과 Worker request boundary를 통과한 결과다. Cloudflare는 각 D1 DB가 본질적으로 single-threaded이고 query를 한 번에 하나씩 처리한다고 명시하지만, 결론은 설명만이 아니라 위 경쟁 테스트 결과에 근거한다. [D1 limits and concurrency](https://developers.cloudflare.com/d1/platform/limits/)

원격 D1에서는 재실행하지 못했다. 따라서 production service의 queueing/latency/overload와 원격 구현의 회귀는 미검증 gate다.

## Transaction과 `batch()`

PoC의 예약 생성은 예약 행과 `CREATED` 감사 이벤트를 두 prepared statement의 `DB.batch()`로 실행한다.

- 두 statement 정상 실행 후 예약/이벤트 commit: 통과
- 첫 예약 INSERT 성공 후 두 번째 FK 위반: 전체 rollback, 예약 0행: 통과
- 경쟁 중 trigger 실패: 해당 batch 전체 rollback, orphan 이벤트 없음: 통과

Cloudflare는 D1이 auto-commit이며 `batch()`의 statement를 순차·비동시로 실행하고, batch가 SQL transaction이어서 하나가 실패하면 전체 sequence를 abort/rollback한다고 보장한다. [D1 `batch()` contract](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

제약은 명확하다. D1 binding에는 PostgreSQL client처럼 임의의 애플리케이션 코드를 statement 사이에 실행하는 interactive transaction callback을 전제로 할 수 없다. 필요한 값을 먼저 계산한 뒤 고정된 statement batch, 단일 statement/trigger, 또는 별도 상태 머신으로 표현해야 한다. 기존 PostgreSQL transaction 코드를 기계적으로 번역해서는 안 된다. P4 전에 모든 use case를 다음 세 종류로 분류해야 한다.

1. 단일 statement + trigger로 원자화 가능
2. 사전에 구성한 `batch()`로 원자화 가능
3. 중간 read 결과에 따라 후속 write가 달라지는 interactive workflow — 재설계 또는 PostgreSQL 유지 필요

## Session과 CSRF

검증한 흐름은 다음과 같다.

- 256-bit opaque session id와 CSRF token 생성
- D1에는 SHA-256 digest만 저장
- session cookie: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`
- `XSRF-TOKEN`: `Secure`, `HttpOnly=false`, `SameSite=Lax`, `Path=/`
- `X-XSRF-TOKEN` header와 cookie가 같고 DB digest도 일치할 때 보호 요청 성공
- header 누락/불일치: 403
- logout 후 digest 삭제, 재사용: 401
- 만료 session: 401

즉 기존 React의 cookie/header CSRF 계약은 D1 session store로 유지 가능하다. PoC cookie 이름 `P3-D1-SESSION`은 실험용이며 제품 session cookie 이름을 바꾸자는 제안이 아니다. 만료 session의 주기적 삭제, session 갱신 정책, 다중 관리자 계정은 범위 밖이다.

## PBKDF2-HMAC-SHA256 600,000회

Workers Web Crypto에서 PBKDF2 `deriveBits()`가 공식 지원되며, 기존 600,000회 정책을 바꾸지 않고 hash/verify/오입력 거부가 실행됐다. [Workers Web Crypto algorithms](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)

동일 로컬 workerd의 두 실행에서 관측한 범위:

| 작업 | wall time |
|---|---:|
| hash | 357~358 ms |
| verify | 352~369 ms |

이 값은 기능 호환성과 재현성 근거일 뿐 CPU time이 아니다. Cloudflare는 Free HTTP 요청의 CPU limit을 10 ms로 두며, network/DB wait는 CPU time에서 제외하고 dashboard에서 CPU time과 `exceededCpu` outcome을 제공한다. [Workers CPU limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)

**판정: 로컬 기능 통과, Workers Free CPU 적합성 미확정.** 원격 disposable Worker에서 hash와 verify를 각각 충분한 횟수로 실행하고 Workers 공식 CPU telemetry의 분포와 `exceededCpu`를 확인해야 한다. Free에서 안정적으로 통과하지 못하면 600,000회를 낮추지 말고 Workers Paid 또는 PostgreSQL/별도 신뢰 경계에서의 검증 등 아키텍처 결정을 해야 한다.

## Migration과 빈 DB 재현

D1 공식 SQL migration을 선택했다. 이 P3 규모에서 Drizzle 등 별도 TypeScript migration 추상화는 SQLite/PostgreSQL 차이를 숨기지 못하면서 생성물만 늘리므로 제외했다. 애플리케이션 코드는 TypeScript지만 DB baseline은 review 가능한 SQL이다.

실행 결과:

```text
npx wrangler d1 migrations apply DB --local
Resource location: local
0001_p3_d1_poc.sql: 10 commands executed successfully

npx wrangler d1 migrations apply DB --local
No migrations to apply!
```

테스트도 빈 local D1에 같은 migration을 적용하고 `d1_migrations`에서 `0001_p3_d1_poc.sql`을 확인한다. D1 migration은 번호 순 SQL 파일과 `d1_migrations` 추적 테이블을 공식 지원한다. [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

P4에서는 실험 migration을 제품 baseline으로 승격하지 않는다. 최종 schema를 새 migration set으로 만들고 빈 local DB, disposable remote DB, UAT 순으로 적용하며 migration file hash와 Worker commit을 release manifest에 묶어야 한다.

## 무료 한도와 보수적 사용량 추정

2026-07-21 확인 기준 D1 Free는 5,000,000 rows read/day, 100,000 rows written/day, account total 5 GB, DB당 500 MB, DB 10개, Free Time Travel 7일이다. Worker invocation당 D1 query 50개, D1 동시 connection 6개, query 최대 30초다. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

Workers Free는 100,000 requests/day, 10 ms CPU/request, 128 MB, subrequest 50개다. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

아래는 실제 telemetry가 아니라 명시적 가정에 의한 보수적 모델이다. timetable/list는 적절한 index가 있으나 반환/scan 행 수만큼 billing되고, reservation mutation은 trigger scan을 포함한다. 예약+감사+index의 장기 저장을 평균 3 KB/건으로 가정했다. Cloudflare 문서대로 index column write는 최소 1개의 추가 row write를 만든다고 보고 mutation당 6 writes, session create/refresh당 3 writes를 잡았다.

| 일일 시나리오 | Worker 요청 | rows read | rows written | 연간 신규 예약 저장 추정 | Free 판정 |
|---|---:|---:|---:|---:|---|
| 낮음: 설정 200, 시간표 200, mutation 10 | 약 550 | 약 57,300 | 약 90 | 약 11 MB | 넉넉함 |
| 보통: 설정 1,000, 시간표 1,000, mutation 50 | 약 3,250 | 약 553,000 | 약 450 | 약 53 MB | DB quota는 넉넉함 |
| 피크: 설정 5,000, 시간표 5,000, mutation 300 | 약 16,400 | 약 4,960,000 | 약 2,700 | 약 321 MB | read 0.8% 여유뿐이라 부적합에 가까움 |

계산에 포함한 항목은 공개 설정/공간 read, 날짜 범위 timetable read, 예약 생성·수정·취소, 관리자 목록, session lookup/refresh, 감사 이력, trigger 충돌 조회, index write다. E2E/UAT, dashboard/CLI query도 quota를 소비하며 같은 account의 다른 D1 DB 사용량과 합쳐질 수 있다. Free daily quota를 넘으면 reset 전까지 D1 query가 오류를 반환하므로 피크 시나리오는 운영 안전 여유가 없다. 실제 P4 판단 전 query별 `meta.rows_read`, `meta.rows_written`, dashboard 일일 p95를 수집해야 한다.

Write quota와 Workers request quota는 세 시나리오에서 여유가 크다. 주요 위험은 timetable/admin query의 read amplification, 500 MB 단일 DB의 다년 audit 성장, 그리고 PBKDF2 CPU다. expired session cleanup과 audit retention 정책도 저장량 계산 전에 결정해야 한다.

## Backup, 복구, 일관성

D1 production storage의 Time Travel은 항상 켜져 있고 Free 보존은 7일이며 minute 단위 point-in-time restore를 제공한다. 장기 보관은 export/R2 등 별도 절차가 필요하고 restore는 현재 DB를 덮어쓰는 파괴적 작업이므로 운영 runbook과 복구 drill이 필요하다. [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/), [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

Read replication을 켜면 replica는 비동기라 stale할 수 있으며 Sessions API/bookmark가 한 논리 session의 sequential consistency를 제공한다. 모든 write는 primary로 전달된다. 이번 PoC는 read replication을 켜지 않았고 conflict 결정은 primary write path의 trigger에서 수행한다. P4에서 replication을 쓰면 session/timetable의 read-your-writes 요구에 `withSession()` bookmark 전달 설계가 필요하다. [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)

## Neon PostgreSQL 대비 portability와 운영 trade-off

| 기준 | Neon PostgreSQL 유지 | Cloudflare D1 전환 |
|---|---|---|
| 계정 소유권 | 현재 개인 Google 2FA 의존이 blocker. 조직 소유권 이전 필요 | Cloudflare 조직 계정으로 모을 가능성은 있으나 이번 환경은 미인증이라 실제 소유권 미확인 |
| Worker 연결 | Neon WebSocket/HTTP driver와 secret 필요 | Worker binding으로 단순, 별도 DB credential 불필요 |
| 동시 예약 | partial GiST exclusion constraint로 선언적·강한 보장 | SQLite trigger로 가능함을 로컬 경쟁 테스트로 확인, DB별 구현 필요 |
| transaction | interactive transaction 포함 PostgreSQL 기능 | 단일 statement/trigger/사전 구성 `batch()` 중심; interactive flow 재설계 필요 |
| 시간 타입 | `timestamptz`가 instant 의미 보존 | INTEGER epoch와 앱 validation이 의미를 책임짐 |
| SQL/도구 | 표준 PostgreSQL 생태계, 높은 이전성 | SQLite SQL은 널리 쓰이지만 D1 binding/migration/trigger와 제약은 vendor-specific |
| backup/복구 | Neon plan/branch/PITR 정책에 따름 | Free 7일 Time Travel, 장기 export 별도; 실제 restore drill 미검증 |
| 무료 운영 | 이전 P3에서 driver/DB 기능 검증, 계정 접근성 문제 | 예상 보통 사용량은 Free 내, peak read와 PBKDF2 CPU 여유 부족 |
| vendor lock-in | Neon에서 다른 PostgreSQL로 비교적 용이 | binding, Sessions bookmark, D1 metrics/API 및 SQLite trigger로 Cloudflare 결합 증가 |
| 재이전 비용 | PostgreSQL 호환 공급자 간 낮은 편 | epoch/schema/trigger/transaction을 PostgreSQL용으로 다시 써야 함 |

도메인 port는 lock-in을 줄이지만 DB semantics까지 추상화하지는 않는다. 특히 conflict trigger, batch 원자성, read consistency bookmark, migration/backup은 adapter 밖으로 새지 않도록 하되 각 DB adapter의 contract test로 고정해야 한다.

## 계정과 원격 검증 상태

실행한 `npx wrangler whoami` 결과:

```text
wrangler 4.112.0
You are not authenticated. Please run `wrangler login`.
```

로그인을 우회하거나 temporary preview account를 사용하지 않았고 credential을 요구하지 않았다. remote D1/Worker는 생성·배포·삭제하지 않았다. 따라서 다음은 **미확정**이다.

- Cloudflare account가 조직 소유인지, 복구 가능한 관리자가 둘 이상인지
- disposable remote D1의 trigger/8-way concurrency/rollback 결과
- remote latency, queue/overload behavior, D1 `meta` billing 수치
- PBKDF2 hash/verify의 공식 CPU telemetry와 Free 안정성
- Time Travel restore와 export/import drill

## 선택/제외한 대안

- 선택: Hono HTTP boundary + 순수 core + D1 repository adapter. 기존 Worker P3 구조와 같아 transport를 최소화한다.
- 선택: SQLite trigger를 충돌의 최종 DB 방어선으로 사용. 사전 SELECT-only 방식은 경쟁에 안전하지 않아 제외했다.
- 선택: UTC epoch ms INTEGER + 명시적 offset validation + Seoul 반개구간 query.
- 선택: D1 공식 SQL migrations. PoC에서 ORM/TypeScript migration generator는 제외했다.
- 선택: D1 `batch()`로 미리 정해진 복수 write를 묶는다.
- 제외: PostgreSQL partial GiST를 D1에 모방하는 가짜 abstraction.
- 제외: isolate-local lock/memory로 동시성을 막는 방식.
- 제외: `exec("BEGIN ...")` 또는 PostgreSQL식 interactive transaction을 D1에 가정하는 방식.
- 제외: PBKDF2 iteration 하향, credential 저장, 인증 우회, temporary Cloudflare account.
- 제외: D1 read replication. 최소 write 원자성 판단에 필요 없고 consistency 설계가 별도다.

## P4 재사용/폐기 판단

재사용 후보:

- core repository/session port의 방향
- UTC offset parsing, epoch ms/Seoul day boundary와 시간 정책 test
- Web Crypto PBKDF2/opaque token/digest 구현(기존 Neon PoC 구현과 P4에서 하나로 통합)
- D1 adapter contract 및 8-way concurrency test 패턴
- trigger의 INSERT/UPDATE/status/self/CANCELLED 회귀 사례
- 빈 DB migration/rollback/session-CSRF test

폐기 또는 재작성:

- `p3_d1_*` table/endpoint 이름과 실험 schema 전체
- 가짜 local DB UUID와 local-only Wrangler 설정
- 전체 제품 schema를 반영하지 않은 `0001_p3_d1_poc.sql`
- PoC 고정 session TTL과 최소 request body
- D1을 채택하지 않으면 D1 adapter/trigger/migration 전부

## P4 전 필수 gate와 남은 결정

다음이 끝나기 전에는 D1 기반 P4 전체 backend 재작성을 시작하지 않는다.

1. Cloudflare 조직 account 소유권, 최소 2인의 복구 가능한 admin, billing/퇴사 인계 책임 확정
2. 승인된 disposable remote Worker/D1에서 migration, 8-way concurrency, rollback, session/CSRF 재실행
3. PBKDF2 hash/verify의 Workers CPU telemetry와 `exceededCpu` 확인; Free 통과 또는 Paid/아키텍처 선택
4. 현재 실제 트래픽과 query별 D1 `meta`로 rows read/write/storage 모델 보정
5. 전체 use case를 single statement/trigger/batch/interactive로 분류하고 interactive blocker 확인
6. 전체 제품 schema의 SQLite 표현, FK/index/감사/반복 예약 migration 설계 및 PostgreSQL 회귀 비용 검토
7. D1 Time Travel restore 및 장기 export/import 복구 drill
8. D1로 바꿀 경우 PostgreSQL을 전제로 한 migration contract 변경을 별도 승인

현재 로컬 근거에서 D1 자체가 제품 계약을 구현할 수 없다는 blocker는 발견하지 못했다. 다만 원격 원자성/운영성, account 소유권, Free CPU가 미확정이고 현재 계약과 충돌하므로 **D1 채택은 확정하지 않는다**. Neon을 계속 쓸 경우에도 개인 2FA 의존을 제거하는 계정 소유권 해결이 선행돼야 한다.

## 실행 명령과 결과

```text
npm install
  83 packages, 0 vulnerabilities

npm run check
  PASS (TypeScript, no emit)

npm test
  Test Files 4 passed (4)
  Tests 10 passed (10)

npm test -- --disableConsoleIntercept tests/time-and-password.test.ts
  dedicated: hashWallMs=358, verifyWallMs=352, iterations=600000
  full rerun: hashWallMs=357, verifyWallMs=369, iterations=600000
  Test Files 1 passed (1), Tests 3 passed (3)

npx wrangler d1 migrations apply DB --local
  first run: 0001_p3_d1_poc.sql, 10 commands successful
  second run: No migrations to apply

npm run build
  Wrangler dry-run PASS
  final upload 76.46 KiB, gzip 18.82 KiB
  binding: local-only D1 DB

npx wrangler whoami
  not authenticated; remote validation not run
```

Dry-run `dist/`, local `.wrangler/` state, `.env`, secret, credential은 결과물에 포함하지 않는다.
