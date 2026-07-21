# Cloudflare Worker + Neon PostgreSQL P3 원격 검증

상태: 완료

검증일: 2026-07-21 (Asia/Seoul)

대상 브랜치: `codex/serverless-migration-contract`

검증 시작 HEAD: `0a0fdeeb4389b67992f5aaa28d769e11f740e0d6`

범위: P4 기술 선택을 위한 disposable Cloudflare Worker, Pages preview, Neon PostgreSQL 최소 검증이다. 전체 제품 API/schema, Spring·React 제품 코드, production Pages 설정·route·DNS, Render, 기존 Neon DB는 변경하지 않았다. D1, PBKDF2 재시험, rate limit 구현·부하 검증은 범위에서 제외했다.

## 최종 판정

**TypeScript Cloudflare Worker + Neon PostgreSQL을 채택한다. P4 전체 재작성을 진행할 수 있다.**

플랫폼과 데이터 계층의 기술 가능성은 입증됐다. 실제 Worker에서 Neon HTTP query, HTTP batch transaction, 요청 범위 WebSocket transaction, `btree_gist`, `pgcrypto`, 경쟁 예약 제약, migration replay, Pages same-origin proxy, session·CSRF와 scale-to-zero 복구가 모두 성공했다.

`pgcrypto`의 bcrypt(`bf`)가 72-byte 이후 입력을 조용히 무시한다는 위험은 원격 검증에서 확인됐다. 사용자는 공개 예약 비밀번호를 printable ASCII 4~64자(`^[\x21-\x7E]{4,64}$`)로 제한하는 제품 정책 변경을 승인했다. 허용 입력은 UTF-8에서도 최대 64 bytes이므로 72-byte 제한에 걸리지 않으며 blocker가 해소됐다.

현재 Spring도 공통 `BCryptPasswordEncoder`로 공개 예약 비밀번호를 처리하면서 DTO는 Unicode 4~100자를 허용한다. 따라서 이 위험은 Worker 마이그레이션이 새로 만든 제약이 아니라 기존 시스템에도 존재하던 잠재 문제다. 실제 운영 데이터가 없고 DB를 초기화할 예정이므로 기존 100자·한글 비밀번호 호환 없이 정책을 명시적으로 바로잡는다.

rate limit은 별도 Go-Live 보안 과제로 보류됐다. 이 결정은 이번 P4 진행 판정의 blocker가 아니지만, 완료 전 공개 예약 접수를 실제 활성화해서는 안 된다.

## Disposable 환경과 안전 경계

- Neon branch: `room-reservation-p3-neon-20260721-01`
- 실행 role: `room_reservation_p3_validator`
- primary DB: `room_reservation_p3_primary_20260721`
- replay DB: `room_reservation_p3_replay_20260721`
- UAT Worker: `room-reservation-p3-neon-a2e818e5`
- Pages project: 기존 `room-reservation-jnunursing`의 preview branch `p3-neon-20260721`
- PostgreSQL: Neon PostgreSQL 16.14

pooled URL은 Worker의 HTTP/WebSocket 요청에, direct URL은 migration과 검증 runner에 사용했다. 두 URL은 같은 disposable endpoint/role/branch를 가리켰고 TLS가 요구됐다. 연결 문자열, DB 비밀번호, OAuth token, probe token, session/CSRF 값, 실제 IP는 출력·문서·Git에 남기지 않았다.

검증 전 두 DB는 non-system table이 0개였고 `btree_gist`, `pgcrypto`가 설치되지 않은 상태였다. 기존 Render/Neon URL은 사용하지 않았다.

## 최소 PoC 구조

```text
serverless-poc/
├─ remote-migrations/
│  └─ 001_p3_neon_remote_baseline.ts
├─ src/remote/
│  └─ neon-validation-worker.ts
├─ scripts/
│  ├─ run-neon-remote-migrations.mjs
│  ├─ deploy-neon-remote-worker.mjs
│  ├─ update-neon-remote-worker.mjs
│  ├─ run-neon-worker-validation.mjs
│  ├─ deploy-pages-neon-preview.mjs
│  ├─ run-pages-neon-preview-validation.mjs
│  ├─ run-neon-idle-resume-validation.mjs
│  ├─ inspect-neon-remote-usage.mjs
│  └─ cleanup-neon-remote-validation.mjs
└─ wrangler.neon-remote.jsonc
```

