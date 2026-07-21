# Serverless Migration P4 Implementation Validation

검증일: 2026-07-21
브랜치: `codex/serverless-migration-contract`
시작 commit: `32a1a76eb7d78459df2bcba839ae09a7de32bd88`

## 판정

TypeScript Cloudflare Worker + Neon PostgreSQL production 모듈, 빈 DB baseline V1, 기존 `/api` 계약 재구현과 최소 React 비밀번호 변경을 완료했다. 격리된 로컬 PostgreSQL과 Pages preview → Pages Function proxy → disposable Worker → disposable Neon 원격 경로에서 기존 Playwright 80개 전체 시나리오가 각각 통과했으므로 P4 구현은 완료 판정이다.

실제 Render → Worker 전환은 이 작업에 포함하지 않는다. production DB 초기화, Render 중지, production Pages `BACKEND_ORIGIN`, route/domain/DNS, Spring 제거, D1 채택, rate limit, 공개 예약 접수 활성화는 모두 수행하지 않았다.

## 구현 구조

| 경계 | 구현 | Cloudflare/Neon 의존성 |
| --- | --- | --- |
| HTTP | Hono route, cookie/CSRF, 응답 mapping | Hono만 의존 |
| core | 입력, 시간, 정책, 오류, 비밀번호 규칙 | 없음 |
| service | `/api` use case와 transaction orchestration | database port만 의존 |
| database port | parameterized query와 transaction callback | 없음 |
| Neon adapter | 일반 HTTP query, 요청 범위 WebSocket transaction | `@neondatabase/serverless` |
| composition root | env 검증과 adapter 조립 | Workers env |

Hono를 domain/service에 전파하지 않았다. 일반 query는 Neon HTTP adapter로 실행하고, 결과에 따라 후속 query가 달라지는 예약·감사·반복 예약 작업은 WebSocket `Client` transaction으로 처리한다. 실패 시 rollback하고 `finally`에서 연결을 닫는다.

## Worker baseline V1

`worker/migrations/001_worker_baseline_v1.ts`는 빈 PostgreSQL 전용 baseline이다.

- `pgcrypto`, `btree_gist`
- rooms, settings, tags, recurrences, reservations, histories, admin sessions
- 활성 예약의 partial GiST exclusion constraint
- 예약·반복 예약 duration DB trigger
- opaque session/CSRF digest 저장
- Flyway table과 Spring `admins`, 가변 `slot_minutes` 없음
- 삭제 공간 sentinel 포함
- 공개 예약 접수 기본값 `false`

`node-pg-migrate` migration table로 재실행을 방지한다. 두 독립 빈 DB에 적용한 schema dump가 동일했고, 현재 schema SHA-256은 검증 명령 결과에 기록한다.

## `/api` 계약

기존 React가 사용하는 인증, 공개 설정/공간/시간표/예약, 관리자 공간/설정/tag/예약/audit/반복 예약/CSV endpoint를 TypeScript로 재구현했다. API URL과 same-origin credentials 사용은 변경하지 않았다. 기존 Pages Function `/api` proxy 구현과 Node 회귀 테스트도 유지한다.

관리자 인증은 Worker secret 기반 단일 계정이다. session id와 CSRF token은 CSPRNG opaque token이고 DB에는 SHA-256 digest만 저장한다. 외부 계약은 `ROOM-SESSION`, `XSRF-TOKEN`, `X-XSRF-TOKEN`, `SameSite=Lax`를 유지한다. UAT/prod cookie는 Secure이고 session만 HttpOnly다.

## 공개 예약 비밀번호

- 최종 서버 규칙: `^[\x21-\x7E]{4,64}$`
- printable ASCII 4~64자, 대·소문자 구분
- 공백, 한글, emoji, 전각 문자와 기타 Unicode 거부
- trim, Unicode 변환, transliteration 없음
- DB: parameterized `crypt($password, gen_salt('bf', 12))`
- 검증: `hash = crypt($password, hash)`
- 평문 저장, HMAC, pepper, PBKDF2 없음

React는 기존 `type=password`를 유지하면서 해당 input 두 위치에만 min/max/pattern, 안내 문구와 실제 비ASCII 입력 차단을 추가했다. Worker가 동일 규칙의 최종 검증자다.

## 자동 검증 결과

