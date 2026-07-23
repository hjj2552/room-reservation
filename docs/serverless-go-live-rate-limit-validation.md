# Worker Go-Live 전 rate limit과 Pages 신뢰 경계 검증

검증일: 2026-07-23

브랜치: `codex/serverless-migration-contract`

범위: P4 이후 Go-Live 전 rate limit과 Pages→Worker client-IP 신뢰 경계

## 판정

Workers Rate Limiting binding 두 개와 Pages `API_BACKEND` Service Binding 구조를 채택한다. 기존 Spring의 120/24 정책, 인증 관리자 우회와 429 외부 계약을 Worker에서 구현할 수 있고, 공개 Worker ingress 없이 Pages가 전달한 client IP만 신뢰할 수 있음을 local contract test와 disposable Cloudflare/Neon UAT에서 확인했다.

이 작업은 실제 전환이 아니다. production Worker, production Pages binding/variable/deployment, production Neon, Render, DNS, route와 공개 예약 접수는 변경하지 않았다. production Worker는 검증 종료 시점에도 존재하지 않는다.

## 최종 구조

### Rate limit

정확히 다음 두 binding만 사용한다.

| binding | 대상 | 수치 | UAT namespace | production namespace |
| --- | --- | --- | --- | --- |
| `PUBLIC_READ_RATE_LIMITER` | 인증 관리자가 아닌 `GET /api/**` | IP별 120/60초 | `2026072301` | `2026072303` |
| `PUBLIC_WRITE_RATE_LIMITER` | 인증 관리자가 아닌 비GET `/api/**` | IP별 24/60초 | `2026072302` | `2026072304` |

네 namespace는 서로 다른 양의 정수 문자열이다. UAT에서는 UAT 두 namespace만 실제 호출했다. production 두 namespace는 source config에 예약했지만 production Worker를 배포하지 않았으므로 원격 production binding은 생성하거나 변경하지 않았다. local, unit, CI와 local 전체 E2E는 allow/fake adapter를 사용하고 네 원격 namespace를 호출하지 않는다.

인증된 관리자는 모든 limiter를 우회한다. 비인증 관리자 API는 공개 요청과 같은 limiter를 사용한다. `/health`는 `/api/**` 밖이라 제외한다. 세션·로그인·예약 비밀번호별 limiter, WAF, Neon table, Durable Objects, KV와 isolate-local counter는 사용하지 않는다.

초과 응답은 다음으로 고정한다.

- HTTP 429
- `Retry-After: 60`
- `RATE_LIMIT_EXCEEDED`
- `Too many requests. Please retry later.`
- `details.retryAfterSeconds = 60`
- 기존 공통 오류 body와 `path`
- `X-RateLimit-Remaining` 추정 없음

