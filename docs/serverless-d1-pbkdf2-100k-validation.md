# Cloudflare Workers PBKDF2 100,000회 원격 재검증

검증일: 2026-07-21 (Asia/Seoul)

대상 브랜치: `codex/serverless-migration-contract`

## 목적과 범위

이 검증은 600,000회 원격 probe 결과의 원인을 분리하기 위해 사용자 요청에 따라 PBKDF2-HMAC-SHA256을 100,000회로 낮춰 한 번 더 실행한 진단이다. 100,000회를 제품 보안 정책으로 채택하거나 기존 600,000회 결정을 변경하지 않는다. D1, Pages, route, custom domain, DNS, 요금제와 기존 제품 코드는 변경하지 않았다.

> **P3 최종 제품 결정 (2026-07-21):** PBKDF2 100,000회와 600,000회를 모두 제품값으로 채택하지 않는다. D1 채택은 취소했고 공개 예약 비밀번호는 printable ASCII 4~64자와 Neon `pgcrypto` bcrypt cost 12를 사용한다.

## 핵심 정정

이전 문서의 “인증 없는 요청은 401로 즉시 거부”는 PBKDF2 600,000회 거부가 아니다. probe Worker가 `Authorization` header가 없는 요청을 PBKDF2 실행 전에 의도적으로 거부하는 대조군이다.

이번에 status를 보존하도록 runner를 고친 결과도 이를 확인했다.

- Worker 코드에 도달한 preview URL의 무인증 대조 요청: HTTP 401, `UNAUTHORIZED`
- 같은 URL의 올바르게 인증된 100,000회 요청 90건: HTTP 200 90건

Cloudflare의 Workers Web Crypto 문서는 PBKDF2 `deriveBits()`를 지원 알고리즘으로 명시하지만, 100,000회를 최대 반복 횟수로 문서화하지 않는다. 따라서 “100,000회가 Cloudflare의 공식 최대값”으로 결론 내릴 근거는 없다. 이번 값은 진단 입력이다. [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)

## workers.dev 404 원인

계정의 workers.dev 활성 상태를 공식 API로 조회한 결과 `enabled=false`였다. 첫 100,000회 시도에서 Wrangler가 출력한 workers.dev URL로 보낸 무인증 요청과 인증 요청이 모두 HTTP 404였고, Worker 응답 body가 없었다. 이는 반복 횟수나 probe token 검사가 아니라 Worker 진입 전 routing 실패다.

기존 계정 설정을 켜거나 route를 만들지 않았다. 대신 이 disposable Worker에만 `workers_dev=false`, `preview_urls=true`를 적용하고 version preview URL에서 재검증했다. Cloudflare 공식 문서에 따르면 workers.dev가 꺼져 있으면 preview URL도 기본적으로 꺼지지만 Worker별로 명시적 활성화할 수 있다. [workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)

이 발견 때문에 이전 600,000회 실행의 “HTTP 성공 0건”을 PBKDF2 또는 Workers Free CPU 실패의 근거로 사용할 수 없다. 그 실행은 exact status를 보존하지 않았고 동일한 workers.dev 진입 방식을 사용했다. 600,000회는 도달 가능한 endpoint에서 다시 검증하기 전까지 원격 결과 미확정이다.

## 최소 PoC 구조

- `remote/pbkdf2-100k-worker.ts`: 진단 전용 Web Crypto PBKDF2 Worker
- `wrangler.pbkdf2-100k.jsonc`: route 없는 version preview 전용 설정
- `tests/remote-pbkdf2-100k-worker.test.ts`: 인증 경계와 hash/verify 의미의 local workerd 계약 테스트
- 실행 시 생성한 probe token, 임의 password, salt와 예상 digest는 메모리와 임시 secret file에서만 사용
- 응답에는 password, salt, digest와 token을 포함하지 않음
- 임시 secret file과 disposable Worker는 실행 종료 시 삭제

## 원격 결과

최종 실행 Worker: `room-reservation-p3-pbkdf2-100k-4a2b8a8c` (삭제 완료)

| 작업 | 요청 | HTTP 200 | 의미 검증 성공 | client wall p50 | p95 | 최대 |
|---|---:|---:|---:|---:|---:|---:|
| hash | 30 | 30 | 30 | 188.603 ms | 199.158 ms | 328.499 ms |
| 정상 verify | 30 | 30 | 30 | 187.729 ms | 224.639 ms | 415.085 ms |
| 오류 verify | 30 | 30 | 30 | 185.853 ms | 294.324 ms | 316.946 ms |

