# Deployment Checklist

Production은 Cloudflare Pages → `API_BACKEND` Service Binding → private Worker → Neon PostgreSQL 경로만 사용합니다. 실제 배포 식별자와 자격 증명은 저장소에 기록하지 않습니다.

## Required Worker configuration

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

Production Worker는 `workers.dev`, preview URL, route, custom domain을 만들지 않습니다. 세 rate-limit namespace는 서로 다른 production 전용 positive integer ID여야 합니다.

## Cloudflare Pages

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- `API_PROXY_TRANSPORT=service-binding`
- `API_BACKEND`: exact production Worker Service Binding
- `BACKEND_ORIGIN`: production에서는 설정하지 않음

브라우저는 상대 `/api/...` URL만 사용합니다. Pages Function은 browser가 보낸 `X-Forwarded-For`와 `X-Room-Reservation-Client-IP`를 제거하고 Pages ingress의 `CF-Connecting-IP`만 내부 header로 전달합니다.

## GitHub Actions secrets

실제 값은 모두 Repository Secrets에 저장합니다.

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT_NAME`
- `CLOUDFLARE_PRODUCTION_WORKER_NAME`
- `CLOUDFLARE_PRODUCTION_INGRESS_RATE_LIMIT_NAMESPACE_ID`
- `CLOUDFLARE_PRODUCTION_READ_RATE_LIMIT_NAMESPACE_ID`
- `CLOUDFLARE_PRODUCTION_WRITE_RATE_LIMIT_NAMESPACE_ID`
- `CLOUDFLARE_API_TOKEN`

공개 가능한 식별자도 portability와 log masking을 위해 Repository Variables나 committed configuration에 실제 값을 두지 않습니다. 명령 인자, artifact, cache, receipt와 log에도 운영 값을 출력하지 않습니다.

## CI and deployment order

`main` push에서 다음 순서를 지킵니다.

1. Worker validation과 disposable PostgreSQL integration 통과
2. Pages proxy test와 Worker 기반 전체 Playwright E2E 통과
3. production target 존재 여부와 설정 검증
4. Frontend production build
5. production Worker 배포
6. production Pages Direct Upload

Database migration은 자동 배포 workflow에 포함하지 않습니다. migration은 direct connection을 사용해 별도 승인된 절차로 실행하고, Worker runtime에는 pooled connection만 주입합니다.

## Security checks

- 인증은 database-backed opaque session cookie를 사용합니다.
- 상태 변경 요청은 공개 예약 등록·수정·취소를 포함해 CSRF 검증을 거칩니다.
- production cookie는 `HttpOnly`, `Secure`, `SameSite=Lax`입니다.
- 모든 `/api/**` 요청은 trusted client IP가 없거나 rate-limit binding이 실패하면 fail closed 합니다.
- 인증 관리자는 product READ/WRITE 제한만 우회하고 INGRESS 제한은 항상 적용받습니다.
- production에는 E2E cleanup route가 등록되지 않습니다.

## Before production deployment

1. staged diff와 tracked files에 실제 domain, project/account/resource ID, email, connection string, token, password가 없는지 검사합니다.
2. migration 대상이 exact production database인지 외부에서 확인합니다.
3. Worker secrets와 세 rate-limit binding을 확인합니다.
4. Pages가 exact Worker Service Binding을 사용하는지 확인합니다.
5. 관리자 login, CSRF `403`, 정상 state change를 확인합니다.
6. rate-limit `429`와 `Retry-After` 전달을 확인합니다.
7. production cleanup endpoint가 `404`인지 확인합니다.
8. 최종 운영 receipt는 Git 밖의 승인된 위치에 보관합니다.

## Handover

- Cloudflare, Neon, DNS 소유자와 복구 수단을 확인합니다.
- 관리자 변경 시 `ADMIN_PASSWORD`를 회전합니다.
- 운영 DB backup/restore 절차와 장애 대응 연락 경로를 외부 운영 문서에 유지합니다.
- GitHub/Cloudflare/Neon의 불필요한 기존 credential과 integration은 dashboard에서 별도로 폐기합니다.