Cloudflare 공식 문서상 Workers Rate Limiting은 Cloudflare 위치별이고 permissive/eventually consistent하다. 따라서 exact 120/121과 24/25는 deterministic fake contract test로 검증하고, 원격에서는 차단 발생과 60초 후 복구를 검증했다. 이 제한은 남용 완화 목적이며 정확한 전역 accounting 또는 과금 제한이 아니다. [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

### Pages→Worker 신뢰 경계

브라우저의 relative `/api`와 Pages Function proxy를 유지한다. Worker target의 전송 선택은 다음과 같다.

- `API_PROXY_TRANSPORT=service-binding`
- Pages Service Binding `API_BACKEND`
- backend Worker는 `workers_dev=false`, `preview_urls=false`, route/custom domain 없음
- 공개 `BACKEND_ORIGIN` fallback 없음

Pages Function은 사용자가 보낸 `X-Forwarded-For`와 `X-Room-Reservation-Client-IP`를 모두 제거한다. Pages ingress의 `CF-Connecting-IP`만 `X-Room-Reservation-Client-IP`로 덮어쓰고 `API_BACKEND.fetch()`로 전달한다. 공개 ingress가 없는 Worker만 이 header를 신뢰하므로 HMAC이나 proxy secret은 추가하지 않는다. local/전환기의 `backend-origin` mode는 명시 선택할 때만 사용할 수 있고 자동 fallback은 없다. Cloudflare는 Service Binding이 secret 없이 Worker 간 호출 권한을 제공한다고 문서화한다. [Pages Service bindings](https://developers.cloudflare.com/pages/functions/bindings/), [Workers bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)

### 애플리케이션 경계와 순서

- core/application port: `RateLimiter`, `ClientIpProvider`
- Cloudflare adapter: 두 `RateLimit` binding과 Pages 소유 내부 header
- Pages adapter: `API_BACKEND` `Fetcher`, ingress IP header 정제

`/api` 처리 순서는 신뢰 IP 확인 → session cookie가 있을 때만 session 조회 → 관리자 판정·우회 → READ/WRITE limiter → 기존 CSRF → body/password/Neon이다. cookie가 없는 공개 요청은 rate limit 때문에 Neon session lookup을 추가하지 않는다.

신뢰 IP가 없거나 binding 호출이 실패하면 `RATE_LIMIT_UNAVAILABLE` 503으로 fail closed하며 ProductService, Neon과 bcrypt에 도달하지 않는다. 구조화 로그에는 event, policy, path와 method만 남기며 IP, session token, password와 CSRF token 원문을 남기지 않는다.

## 자동 검증

| 검증 | 결과 |
| --- | --- |
| Worker TypeScript와 namespace/config guard | 통과 |
| Worker unit/contract | 3 files, 14 tests 통과 |
| exact GET 120/121 | 통과 |
| exact 비GET 24/25 | 통과 |
| READ/WRITE와 IP별 bucket 분리 | 통과 |
| 인증 관리자 120회 초과 우회 | 통과 |
| 비인증 관리자 제한, `/health` 제외 | 통과 |
| 429 body/header/path | 통과 |
| no-cookie session lookup 없음 | 통과 |
| 초과 요청에서 ProductService/Neon/bcrypt 미도달 | 통과 |
| binding 오류·IP 누락 fail closed | 통과 |
| IP 원문 로그 부재 | 통과 |
| Pages forged forwarding/internal header 제거 | 통과 |
| Pages ingress IP 전용 header 덮어쓰기 | 통과 |
| Service Binding path/query/method/body/cookie/CSRF/Set-Cookie 보존 | 통과 |
| service-binding mode의 `BACKEND_ORIGIN` fallback 없음 | 통과 |
| Pages Function tests | 11/11 통과 |
| isolated PostgreSQL/baseline replay | 22/22, schema SHA-256 `41b0677905dd2cf45e1b5c4dbb5a13903c74cc79d27c4970fa8c3c0e97bfd5ea` |
| Worker dry-run | 364.98 KiB, gzip 89.36 KiB; 두 binding 인식 |
| React production build | 통과 |
| local Worker 전체 React E2E | 80/80, 종료 후 잔여 0건 |
| frontend audit | 0 vulnerability |
| Worker audit | `sharp` 0.35.3 override 후 0 vulnerability |

최종 clean-install 후 local 전체 E2E 첫 실행은 제품 동작과 무관한 hover locator timeout 1건으로 79/80이었고 cleanup residual은 0건이었다. 즉시 전체 재실행해 80/80과 residual 0건을 확인했다.

`npm audit`가 Wrangler/Miniflare의 개발 의존성 `sharp` 0.34 계열에 새 high advisory 4건을 보고했다. runtime 제품 의존성을 바꾸지 않고 patched `sharp` 0.35.3을 override로 고정해 lockfile을 갱신한 뒤 audit, Worker test와 build를 재검증한다.

CI의 기존 `Worker validation`은 `npm ci`, `npm run check`, `npm test`, isolated PostgreSQL, dry-run build와 audit을 실행하므로 새 namespace guard와 rate-limit contract test가 필수 경로에 포함된다. `Frontend E2E against Worker`는 Pages proxy test와 local 전체 React E2E를 계속 실행한다. 기존 Spring/Java job은 유지한다.

## Disposable UAT

사용한 고유 자원:

- Neon branch: `room-reservation-rate-limit-uat-20260723-01`
- Neon branch ID: `br-long-cake-aoxu5k85`
- 빈 DB: `room_reservation_rate_limit_uat_20260723`
- UAT Worker: `room-reservation-worker-uat`
- 최종 secret 적용 Worker version: `3ad1ee5c-98ad-43e7-923b-609e8b25350c`
- Pages branch: `rate-limit-uat-20260723`
- Pages deployment: `b2b0e574-4e7c-42ca-9f4c-85b73e1709d6`

UAT Worker는 `No targets deployed`로 확인했고 workers.dev, preview URL, route/custom domain을 만들지 않았다. Pages deployment만 `API_BACKEND`로 이 Worker를 호출했다. baseline guard는 expected endpoint, owner DB/role, 새 DB 이름과 product row 0건을 확인한 뒤에만 V1을 적용하고 UAT DB에서만 예약 접수를 활성화했다.

Pages preview 배포 메타데이터의 source는 당시 HEAD `0737793`이었고 구현 변경은 아직 working tree에 있었다. 따라서 이 UAT는 현재 구현 후보의 동작을 검증하지만 final clean commit의 artifact provenance receipt는 아니다. clean commit과 동일한 Worker/Pages artifact 및 baseline receipt 고정은 아래 Go-Live 전환 작업의 별도 필수 조건으로 유지한다.

실제 UAT 결과:

- READ burst: 429 관찰. 한 실행에서는 261번째에 관찰
- WRITE burst: 429 관찰. 같은 실행에서 49번째에 관찰
- exact 경계를 원격 결과로 주장하지 않음
- 429 body와 `Retry-After: 60`: 통과
- 인증 관리자 125회: 모두 200
- 사용자가 보낸 `X-Forwarded-For`와 내부 IP header: 포화 bucket 변경 실패, 제거/덮어쓰기 확인
- 60초 후 READ: 200
- 60초 후 WRITE: 403 CSRF 단계까지 진행, 429가 아니므로 복구 확인
- shell egress READ bucket을 다시 포화한 직후 별도 browser egress의 SPA readiness: 성공, 실제 IP별 bucket 분리 확인
- Pages preview → Service Binding → UAT Worker → disposable Neon 전체 React E2E: 80/80
- after-suite cleanup: reservation 4, recurrence 4 삭제
- 최종 direct DB residual: reservations/recurrences/tags/일반 rooms/histories 모두 0

첫 관리자 secret 생성 시 로컬 PowerShell이 최신 정적 `RandomNumberGenerator.Fill` API를 지원하지 않는 사실을 감지했다. 당시 Worker에는 외부 target이 없었다. Pages를 연결하기 전에 호환 가능한 CSPRNG instance API로 secret을 즉시 회전했고, 회전된 값으로만 원격 검증했다. 값은 출력하거나 저장소에 기록하지 않았다.

## 정리와 production 불변

- UAT Pages deployment: exact ID 삭제
- Pages 설정 복원용 임시 deployment: exact ID 삭제
- 두 disposable Pages deployment 잔여: 0
- Pages project config: Wrangler 생성 시각 주석만 제외한 전체 값 canonical SHA-256 전후 동일, `7590e9a6686f7ebe860fc4105b639633e8c397b2a6e2758c81ef2de3dbb1a320`
- UAT Worker: exact name 삭제, 재조회 `10007 does not exist`
- production Worker: 작업 전후 존재하지 않음
- disposable Neon branch: exact ID 삭제
- Neon branch 목록: production 1개만 유지
- production Pages deployment/domain, production Neon branch/DB, Render, DNS/route: 변경 없음
- 임시 connection/admin/config 파일과 디렉터리: exact path로 삭제

## Go-Live 상태

rate-limit 구현과 disposable UAT gate는 완료됐다. 그러나 실제 공개 예약 접수 활성화 조건은 아직 충족되지 않았다. 별도 전환 작업에서 다음을 완료해야 한다.

1. clean commit의 Worker/Pages artifact와 baseline receipt 고정
2. production DB 초기화·backup/rollback rehearsal
3. production Worker secrets와 source에 예약된 production READ/WRITE namespace 적용
4. production Pages에 `API_PROXY_TRANSPORT=service-binding`과 `API_BACKEND` 적용
5. production Worker의 public ingress 부재와 production smoke 확인
6. Render→Worker 전환 후 Spring 전용 인프라 정리

위 작업 전에는 production Pages, Render와 공개 예약 접수 상태를 바꾸지 않는다.