| 명령 | 결과 |
| --- | --- |
| `worker: npm.cmd run check` | 통과 |
| `worker: npm.cmd test` | 2 files, 6 tests 통과 |
| `worker: npm.cmd run test:isolated-postgres` | 1 file, 12 tests 통과 |
| baseline primary 재실행 | no-op 통과 |
| baseline replay | 독립 DB schema 동일 |
| schema SHA-256 | `2d9a1db6e394318274fd6d92ceb48360115b4808a95f9328b8b1f72333da22a0` |
| transaction rollback | 통과 |
| bcrypt 4/64, cost 12, 평문 부재 | 통과 |
| 3/65/한글/공백/emoji/전각 거부 | 통과 |
| 경쟁 예약 8건 | 성공 1, conflict 7 |
| session/CSRF/admin/cleanup HTTP | 통과 |
| `worker: npm.cmd run test:local-e2e` | 기존 Playwright 80/80 통과 |
| suite 후 cleanup preview | reservations/recurrences/tags/rooms 0 |
| `frontend: npm.cmd run test:functions` | 9/9 통과 |
| `frontend: npm.cmd run build` | 통과 |
| `worker: npm.cmd run build` | dry-run bundle 성공, 356.75 KiB / gzip 87.13 KiB |
| disposable Neon baseline migration | 통과, 빈 DB와 전용 owner role 확인 |
| Pages preview 전체 E2E | 기존 Playwright 80/80 통과 |
| 원격 suite 후 cleanup preview | reservations/recurrences/tags/rooms 0 |

전체 E2E의 첫 두 실행에서 각각 local HTTP Secure-cookie 설정과 baseline의 의도적인 접수 비활성 기본값이 드러났다. local runner는 `APP_ENV=local`을 사용하도록 고쳤고, 공개 접수는 disposable E2E DB에서만 명시적으로 활성화했다. production baseline 기본값은 바꾸지 않았다. 세 번째 실행에서 80개가 모두 통과했다.

## Cleanup 보호

cleanup route 등록 조건은 `APP_ENV !== prod`와 `E2E_CLEANUP_ENABLED === true`의 논리곱이다. production에서는 flag 값과 무관하게 route 자체가 404다. 삭제 대상은 `testing-` marker나 그 marker에 연결된 row로 제한하며, ID 기반 fixture teardown 후 prefix 기반 fallback을 실행한다. suite 종료 후 preview가 0이 아니면 실패한다.

## 원격 UAT 결과

운영 Neon database/schema와 저장소 `.env`를 사용하지 않고 다음 고유 자원만 만들었다.

- Neon branch: `room-reservation-p4-uat-20260721-01`
- 빈 database: `room_reservation_p4_uat_20260721`
- 전용 owner role: `room_reservation_p4_validator`
- Worker: `room-reservation-p4-uat-20260721-01`
- Worker version: `bbf656d5-f182-4623-86e1-a1c6f4793e11`
- Pages preview branch: `p4-worker-20260721`
- Pages deployment: `9dd43bbb-fda1-4b40-9246-5fb551e2036a`

direct Neon URL은 migration shell에만 주입했고 pooled URL과 임의 UAT 관리자 자격 증명은 Wrangler secrets file을 통해 주입했다. secret 값은 출력하거나 저장소 파일에 기록하지 않았다. `npm.cmd run migrate`와 이중 guard가 있는 `npm.cmd run uat:prepare`가 database 이름, owner role, 제품 row 0건을 확인한 뒤 해당 disposable DB에서만 예약 접수를 활성화했다.

Worker는 route/custom domain/production target 없이 version preview alias만 만들었다. Pages는 기존 프로젝트의 새 preview deployment만 사용했고 production `BACKEND_ORIGIN`은 전후 동일했다. Wrangler 4.112.0이 배포 중 project-level preview `BACKEND_ORIGIN`을 일시적으로 Worker alias로 바꾼 사실을 해시 비교로 발견했다. E2E 후 직전 preview deployment `19402ea5-0d60-467d-a488-1883569db9d8`의 Cloudflare API snapshot 값을 사용해 preview 설정만 정확히 복원했고, production 값 불변과 preview `NODE_VERSION` 보존을 다시 확인했다. 값 자체는 문서나 로그에 남기지 않았다.

`P4_UAT_CONFIRM_DISPOSABLE=true`와 deployment-specific Pages URL을 모두 요구하는 runner로 same-origin 전체 E2E를 실행했다. 80/80이 4.9분에 통과했고 after-suite cleanup은 reservation 4건과 recurrence 4건을 삭제했다. 최종 preview는 reservations/recurrences/tags/rooms 모두 0이었다.

검증 후 exact Pages deployment와 exact Worker를 삭제했다. Neon console에서 exact branch를 삭제해 내부 database와 role도 함께 제거했고 branch 목록에서 이름이 0건임을 확인했다. 연결 URL, role password, UAT 관리자 비밀번호와 Pages 복원값을 담았던 OS 임시 파일 6개도 삭제해 잔여 0건을 확인했다. 기존 production Neon branch/DB, Render, production Pages deployment/domain은 변경하지 않았다.

## 재사용과 별도 후속

P4에서 그대로 사용하는 부분은 core/service/HTTP/Neon adapter, baseline V1, migration/검증 script와 React 비밀번호 제한이다. `local-server.ts`, local Docker runner는 검증 adapter이며 production bundle에 포함하지 않는다.

별도 Go-Live 작업에는 clean commit의 Worker/Pages artifact receipt 고정, production DB 초기화 계획, backup/rollback rehearsal, Render → Worker 연결 전환, rate limit과 인증된 Pages→Worker client-IP 경계가 남는다. rate limit이 완료될 때까지 실제 공개 예약 접수를 활성화하지 않는다.
