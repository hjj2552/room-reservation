# Worker Go-Live 전 rate limit과 Pages 신뢰 경계 검증

검증일: 2026-07-23, 세션 DB 앞단 보강 2026-07-24

브랜치: `codex/serverless-migration-contract`

범위: P4 이후 Go-Live 전 rate limit과 Pages→Worker client-IP 신뢰 경계

## 판정

Workers Rate Limiting binding 세 개와 Pages `API_BACKEND` Service Binding 구조를 채택한다. 기존 Spring의 120/24 제품 정책, 인증 관리자의 READ/WRITE 우회와 429 외부 계약을 유지하면서, 모든 API 요청에 세션 DB 보호용 INGRESS 600/분 안전 상한을 먼저 적용한다. 공개 Worker ingress 없이 Pages가 전달한 client IP만 신뢰할 수 있음을 local contract test와 disposable Cloudflare/Neon UAT에서 확인한다.

이 작업은 실제 전환이 아니다. production Worker, production Pages binding/variable/deployment, production Neon, Render, DNS, route와 공개 예약 접수는 변경하지 않았다. production Worker는 검증 종료 시점에도 존재하지 않는다.

## 최종 구조

### Rate limit

정확히 다음 세 binding만 사용한다.

| binding | 대상 | 수치 | UAT namespace | production namespace |
| --- | --- | --- | --- | --- |
| `INGRESS_GUARD_RATE_LIMITER` | 인증 여부와 무관한 모든 `/api/**` | IP별 600/60초 | `2026072305` | `2026072306` |
| `PUBLIC_READ_RATE_LIMITER` | 인증 관리자가 아닌 `GET /api/**` | IP별 120/60초 | `2026072301` | `2026072303` |
| `PUBLIC_WRITE_RATE_LIMITER` | 인증 관리자가 아닌 비GET `/api/**` | IP별 24/60초 | `2026072302` | `2026072304` |

여섯 namespace는 서로 다른 양의 정수 문자열이다. UAT에서는 UAT namespace만 실제 호출한다. production namespace는 source config에 예약하지만 production Worker를 배포하지 않으므로 원격 production binding은 생성하거나 변경하지 않는다. local, unit, CI와 local 전체 E2E는 allow/fake adapter를 사용하고 원격 namespace를 호출하지 않는다.

인증된 관리자도 INGRESS는 우회하지 않고 기존 제품 정책인 READ/WRITE만 우회한다. 비인증 관리자 API는 INGRESS 이후 공개 요청과 같은 READ/WRITE limiter를 사용한다. `/health`는 `/api/**` 밖이라 제외한다. INGRESS 600은 위조 session cookie로 인한 세션 DB 조회를 제한하는 인프라 안전 상한이며 새로운 제품 정책이 아니다. 세션 발급·로그인·예약 비밀번호·경로별 limiter, WAF, Neon table, Durable Objects, KV와 isolate-local counter는 사용하지 않는다.

초과 응답은 다음으로 고정한다.

- HTTP 429
- `Retry-After: 60`
- `RATE_LIMIT_EXCEEDED`
- `Too many requests. Please retry later.`
- `details.retryAfterSeconds = 60`
- 기존 공통 오류 body와 `path`
- `X-RateLimit-Remaining` 추정 없음