모든 endpoint와 table은 `p3-neon`/`p3_neon_*`로 격리했다. Worker는 `APP_ENV=uat`와 임의 probe token을 모두 요구했다. route/custom domain은 만들지 않았고 version preview alias만 Pages preview의 upstream으로 사용했다.

이 PoC는 제품 baseline V1이 아니다. 반복 예약, 전체 예약/관리자 API, rate-limit table, 관리자 계정 table, 전체 감사 schema, 제품 cleanup route를 구현하지 않았다.

## 검증 결과

### Neon driver와 transaction

| 항목 | 결과 |
|---|---|
| Worker의 parameterized HTTP query | 성공, injection 형태 문자열을 값 그대로 반환하고 table 유지 |
| HTTP batch commit | 성공, 두 행 commit |
| HTTP batch rollback | 성공, 의도적 오류 뒤 0행 |
| WebSocket `Client` commit | 성공, 한 행 commit |
| WebSocket `Client` rollback | 성공, 의도적 오류 뒤 0행 |
| 요청 종료 연결 정리 | 성공, 모든 경로에서 `client.end()` 실행 |
| 외부 오류 | SQLSTATE만 분류하고 SQL/credential은 응답에 노출하지 않음 |

일반 query는 `@neondatabase/serverless`의 `neon()` HTTP transport를 사용한다. 고정된 여러 statement는 HTTP `transaction([...])`, 중간 결과가 필요한 update는 요청 범위 `Client`와 `BEGIN`/`COMMIT`/`ROLLBACK`을 사용했다. 전역 connection/pool은 두지 않았다.

Node `pg` 검증 runner는 향후 `pg-connection-string` 3/`pg` 9에서 `sslmode=require` 의미가 약해질 수 있다는 경고를 냈다. P4 migration runner는 현재 동작을 암묵적으로 기대하지 말고 `sslmode=verify-full` 또는 해당 버전의 명시적 인증서 검증 설정을 사용한다. package major upgrade 때 TLS 검증 회귀 테스트를 둔다.

처음 작성한 HTTP batch 감사 INSERT에서 PostgreSQL `42P18`이 발견됐다. JSON 생성 함수에 전달한 parameter type을 명시하고, 예약+감사 생성은 한 data-modifying CTE로 묶었다. 이는 Neon/제약 실패가 아니라 PoC SQL의 type annotation 누락이었으며 수정 후 전체 검증이 통과했다. P4에서도 polymorphic SQL 함수 parameter에는 명시적 cast를 둔다.

### Extension과 migration

- `btree_gist` 1.7 설치 성공
- `pgcrypto` 1.3 설치 성공
- migration role이 두 extension과 table/constraint/index를 직접 생성함
- primary 최초 적용: `001_p3_neon_remote_baseline` 1개
- primary 재적용: 0개
- replay 최초 적용: 같은 migration 1개
- replay 재적용: 0개
- 두 DB 논리 schema SHA-256: `22c3e4f0181b7b45fb5ca6760b26016f419357bb02db3c0b9ec4363f900d45b0`
- 의도적으로 실패한 migration: 실패 처리, 부분 table 0개

`node-pg-migrate` 9.0.0 TypeScript migration과 별도 Node 배포/CI 단계 조합을 유지한다. Worker request에서 migration을 실행하지 않는다. P4 최종 V1은 이 실험 migration을 확장하지 않고 제품 계약으로 새로 작성한다.

### 경쟁 예약과 감사 원자성

partial GiST exclusion constraint는 다음 의미를 사용했다.

```sql
EXCLUDE USING gist (
  room_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
) WHERE (status IN ('REQUESTED', 'CONFIRMED'))
```

8-way 동시 요청을 10회 반복했다. 매 회차 결과는 동일했다.

- 성공 1
- `RESERVATION_CONFLICT` 7
- 활성 예약 최종 1
- 성공 예약 감사 이벤트 1
- 충돌 요청 감사 이벤트 0

추가 사례 결과:

