# 관리자 프런트엔드

React + TypeScript + Vite 기반 관리자 화면입니다.

## 실행

백엔드를 먼저 실행합니다.

```powershell
cd ..\backend
.\gradlew.bat bootRun
```

다른 터미널에서 관리자 프런트엔드를 실행합니다.

```powershell
cd admin-frontend
npm.cmd run dev
```

## E2E 테스트

Playwright E2E는 관리자 프런트 dev server를 자동으로 실행합니다. 백엔드가 `http://127.0.0.1:8080`에서 실행 중이면 그대로 사용하고, 실행 중이 아니면 `backend/build/libs/room-reservation-backend-0.0.1-SNAPSHOT.jar`를 임시로 실행한 뒤 테스트 종료 시 정리합니다.

```powershell
cd admin-frontend
npm.cmd run e2e
```

관리자 계정은 기본값으로 `admin` / `admin1234`를 사용합니다. 다른 계정을 사용하려면 실행 전에 환경 변수 `ADMIN_USERNAME`, `ADMIN_PASSWORD`를 지정합니다.

## Admin E2E profile

CI/local E2E prerequisites, environment variables, and cleanup strategy are documented in:

```text
../docs/admin-e2e.md
```