- 인증 없는 대조 요청: HTTP 401, `UNAUTHORIZED`
- hash: PBKDF2 1회 완료를 30/30 확인
- 정상 verify: 예상 digest와 constant-time 비교가 `true`인 것을 30/30 확인
- 오류 verify: 잘못된 password의 비교 결과가 `false`인 것을 30/30 확인
- 5xx와 1102: 0건

Worker 내부 `performance.now()` 차이는 90건 모두 0 ms였다. 이 값은 CPU가 0 ms라는 뜻이 아니며 CPU 판정 자료로 사용하지 않는다. client wall time도 네트워크 시간을 포함하므로 Workers CPU time의 대체 지표가 아니다.

## CPU telemetry 제한

Cloudflare 공식 문서상 version preview URL은 Workers Logs, Wrangler Tail과 Logpush를 지원하지 않는다. 계정 전체 workers.dev 설정을 바꾸지 않는 안전한 검증 경로를 선택했으므로 이번 성공 실행에서는 공식 `cpuTime` 표본을 얻을 수 없었다. [Preview URL limitations](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/#limitations)

Workers Free의 HTTP 요청당 CPU 한도는 10 ms다. 100,000회 요청이 90/90 완료된 사실은 현재 원격 런타임에서 실행 가능함을 증명하지만, 공식 CPU 분포나 한도 여유를 증명하지는 않는다. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## 시도와 정리

| 시도 | 결과 | 생성 자원 정리 |
|---|---|---|
| workers.dev 직접 URL | 무인증·인증 요청 모두 404; 계정 workers.dev 비활성 확인 | `room-reservation-p3-pbkdf2-100k-20260721-042322` 삭제 |
| 존재하지 않는 Worker에 preview version 직접 upload | Wrangler가 실행 전 거부 | 생성 자원 없음 |
| route 없는 Worker 생성 후 secret-bound preview version upload | 인증된 90/90 성공 | `room-reservation-p3-pbkdf2-100k-4a2b8a8c` 삭제 |

최종 재조회 결과 `room-reservation-p3-*` Worker 0개, D1 0개다. 기존 Pages, Worker, D1, route, domain, DNS, billing과 account-wide workers.dev 설정은 변경하지 않았다.

## 판정

| 항목 | 판정 | 근거 |
|---|---|---|
| 100,000회 Worker 런타임 호환성 | PASS | 인증된 hash/verify 90/90 HTTP 200 및 의미 일치 |
| 인증 경계 | PASS | 무인증 요청만 PBKDF2 전에 401 |
| “100,000회가 공식 최대” 주장 | 미확인 | 공식 Web Crypto 문서에 최대 반복 횟수 기재 없음 |
| Workers Free CPU 적합성 | 미확정 | preview URL의 공식 Tail/Logs 미지원 |
| 기존 600,000회 원격 적합성 | 미확정 | 이전 endpoint routing 문제를 분리한 도달 가능 재실행이 필요 |
| 600,000회 제품 보안 정책 | 변경 없음 | 이번 100,000회는 진단 전용 |
| 원격 D1 단계 진행 | 중단 유지 | 기존 gate인 600,000회와 공식 CPU 근거를 충족하지 않음 |

## P4 영향

- 재사용 가능: Web Crypto PBKDF2 호출, constant-time 비교, secret binding, 인증 선검사 구조
- 진단 전용으로 폐기: 100,000회 상수, preview probe endpoint와 Wrangler 설정
- P4 전에 필요한 결정: 도달 가능한 비운영 Worker route에서 600,000회와 공식 CPU telemetry를 다시 측정하거나, Workers Paid 또는 별도 신뢰 경계에서 password hash를 처리하는 아키텍처를 선택
- 이번 결과만으로 D1 채택이나 P4 전체 백엔드 재작성을 시작하지 않음

## 실행한 검증

```text
npm.cmd run check
  PASS

npm.cmd test -- --disableConsoleIntercept
  Test Files 6 passed (6)
  Tests 14 passed (14)

npx.cmd wrangler deploy --config wrangler.pbkdf2-100k.jsonc --dry-run --outdir dist-pbkdf2-100k
  PASS, 2.62 KiB / gzip 1.06 KiB

remote version preview probe
  unauthenticated: 401 UNAUTHORIZED
  authenticated hash: 30/30 HTTP 200 and semantic success
  authenticated valid verify: 30/30 HTTP 200 and semantic success
  authenticated invalid verify: 30/30 HTTP 200 and semantic success

post-cleanup resource query
  room-reservation-p3-* Workers: 0
  room-reservation-p3-* D1: 0
```

실제 secret, 계정 ID, 사용자 이메일, password, salt, digest, OAuth token, raw Tail/HTTP body, `.env`, `.wrangler`와 빌드 산출물은 저장소에 기록하지 않았다.