| 사례 | 결과 |
|---|---:|
| 같은 공간·같은 시간 | 409 |
| 같은 공간·부분 중첩 | 409 |
| 종료/시작 경계만 접함 | 201 |
| 다른 공간 | 201 |
| `CANCELLED` 중첩 | 201 |
| 시간 UPDATE 충돌 | 409 |
| `CANCELLED` → `REQUESTED` 활성화 충돌 | 409 |

감사 INSERT 실패 시 예약/감사 모두 0행이었다. 실패한 UPDATE는 상태와 감사 수를 변경하지 않았다. `STATUS_CHANGED`와 `TIME_CHANGED`를 구분했고, 공간 삭제 뒤 `room_id`는 `NULL`이 되지만 `room_name_snapshot`은 유지됐다.

### Pages preview same-origin proxy

검증 경로는 `Pages preview /api/* → 기존 Pages Function proxy → disposable Worker → disposable Neon`이었다. production direct Worker route, custom domain, DNS는 만들지 않았다.

배포 전 dashboard 설정을 `wrangler pages download config`로 읽고 production/preview 설정을 각각 hash했다. 임시 로컬 Wrangler 설정의 preview upstream만 바꿔 배포했으며, 배포 후 다시 다운로드한 production/remote preview 설정 hash는 모두 이전과 같았다. 임시 `wrangler.toml`은 배포 직후 삭제했다.

실제 preview 결과:

- JSON, query string, POST body 보존
- backend 201/418 status와 오류 body 보존
- 두 개의 `Set-Cookie`가 별도 header로 보존
- session cookie: `Secure; HttpOnly; SameSite=Lax; Path=/`
- `XSRF-TOKEN`: `Secure; HttpOnly=false; SameSite=Lax; Path=/`
- cookie + `X-XSRF-TOKEN` 후속 보호 요청 200
- CSRF 누락/불일치 403
- logout 204, 같은 session 재사용 401

따라서 1차 마이그레이션은 기존 React의 relative `/api`와 credentials 계약을 바꾸지 않고 Pages Function proxy를 유지한다. direct Worker route와 Workers Static Assets 통합은 안정화 이후 별도 작업이다. Pages Functions도 Workers 사용량으로 계산되므로 API 한 건이 Pages Function과 backend Worker 두 invocation을 소비한다.

### 클라이언트 IP 관찰

실제 IP 값은 기록하지 않고 존재/동일성만 확인했다.

- Pages ingress의 `CF-Connecting-IP`: 존재
- Pages proxy가 기존 `X-Forwarded-For`를 삭제하고 Pages ingress 값을 새 `X-Forwarded-For`로 전달: 확인
- UAT Worker의 `CF-Connecting-IP`: 존재
- UAT Worker의 `CF-Connecting-IP`와 전달된 `X-Forwarded-For`: 불일치
- 클라이언트가 주입한 `X-Forwarded-For`: Worker에 도달하지 않음

즉 Pages Function은 Cloudflare가 제공한 원본 IP를 얻을 수 있고 현재 proxy는 spoofed header를 정제한다. 다만 backend Worker의 `CF-Connecting-IP`는 이 다단계 subrequest에서 최종 방문자 IP로 사용할 수 없고, 공개 접근 가능한 backend가 전달 `X-Forwarded-For`를 무조건 신뢰해서도 안 된다. Go-Live 전 rate-limit 작업에서 Pages→Worker 구간을 Service Binding 또는 서명된 내부 header/proxy 인증으로 고정한 뒤 전달 값을 신뢰한다. 이 미확정은 P4 기술 가능성 blocker가 아니다.

### `pgcrypto` bcrypt

`crypt(password, gen_salt('bf', cost))`와 `stored_hash = crypt(candidate, stored_hash)`를 Worker의 parameterized query로 실행했다.

- 영문, 숫자, 특수문자, 한글, 최소 4자, SQL injection 형태 문자열: hash 성공
- 올바른 입력: verify 성공
- 잘못된 입력: verify 실패
- 같은 비밀번호 두 번: 서로 다른 salt/hash
- 평문과 같은 hash: 0개
- 저장된 값: `$2` 형식 hash만 존재
- 응답/일반 로그: 평문/hash/salt 없음