Cloudflare 공식 문서상 Workers Rate Limiting은 Cloudflare 위치별이고 permissive/eventually consistent하다. 따라서 exact 600/601, 120/121과 24/25는 deterministic fake contract test로 검증하고, 원격에서는 차단 발생과 60초 후 복구를 검증했다. 이 제한은 남용 완화 목적이며 정확한 전역 accounting 또는 과금 제한이 아니다. [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

### Pages→Worker 신뢰 경계

브라우저의 relative `/api`와 Pages Function proxy를 유지한다. Worker target의 전송 선택은 다음과 같다.

- `API_PROXY_TRANSPORT=service-binding`
- Pages Service Binding `API_BACKEND`
- backend Worker는 `workers_dev=false`, `preview_urls=false`, route/custom domain 없음
- 공개 `BACKEND_ORIGIN` fallback 없음

Pages Function은 사용자가 보낸 `X-Forwarded-For`와 `X-Room-Reservation-Client-IP`를 모두 제거한다. Pages ingress의 `CF-Connecting-IP`만 `X-Room-Reservation-Client-IP`로 덮어쓰고 `API_BACKEND.fetch()`로 전달한다. 공개 ingress가 없는 Worker만 이 header를 신뢰하므로 HMAC이나 proxy secret은 추가하지 않는다. local/전환기의 `backend-origin` mode는 명시 선택할 때만 사용할 수 있고 자동 fallback은 없다. Cloudflare는 Service Binding이 secret 없이 Worker 간 호출 권한을 제공한다고 문서화한다. [Pages Service bindings](https://developers.cloudflare.com/pages/functions/bindings/), [Workers bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)

### 애플리케이션 경계와 순서

- core/application port: `RateLimiter`, `ClientIpProvider`
- Cloudflare adapter: 세 `RateLimit` binding과 Pages 소유 내부 header
- Pages adapter: `API_BACKEND` `Fetcher`, ingress IP header 정제

`/api` 처리 순서는 신뢰 IP 확인 → INGRESS limiter → 정상 형식 session cookie만 session 조회 → 관리자 판정 → 비관리자 READ/WRITE limiter → 기존 CSRF → body/password/Neon이다. INGRESS 거부·장애 시 session lookup 자체가 호출되지 않는다.

`ROOM-SESSION`은 현재 발급 규칙인 32바이트 난수의 padding 없는 base64url, 즉 43자 `[A-Za-z0-9_-]`만 DB 조회 후보로 인정한다. 형식 오류 cookie는 존재하지 않는 세션처럼 처리한다. 공격자가 같은 형식의 임의 token을 만들 수 있으므로 이 검사는 INGRESS를 대체하지 않는 보조 방어다.

신뢰 IP가 없거나 binding 호출이 실패하면 `RATE_LIMIT_UNAVAILABLE` 503으로 fail closed하며 session 조회, ProductService, Neon과 bcrypt에 도달하지 않는다. 구조화 로그에는 event, policy, path, method와 environment만 남기며 IP, session token/hash, password와 CSRF token 원문을 남기지 않는다.

## 자동 검증

| 검증 | 결과 |
| --- | --- |
| Worker TypeScript와 namespace/config guard | 통과 |
| Worker unit/contract | 3 files, 21 tests 통과 |
| exact INGRESS 600/601과 IP별 bucket 분리 | 통과 |
| exact GET 120/121 | 통과 |
| exact 비GET 24/25 | 통과 |
| INGRESS/READ/WRITE와 IP별 bucket 분리 | 통과 |
| 인증 관리자 INGRESS 적용과 READ/WRITE 우회 | 통과 |
| 비인증 관리자 제한, `/health` 제외 | 통과 |
| 429 body/header/path | 통과 |
| 형식 오류 session cookie DB lookup 없음 | 통과 |
| INGRESS 거부에서 session/ProductService/Neon/bcrypt 미도달 | 통과 |
| INGRESS binding 오류·IP 누락 fail closed와 session lookup 0회 | 통과 |
| IP·session cookie 원문 로그 부재 | 통과 |
| Pages forged forwarding/internal header 제거 | 통과 |
| Pages ingress IP 전용 header 덮어쓰기 | 통과 |
| Service Binding path/query/method/body/cookie/CSRF/Set-Cookie 보존 | 통과 |
| service-binding mode의 `BACKEND_ORIGIN` fallback 없음 | 통과 |
| Pages Function tests | 11/11 통과 |
| isolated PostgreSQL/baseline replay | 22/22, schema SHA-256 `41b0677905dd2cf45e1b5c4dbb5a13903c74cc79d27c4970fa8c3c0e97bfd5ea` |
| Worker dry-run | 365.72 KiB, gzip 89.50 KiB; 세 binding 인식 |
| React production build | 통과 |
| local Worker 전체 React E2E | 80/80, 종료 후 잔여 0건 |
| 기존 Spring backend | 93/93 통과 |
| 기존 Spring 전체 React E2E | 80/80, 종료 후 잔여 0건 |
| frontend audit | high 이상 0; React Router moderate 2건, `npm audit fix` 가능하나 ingress 범위에서는 미적용 |
| Worker audit | `sharp` 0.35.3 override 후 0 vulnerability |

최종 clean-install 후 local 전체 E2E 첫 실행은 제품 동작과 무관한 hover locator timeout 1건으로 79/80이었고 cleanup residual은 0건이었다. 즉시 전체 재실행해 80/80과 residual 0건을 확인했다.

2026-07-24 INGRESS 최종 회귀에서도 첫 Worker E2E 실행 중 frontend dev server가 종료되어 이후 요청이 `ECONNREFUSED`로 실패했지만 after-suite cleanup과 residual 0건은 완료됐다. 동일 명령을 즉시 재실행해 80/80과 residual 0건을 확인했다. Spring test 첫 실행의 86개 실패도 CI용 PostgreSQL이 로컬에 없어서 발생했고, CI와 같은 일회용 PostgreSQL 16을 준비한 재실행은 93/93 통과했다.

`npm audit`가 Wrangler/Miniflare의 개발 의존성 `sharp` 0.34 계열에 새 high advisory 4건을 보고했다. runtime 제품 의존성을 바꾸지 않고 patched `sharp` 0.35.3을 override로 고정해 lockfile을 갱신한 뒤 audit, Worker test와 build를 재검증한다.

CI의 기존 `Worker validation`은 `npm ci`, `npm run check`, `npm test`, isolated PostgreSQL, dry-run build와 audit을 실행하므로 새 namespace guard와 rate-limit contract test가 필수 경로에 포함된다. `Frontend E2E against Worker`는 Pages proxy test와 local 전체 React E2E를 계속 실행한다. 기존 Spring/Java job은 유지한다.

## 2026-07-23 Disposable UAT

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

## 2026-07-24 INGRESS Disposable UAT

사용한 고유 자원:

- Neon branch: `room-reservation-ingress-uat-20260724-01`
- Neon branch ID: `br-super-mouse-ao7rpqvm`
- 빈 DB: `room_reservation_ingress_uat_20260724`
- branch 전용 role: `room_reservation_ingress_validator`
- UAT Worker: `room-reservation-worker-uat`
- 최종 secret 적용 Worker version: `203947b4-bf82-4a9d-a211-eb4ee70733c2`
- Pages branch: `ingress-uat-20260724`
- 성공 Pages deployment: `14fb620a-b44b-4a9f-8008-13bf09d3b393`
- 설정 복원 Pages deployment: `1f16494d-92ed-493f-96c2-34f4b268e5e9`
- binding 설정 오류로 publish되지 않은 실패 deployment: `ecd06fba-fcbe-4b12-9ede-2865ba71bba6`

새 빈 DB에 baseline V1을 단독 적용했고 endpoint, DB와 owner role, product row 0건을 확인한 뒤 UAT에서만 예약 접수를 활성화했다. Worker는 세 UAT namespace `2026072305`, `2026072301`, `2026072302`만 사용했고 `No targets deployed` 상태라 workers.dev, preview URL, route와 custom domain을 만들지 않았다. production namespace `2026072306`, `2026072303`, `2026072304`는 호출하지 않았다.

실제 외부 UAT 결과:

- Pages preview → `API_BACKEND` Service Binding → UAT Worker → disposable Neon 경로: 통과
- 인증 관리자 session으로 빠른 burst를 보낸 결과 900건까지 시도한 batch 안에서 실제 INGRESS 429 관찰
- 정확히 601번째 차단이라고 주장하지 않음
- 429 body, `RATE_LIMIT_EXCEEDED`, `Retry-After: 60`, `details.retryAfterSeconds=60`: 통과
- 인증 관리자도 INGRESS 적용 대상임을 확인
- 사용자가 보낸 `X-Forwarded-For`와 `X-Room-Reservation-Client-IP`로 포화 bucket을 바꾸지 못해 신뢰 IP 경계 확인
- 60초 window 경과 후 GET 200으로 복구 확인
- direct DB residual: reservations/recurrences/tags/일반 rooms/histories 모두 0

Ingress 차단 이전에 세션 DB 조회가 발생하지 않는 호출 순서는 deterministic contract test로 검증했다. 원격 UAT에서는 내부 DB 호출 횟수를 직접 계측하지 않았으며, 실제 Cloudflare ingress 제한·429 응답·관리자 적용·신뢰 IP 경계·복구 동작을 검증했다.

정리 결과:

- Pages deployment 3개: 위 exact ID로 삭제, `ingress-uat-20260724` 잔여 0개
- Pages project config: Wrangler 생성 시각 주석을 제외한 canonical SHA-256 전후 동일, `7590e9a6686f7ebe860fc4105b639633e8c397b2a6e2758c81ef2de3dbb1a320`
- UAT Worker: exact name 삭제, 재조회 `10007 does not exist`
- Neon branch: exact ID 삭제, production branch `br-aged-moon-ao6b97zp` 1개만 유지
- branch 전용 DB와 role: branch 삭제로 함께 제거
- 임시 connection/admin/config 파일과 디렉터리: exact path로 삭제
- production Pages deployment/domain/config, production Worker, production Neon, Render, DNS, route와 secret: 변경 없음

Cloudflare Rate Limiting binding은 위치별이고 permissive/eventually consistent하므로 이 원격 결과는 정확한 전역 600 카운터나 특정 요청 번호를 증명하지 않는다. 분산 공격과 Workers 일일 요청 한도를 완전히 해결하는 수단도 아니다. WAF와 추가 기능별 limiter는 도입하지 않았다.

## Go-Live 상태

rate-limit 구현과 disposable UAT gate는 완료됐다. 그러나 실제 공개 예약 접수 활성화 조건은 아직 충족되지 않았다. 별도 전환 작업에서 다음을 완료해야 한다.

1. clean commit의 Worker/Pages artifact와 baseline receipt 고정
2. production DB 초기화·backup/rollback rehearsal
3. production Worker secrets와 source에 예약된 production INGRESS/READ/WRITE namespace 적용
4. production Pages에 `API_PROXY_TRANSPORT=service-binding`과 `API_BACKEND` 적용
5. production Worker의 public ingress 부재와 production smoke 확인
6. Render→Worker 전환 후 Spring 전용 인프라 정리
7. frontend React Router moderate advisory 2건의 지원 버전 업데이트와 E2E 재검증

위 작업 전에는 production Pages, Render와 공개 예약 접수 상태를 바꾸지 않는다.
