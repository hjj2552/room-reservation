# 프런트엔드

React, TypeScript, Vite 기반의 공개 예약 화면과 관리자 SPA입니다.

## 로컬 실행

저장소 루트의 `.env`와 백엔드 `application-local.yml`을 먼저 준비하고, 백엔드를 `local` profile로 실행합니다. 자세한 준비 절차는 [개발자 실행 문서](../docs/dev-setup.md)를 참고하세요.

```powershell
cd ..\backend
.\gradlew.bat bootRun --args="--spring.profiles.active=local"
```

다른 터미널에서 프런트엔드를 실행합니다.

```powershell
cd frontend
npm ci
npm run dev
```

기본 주소는 `http://localhost:5173`이며 `/api` 요청은 기본적으로 `http://127.0.0.1:8080`으로 프록시됩니다. 다른 백엔드를 사용하려면 `VITE_API_PROXY_TARGET`을 지정합니다.

## 빌드

```powershell
cd frontend
npm run build
```

빌드는 TypeScript 타입 검사와 Vite production build를 함께 수행합니다.

## Playwright E2E

E2E는 `postgres-test` DB와 빌드된 백엔드 jar를 사용합니다. runner는 지정된 백엔드와 프런트엔드가 실행 중이면 재사용하고, 없으면 각각 `e2e` profile 백엔드와 Vite 서버를 시작합니다.

```powershell
cd ..
docker compose up -d postgres-test
cd backend
.\gradlew.bat bootJar
cd ..\frontend
npm ci
npx playwright install --with-deps chromium
npm run e2e
```

E2E의 `admin` / `admin1234`는 폐기 가능한 test/E2E 기본값입니다. 다른 계정을 사용하려면 `ADMIN_USERNAME`, `ADMIN_PASSWORD`를 지정합니다.

E2E 범위, 환경변수, 테스트 데이터 정리 정책은 [Frontend E2E 문서](../docs/admin-e2e.md)를 참고하세요.