#### 72-byte 위험과 승인된 해소

| 입력 | UTF-8 bytes | hash |
|---|---:|---:|
| ASCII 72자 | 72 | 200 |
| ASCII 73자 | 73 | 200 |
| ASCII 100자 | 100 | 200 |
| 한글 24자 | 72 | 200 |
| 한글 25자 | 75 | 200 |

처음 72 bytes가 같고 73번째 byte부터 다른 두 문자열은 `matched=true`였다. PostgreSQL도 bcrypt `bf`의 최대 password length를 72로 명시한다. 기존 Java 문자 100자 계약에서는 ASCII 73~100자와 한글 25자 이상 등이 영향을 받았고 조용한 truncate 위험이 있었다.

최종 제품 정책은 다음과 같다.

- 길이 4~64자
- printable ASCII `!`~`~`만 허용
- Worker 최종 검증 정규식 `^[\x21-\x7E]{4,64}$`
- 영문 대·소문자, 숫자, ASCII 특수문자 허용
- 한글, 공백, emoji, 전각 문자와 기타 Unicode 거부
- 대·소문자 구분, trim/normalization/transliteration 없음
- 프런트의 네이티브 `type="password"` 유지, 실제 비ASCII 입력 차단은 UX 보조
- API 직접 호출에도 같은 Worker 검증 적용

저장은 parameterized query로 `crypt(password, gen_salt('bf', 12))`를 실행하고 bcrypt hash만 남긴다. 사용자 입력을 직접 bcrypt에 전달하며 HMAC pre-hash와 pepper를 추가하지 않는다. PBKDF2 600,000회와 100,000회 모두 채택하지 않는다. 최대 입력이 ASCII 64 bytes이므로 원격 검증에서 확인한 72-byte 위험을 회피한다.

#### cost 측정

각 cost에서 hash/정상 verify/오류 verify를 5회씩 측정했다. 단위는 ms이며 Worker 값은 전체 HTTP wall time, query 값은 Worker 내부 Neon query wall time이다.

| cost | 작업 | Worker p50 / p95 / max | query p50 / p95 / max |
|---:|---|---:|---:|
| 10 | hash | 421.7 / 566.3 / 566.3 | 263 / 275 / 275 |
| 10 | 정상 verify | 420.6 / 443.7 / 443.7 | 259 / 287 / 287 |
| 10 | 오류 verify | 419.5 / 433.8 / 433.8 | 262 / 284 / 284 |
| 11 | hash | 496.7 / 501.1 / 501.1 | 336 / 341 / 341 |
| 11 | 정상 verify | 491.7 / 496.3 / 496.3 | 338 / 343 / 343 |
| 11 | 오류 verify | 502.9 / 648.0 / 648.0 | 344 / 351 / 351 |
| 12 | hash | 630.8 / 762.2 / 762.2 | 476 / 483 / 483 |
| 12 | 정상 verify | 627.0 / 768.5 / 768.5 | 468 / 479 / 479 |
| 12 | 오류 verify | 625.8 / 701.3 / 701.3 | 467 / 482 / 482 |

