# Cloudflare Workers Free / 원격 D1 P3 후속 검증

검증일: 2026-07-21 (Asia/Seoul)

대상 브랜치: `codex/serverless-migration-contract`

범위: 기존 local D1 PoC의 원격 gate 검증. PBKDF2 gate를 가장 먼저 실행하고, 실패 시 D1을 만들지 않는 중단 순서를 적용했다. 제품 코드, 기존 Pages, route, domain, DNS, 운영 DB와 서버리스 마이그레이션 계약은 변경하지 않았다.

## 최종 판정

**D1 채택 보류**

PBKDF2-HMAC-SHA256 600,000회 원격 요청은 hash 30회, 정상 verify 30회, 잘못된 비밀번호 verify 30회 모두 HTTP 성공에 도달하지 못했다. 공식 Tail CPU 표본도 하나도 확보하지 못했으므로 Workers Free의 요청당 10 ms CPU 한도를 안정적으로 만족한다는 근거가 없다. 요청서의 중단 기준에 따라 PBKDF2 gate를 실패로 판정하고 원격 D1 생성, transaction 조사, 사용량 계측, 복구 검증으로 확대하지 않았다.

Cloudflare는 Workers Free HTTP 요청의 CPU limit을 10 ms로 명시하며, `exceededCpu`/1102와 공식 CPU time은 Workers Logs, Tail trace 또는 Analytics로 확인하도록 안내한다. wall time은 CPU time의 대체 근거가 아니다. [Workers CPU limits and monitoring](https://developers.cloudflare.com/workers/platform/limits/)

이번 결과는 D1 database 기능 자체의 실패가 아니라 **현재 600,000회 보안 계약과 Workers Free 실행 조합의 gate 실패 또는 미확정**이다. 정확한 실패 status와 공식 CPU outcome을 확보하지 못했으므로 `D1 + Workers Free 부적합`까지 단정하지 않고 채택을 보류한다. iteration을 낮추거나 보안 정책을 변경하지 않았다.

## Cloudflare account와 권한

`npx wrangler whoami`의 최초 결과는 미인증이었다. 공식 `wrangler login` OAuth 브라우저 절차를 사용자가 완료한 뒤 다시 확인했다.

- 로그인: OAuth token 인증 확인
- account membership: standard type의 단일 membership 확인
- account 표시명: 로그인 이메일 기반 개인 account 표시명 확인. 이메일과 account ID 전체값은 문서에 기록하지 않음
- token scope: account/user read, Workers script/tail write/read, D1 write, Pages write 등 검증에 필요한 범위 확인
- 기존 Pages: 현재 account에서 `room-reservation-jnunursing`을 읽기 전용으로 조회함
- Pages 소유 account 일치: 확인. 로그인 account에서 해당 프로젝트가 조회됨
- disposable Worker 생성·secret 등록·조회·삭제 권한: 실제 실행으로 확인
- D1 권한: OAuth scope에서 확인했지만 PBKDF2 gate 실패로 실제 D1 create/delete는 실행하지 않음
- Workers Free subscription: account subscription API는 현재 OAuth 권한/API에서 읽지 못해 별도 확인 불가. Paid 전환이나 결제 변경은 수행하지 않음

`whoami --json`의 account 설정에는 account-wide `enforce_twofactor=false`가 표시됐다. 이것은 현재 사용자의 개별 2FA 활성 여부를 뜻하지 않는다.

- 개인 사용자 2FA 활성 여부: 사용자 수동 확인 필요
- account-wide 2FA 강제: 비활성으로 조회됨
- 복구 가능한 별도 관리자 존재 여부: 사용자 수동 확인 필요
- 복구 이메일/복구 코드/비밀번호 상태: 조회하거나 변경하지 않음

## 생성 전 자원 목록

Cloudflare API와 Wrangler의 읽기 전용 목록을 사용했다. 생성 전 `room-reservation-p3-*` prefix의 Worker와 D1은 모두 0개였다. 기존 Pages 프로젝트는 1개가 조회됐으며 이름은 `room-reservation-jnunursing`이었다.

account ID와 OAuth token은 메모리에서만 API 호출에 사용했고 출력·파일·Git에 저장하지 않았다.

## PBKDF2 probe 설계

추가한 probe Worker는 기존 PoC와 같은 Web Crypto PBKDF2-HMAC-SHA256 600,000회 구현을 사용한다.

- workers.dev에만 배포
- route/custom domain/Pages 연결 없음
- `Authorization: Bearer <probe secret>`이 없으면 PBKDF2 실행 전에 401
- probe token, 임의 password, salt, 예상 digest는 실행 중 메모리에서 생성해 Worker secret으로만 등록
- 실제 관리자/예약 비밀번호를 사용하지 않음
- `/hash`: 새 random salt로 PBKDF2 1회
- `/verify-valid`: PBKDF2 1회 후 secret digest와 constant-time 비교
- `/verify-invalid`: 다른 password로 PBKDF2 1회 후 불일치 확인
- 응답에 password, hash, salt, digest, token을 포함하지 않음
- observability head sampling 100%, `wrangler tail --format json` 사용

Workers Web Crypto는 PBKDF2 `deriveBits()`를 지원한다. [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)

## PBKDF2 원격 결과

인증 없는 요청은 401로 즉시 거부됐다.

| 작업 | 요청 | HTTP 200 | 의미 검증 성공 | client wall p50 | p95 | 최대 | 첫 요청 |
|---|---:|---:|---:|---:|---:|---:|---:|
| hash | 30 | 0 | 0 | 146.68 ms | 155.93 ms | 171.61 ms | 171.61 ms |
| 정상 verify | 30 | 0 | 0 | 147.15 ms | 151.66 ms | 152.27 ms | 146.28 ms |
| 오류 verify | 30 | 0 | 0 | 146.39 ms | 152.76 ms | 171.47 ms | 145.57 ms |

합계 90/90 요청이 성공 응답에 도달하지 못했다. Worker가 응답 body에 기록하도록 한 내부 wall time도 성공 응답이 없어 얻지 못했다. 첫 요청과 이후 요청이 모두 실패했으므로 cold/warm 차이를 판정할 수 없다.

probe runner는 성공 수와 client wall time은 집계했지만 비성공 status 분포를 최종 요약에 포함하지 못했다. Worker가 이미 안전하게 삭제된 뒤 이 누락을 확인했으며, gate 실패 후 새 원격 자원을 만들지 않는 중단 규칙 때문에 재배포하지 않았다. 따라서 401/5xx/1102 중 정확한 비중은 미확인으로 남긴다.

### 공식 CPU telemetry

| 항목 | 결과 |
|---|---|
| Tail trace event | 0 |
| 공식 CPU sample | 0/90 |
| CPU p50/p95/max | 미확인 |
| `exceededCpu` outcome | 공식 event 부재로 미확인 |
| Error 1102 | client 오류 문자열에서 직접 확인되지 않았으나 공식 outcome 부재로 미확인 |
| GraphQL `workersInvocationsAdaptive` | 삭제 직후와 local test 이후 두 번 조회했으나 모두 0행; ingestion 지연 또는 telemetry 권한/가용성 때문에 근거로 사용 불가 |

Cloudflare 공식 문서는 Tail Workers/Logpush trace의 최상위 `cpuTime`/`wallTime`, Workers Logs 또는 GraphQL Workers metrics를 공식 측정 근거로 제시한다. [Real-time logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/), [Workers GraphQL metrics](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/)

공식 CPU telemetry가 없다는 사실 자체가 요청서의 실패 조건이다. 따라서 원인을 `exceededCpu`로 단정하지 않으며, 동시에 10 ms 한도 적합성을 추측해 통과시키지도 않는다.

### Gate 판정

**FAIL**

실패 근거:

1. 90개의 PBKDF2 요청이 반복적으로 HTTP 성공에 도달하지 못함
2. 600,000회 연산의 안정적 완료를 확인하지 못함
3. 공식 CPU telemetry p50/p95/max를 확보하지 못함
4. Workers Free 10 ms CPU 한도를 만족한다는 근거가 없음

iteration, hash algorithm, 보안 정책은 변경하지 않았다.

## 중단된 원격 D1 항목

PBKDF2 gate 실패 직후 다음 단계를 시작하지 않았다.

- 원격 D1/원격 D1 Worker 생성: 미실행
- remote migration/재적용/schema 동등성: 미실행
- 8-way concurrency 10회: 미실행
- remote batch commit/rollback: 미실행
- remote session/CSRF: 미실행
- 10개 공간/1,000건 예약 representative dataset: 미생성
- query별 `rows_read`, `rows_written`, duration, index plan: 미측정
- Spring write use case interactive transaction 분류: 조건 미충족으로 미실행
- export/import, 두 번째 D1, Time Travel restore: 미실행

따라서 실제 원격 `rows_read`/`rows_written` 값은 없고 기존 local 문서의 낮음·보통·피크 계산을 보정하지 않는다. 기존 피크 4.96M rows read/day 값은 여전히 가정 모델이며 원격 측정값으로 승격하지 않는다. D1 Free 사용량과 transaction/복구 가능성은 계속 미확정이다.

## Disposable 자원과 정리

다음 workers.dev 전용 Worker를 이번 작업에서 직접 만들었고 exact name으로 삭제했다.

| Worker | 실행 단계 | 삭제 |
|---|---|---|
| `room-reservation-p3-pbkdf2-20260721-024250` | 로컬 PowerShell 난수 API 호환 오류로 probe 전 중단 | 완료 |
| `room-reservation-p3-pbkdf2-20260721-024514` | PowerShell HTTP 옵션 호환 오류로 probe 전 중단; 등록된 secrets 포함 Worker 삭제 | 완료 |
| `room-reservation-p3-pbkdf2-20260721-024723` | 원격 PBKDF2 90회 gate 실행 | 완료 |

D1은 생성하지 않았다. 정리 후 다시 조회한 결과 `room-reservation-p3-*` Worker 0개, D1 0개였다. probe secret을 가진 Worker는 남지 않았다.

기존 `room-reservation-jnunursing` Pages 프로젝트는 정리 후에도 같은 account에서 조회됐다. Pages/route/custom domain/DNS/기존 Worker/D1에 대한 mutation 명령을 실행하지 않았으므로 이번 작업으로 인한 기존 자원 변경은 없다.

## Neon 대비 결론과 허용 가능한 다음 선택

이번 결과에서 비교할 다음 선택지는 요청서가 허용한 세 가지뿐이다.

1. **Worker + 새 Neon PostgreSQL**: 기존 Neon P3의 PostgreSQL 기능/driver 근거를 유지하되 조직 소유 account와 새 credential로 운영 소유권 문제를 해결한다. PBKDF2를 Worker에서 계속 실행한다면 동일 CPU gate는 별도로 해결해야 한다.
2. **Workers Paid**: 600,000회 계약을 유지한 원격 CPU 검증을 Paid limit에서 다시 수행한다. 이번 작업에서는 plan이나 billing을 변경하지 않았다.
3. **별도 승인을 받은 비밀번호 해싱 아키텍처 변경**: iteration 하향이 아니라 신뢰 경계와 저장/검증 흐름 자체를 별도 보안 검토와 승인 아래 변경한다.

D1 원격 기능은 이번 gate에서 평가되지 않았으므로 D1이 원자성/사용량/복구 측면에서 통과했다고 말할 수 없다. 현재 계약과 무료 실행 조건으로 P4 D1 backend 재작성은 진행 불가다.

## 사용 버전과 로컬 검증

- Wrangler `4.112.0`
- workerd `1.20260714.1`
- Miniflare `4.20260714.0`
- TypeScript `5.9.3`
- probe Worker dry-run: 2.60 KiB, gzip 1.05 KiB
- 원격 Worker 배포 target: workers.dev only

```text
npm run check
  PASS

npm test -- --disableConsoleIntercept
  Test Files 5 passed (5)
  Tests 12 passed (12)
  기존 local D1/동시성/rollback/session/time test 포함
  새 probe Worker 인증/hash/정상 verify/오류 verify contract test 포함

npx wrangler deploy --config wrangler.pbkdf2.jsonc --dry-run
  PASS, 2.60 KiB / gzip 1.05 KiB
```

secret, `.env`, `.wrangler`, `dist`, raw Tail/Analytics, export SQL은 커밋하지 않는다.
