# 프런트엔드

React, TypeScript, Vite 기반의 공개 예약 화면과 관리자 SPA입니다.

## 로컬 실행

먼저 저장소 루트에서 Worker를 실행한 뒤 다른 터미널에서 프런트엔드를 시작합니다.

```powershell
cd ..
.\start-worker.bat
```

```powershell
.\start-frontend.bat
```

기본 주소는 `http://localhost:5173`이며 `/api` 요청은 `http://127.0.0.1:8080`의 로컬 Worker로 프록시됩니다. 다른 로컬 API를 사용하려면 `VITE_API_PROXY_TARGET`을 지정합니다.

## 운영 빌드

```powershell
cd frontend
npm.cmd ci
npm.cmd run build
```

운영 환경에서는 이 `dist`를 Worker 정적 자산으로 배포합니다. 로컬 Vite `/api` 프록시는 개발 편의를 위해서만 유지합니다.

## Playwright E2E

전체 E2E는 Worker 실행기를 사용합니다. 이 실행기가 일회용 PostgreSQL, Worker 어댑터와 Vite를 함께 관리합니다.

```powershell
cd ..\worker
npm.cmd run test:local-e2e
```

E2E 범위와 테스트 데이터 정리 정책은 [프런트엔드 E2E 문서](../docs/admin-e2e.md)를 참고하세요.