OWASP는 bcrypt를 legacy 선택으로 분류하고 최소 cost 10과 최대 72-byte 입력을 권고한다. 공개 예약 비밀번호 사용 빈도가 낮고 cost 12의 p95가 0.8초 미만이므로 **P4 cost를 12로 확정**한다. 실제 UAT에서 사용자 지연을 관찰하되 성능 때문에 승인 없이 cost를 낮추지 않는다. [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [PostgreSQL pgcrypto](https://www.postgresql.org/docs/current/pgcrypto.html)

관리자 계정은 기존 방향대로 Worker secret 기반 단일 계정이며 관리자 table/hash를 Neon에 추가하지 않았다.

### Scale-to-zero 복구

마지막 DB 요청 뒤 keep-alive/health ping 없이 317초 유휴 상태를 유지했다. Neon Free는 5분 유휴 후 scale-to-zero가 고정이므로 실제 suspension 여부는 공식 동작과 유휴 시간에서 추론했다. 별도 compute-state API/telemetry로 suspension event 자체를 읽지는 않았다.

| 측정 | 결과 |
|---|---:|
| 유휴 후 첫 Worker+HTTP query | 200, 1,257.4 ms |
| 첫 WebSocket commit transaction | 200, 2,396.7 ms |
| 새 WebSocket rollback/reconnect | 200, 2,402.5 ms |
| warm HTTP query 10회 p50 | 353.2 ms |
| warm HTTP query 10회 p95 / max | 747.1 / 747.1 ms |

재연결 오류는 없었고 각 WebSocket client를 요청 끝에 닫았다. 일반 read에는 HTTP, interactive transaction에만 WebSocket을 쓰는 선택을 유지한다. [Neon Scale to Zero](https://neon.com/docs/introduction/scale-to-zero)

## 무료 한도와 사용량 평가

2026-07-21 공식 문서 확인값:

| 항목 | Free 한도 |
|---|---:|
| Neon compute | project당 100 CU-hours/month |
| Neon storage | project당 0.5 GB |
| Neon public network transfer | 5 GB/month |
| Neon scale-to-zero | 5분 유휴 후, Free에서는 고정 |
| Neon time travel/restore | 6시간 또는 1 GB data changes |
| Neon branches | project당 10개 |
| Workers requests | account당 100,000/day |
| Workers CPU | invocation당 10 ms |
| Workers memory | 128 MB |
| Workers subrequests | external 50/request |

출처: [Neon pricing](https://neon.com/pricing), [Neon network transfer](https://neon.com/docs/introduction/network-transfer), [Neon Scale to Zero](https://neon.com/docs/introduction/scale-to-zero), [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

검증 종료 전 PoC 관계 전체는 368,640 bytes(360 KiB), 151행이었다. 0.5 GB의 0.1% 미만이다. 수정 과정의 재실행을 포함해 원격 Worker 요청은 400건 미만이었고, successful full runner 하나는 약 182건이었다. rate-limit write를 가정하거나 부하 계산에 넣지 않았다.

현재 저장소에는 실제 production 요청량, row 증가량, 평균 응답 크기가 없으므로 월 CU-hour/transfer를 단일 숫자로 예측하지 않는다. 최소 PoC에서는 저장·compute·transfer 한도를 위협하는 반증이 없었다. 다만 Pages proxy는 API 요청당 Workers invocation을 약 2회 소비하므로 Free 요청 한도 기준 실질 API 여유가 direct route보다 작다. P4 UAT에서 API 요청 수, Neon CU-hour, storage/index 증가량과 transfer를 계측한다. 한도 접근 시 기능이나 보안값을 낮추지 않고 Workers Paid(최소 월 $5) 또는 Neon 유료 플랜을 별도 승인한다.

## 기술 선택과 adapter 경계

P4에 그대로 적용할 결정:

- HTTP entry: standard Worker raw `fetch`
- route/middleware/cookie/error mapping: Hono
- core/domain: Hono, `Request`, Cloudflare env, Neon SDK 비의존 port
- 일반 query: Neon HTTP `neon()`
- 고정 batch: HTTP transaction
- interactive transaction: 요청 범위 WebSocket `Client`, 항상 `end()`
- DB 오류: adapter에서 SQLSTATE 분류, 외부에 원문 미노출
- migration: `node-pg-migrate` TypeScript, request 밖의 CI/deploy 단계
- 경쟁 예약: PostgreSQL partial GiST exclusion constraint를 최종 방어선으로 사용
- session: Neon table에 session/CSRF digest와 expiry 저장
- CSRF: 기존 `XSRF-TOKEN` cookie + `X-XSRF-TOKEN` header 계약 유지
- 1차 배포: Pages Function proxy 유지, React의 same-origin `/api` 유지
- 공개 예약 비밀번호: printable ASCII 4~64자, `pgcrypto` bcrypt cost 12
- UAT/prod: 별도 Worker 이름과 명시적 `APP_ENV`; prod에서는 cleanup route 미등록
- artifact identity: Git SHA + Worker bundle SHA-256 + baseline migration set SHA-256

이번 UAT Worker는 P3 dirty worktree에서 배포한 뒤 폐기했으므로 production 승격 가능한 artifact로 간주하지 않는다. 원격 검증 뒤 동일 Worker source의 Wrangler dry-run은 277.95 KiB(gzip 72.24 KiB)로 성공했지만, 삭제된 Cloudflare version과 최종 Git commit의 binary digest 동일성까지 소급 증명하지는 않는다. P4의 마지막 UAT 후보는 clean commit에서 `artifact-manifest.mjs`로 Git SHA, bundle SHA-256, baseline migration set SHA-256을 묶고, 같은 candidate를 prod에 재빌드하거나 attested artifact로 승격한다. 코드나 migration이 바뀌면 candidate를 폐기하고 gate를 다시 실행한다.

Cloudflare/Neon 종속성은 다음 adapter에만 둔다.

- `WorkerEnv`/composition root: binding과 secret 주입
- `HttpRouter`: Hono 요청/응답/cookie
- `ReservationRepository`: parameterized Neon SQL과 SQLSTATE
- `UnitOfWork`: HTTP batch 또는 request-scoped WebSocket
- `SessionStore`: Neon session row
- `ClientIpSource`: Pages ingress와 인증된 proxy 전달 경계
- `PasswordHasher`: Neon `pgcrypto` bcrypt cost 12 adapter
- `MigrationRunner`: Node 배포/CI 전용

제외한 대안:

- raw Fetch만으로 전체 routing: 반복 middleware/error mapping 때문에 제외
- Hono context를 domain에 전달: Cloudflare 결합 때문에 제외
- 전역 WebSocket client/pool: isolate 수명과 연결 누수 위험 때문에 제외
- ORM runtime 도입: exclusion constraint/CTE/SQLSTATE 의미를 숨기므로 이번 선택에서 제외
- Worker route/direct Pages domain: 1차 전환에서 제외
- D1: 사용자 결정으로 취소, 기존 비교 기록은 보존
- isolate-local session/rate limit: 분산 실행 계약을 만족하지 못함

## Rate limit의 Go-Live gate 이전

이번 P3/P4 핵심 재작성에서는 rate limit을 구현하지 않는다. 목적은 정확한 전역 과금 제한이 아니라 공개 API의 기본 남용 완화이며, Pages proxy IP 신뢰 경계를 확정한 뒤 Go-Live 전 별도 보안 작업으로 구현·검증한다. 완료 전 공개 예약 접수를 실제 활성화하지 않는다.

최종 제품 결정에 따라 계약서는 P4 완료 조건과 Go-Live gate를 분리한다. 기존 120/min read, 24/min write 및 429 응답은 후속 작업의 외부 기준으로 유지하지만 정확한 전역 counter는 요구하지 않는다. 실제 공개 예약 접수 활성화 전에는 IP 신뢰 경계와 rate limit 구현·검증을 반드시 완료한다.

## P4 구현 요구사항

P4를 진행할 수 있으며 공개 예약 비밀번호에는 다음 완료 테스트를 추가한다.

- ASCII 4자와 64자 성공
- 3자와 65자 거부
- 한글·공백·emoji·전각 문자 거부
- ASCII 특수문자 성공
- 영문 대·소문자 구분
- 한글 자판 상태에서 브라우저 네이티브 영문 입력 동작 확인
- 붙여넣기 비ASCII 값의 프런트 차단
- API 직접 호출의 비ASCII 값 거부
- bcrypt hash에 평문이 남지 않음
- 올바른 비밀번호 성공과 잘못된 비밀번호 실패

프런트 변경은 기존 `type="password"`를 유지하면서 4~64자 printable ASCII 제한, 안내 문구와 실제 비ASCII 입력 차단을 추가하는 최소 범위로 제한한다. 다른 UI/UX, API, 시간·예약 정책은 변경하지 않는다.

Pages→Worker IP 전달을 Service Binding 또는 서명 header로 인증하는 방식은 Go-Live 전 rate-limit 후속에서 결정한다.

## 재사용과 폐기

P4에서 재사용할 수 있는 부분:

- Neon HTTP/WebSocket transport 구분과 request-scoped lifecycle
- parameterized SQL 및 SQLSTATE mapping 원칙
- partial GiST constraint와 감사 원자성 SQL 패턴
- `node-pg-migrate` replay/schema hash/failure rollback 검증 방식
- Pages proxy의 header/cookie/status 보존 구현과 기존 테스트
- session/CSRF digest 저장 패턴
- environment/flag 기반 cleanup route 미등록 패턴
- candidate artifact identity 방식

폐기하거나 새로 작성할 부분:

- 모든 `p3_neon_*` table과 `/api/p3-neon/*` endpoint
- 검증 probe token과 version preview 설정
- PoC room/reservation/event/session schema
- 원격 검증 deploy/update/runner/cleanup script
- 검증용 `pgcrypto` bcrypt endpoint와 table 자체는 폐기하되 cost 12 parameterized query 패턴은 제품 adapter에 재사용
- P4 최종 baseline V1로 사용할 수 없는 원격 PoC migration

## 실행 명령과 결과

```text
cd serverless-poc
npm run check
# PASS

node scripts/run-neon-remote-migrations.mjs
# primary/replay 적용 성공, 재적용 0, schema hash 동일, 실패 migration 부분 적용 0

node scripts/deploy-neon-remote-worker.mjs
node scripts/update-neon-remote-worker.mjs
# route/custom domain 없는 UAT Worker version preview 배포 성공

node scripts/run-neon-worker-validation.mjs
# HTTP/batch/WebSocket, 경쟁 10회, 감사, bcrypt/cost PASS

cd ../frontend
npm run build
# TypeScript + Vite PASS

cd ../serverless-poc
node scripts/deploy-pages-neon-preview.mjs
node scripts/run-pages-neon-preview-validation.mjs
# Pages same-origin proxy/session/CSRF/IP PASS

node scripts/run-neon-idle-resume-validation.mjs
# 317초 유휴 후 HTTP/WebSocket/warm 재연결 PASS

node scripts/inspect-neon-remote-usage.mjs
# 368640 bytes, 151 rows

node scripts/cleanup-neon-remote-validation.mjs
# Pages preview 3개 삭제, Worker 삭제, primary/replay table·extension 0

npm run check
# PASS

npm test
# 5 files, 9 tests PASS

node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.neon-remote.jsonc --dry-run --outdir dist-neon-remote
# PASS, 277.95 KiB / gzip 72.24 KiB

cd ../frontend
npm run test:functions
# 9 tests PASS

npm run build
# TypeScript + Vite PASS

git diff --check
# PASS
```

## Cleanup 결과

- Pages preview deployment 3개: exact ID로 삭제, 해당 branch 잔여 0
- UAT Worker와 그 secret/version: exact name으로 삭제
- route/custom domain/hostname: 생성하지 않음
- primary DB의 `p3_neon_*` table/migration table 및 검증용 extension: 삭제, 잔여 0
- replay DB의 동일 객체: 삭제, 잔여 0
- production Pages 설정: 변경 없음
- 기존 Render/Neon DB: 변경 없음
- Neon branch와 빈 DB/role: Neon API key가 없어 자동 삭제하지 못함

남은 수동 cleanup은 Neon 콘솔에서 branch `room-reservation-p3-neon-20260721-01`을 삭제하는 것이다. branch에 설정한 자동 만료가 유효하면 만료 시 삭제되지만, 문서 확인 후 즉시 수동 삭제하는 편이 명확하다. 기존 branch/DB를 선택하거나 project 전체 reset을 사용하지 않는다.

## 확인한 1차 자료

- [Neon serverless driver](https://github.com/neondatabase/serverless)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon branches](https://neon.com/docs/manage/branches)
- [Neon databases](https://neon.com/docs/manage/databases)
- [Neon roles](https://neon.com/docs/manage/roles)
- [Neon `btree_gist`](https://neon.com/docs/extensions/btree_gist)
- [Neon pricing](https://neon.com/pricing)
- [Neon network transfer](https://neon.com/docs/introduction/network-transfer)
- [Neon Scale to Zero](https://neon.com/docs/introduction/scale-to-zero)
- [PostgreSQL `pgcrypto`](https://www.postgresql.org/docs/current/pgcrypto.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Cloudflare Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Cloudflare Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/)
- [Cloudflare Workers preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

시간에 따라 변하는 한도와 platform 동작은 P4 재개 시점과 production 전환 직전에 다시 확인한다.
