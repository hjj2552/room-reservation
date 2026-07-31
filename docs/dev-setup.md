# 개발자 실행/검증 문서

이 문서는 Worker 백엔드와 React 프런트엔드를 로컬에서 실행하고 검증하는 기준 절차입니다. 명령 예시는 Windows PowerShell 기준입니다.

## 로컬 환경 선택 기준

Windows와 PowerShell을 기준으로 문서화한 이유는 현재 이 저장소의 주 개발 장비가 Windows이고, Docker Desktop·Node.js·npm을 이용한 반복 실행과 Windows의 경로·프로세스·포트 확인을 별도 호환 계층 없이 처리할 수 있기 때문입니다. 루트의 `start-worker.bat`과 `start-frontend.bat`은 이 로컬 작업을 한 명령으로 시작하기 위한 Windows용 편의 진입점입니다.

이는 제품이나 배포 환경이 Windows에 의존한다는 의미가 아닙니다. 핵심 빌드·검사·테스트는 `npm run`과 플랫폼 독립적인 Node.js 스크립트에 두고 있으며, GitHub Actions는 `ubuntu-latest`와 Bash에서 전체 검증 및 배포를 수행합니다. 프런트엔드는 브라우저에서, 백엔드는 일반 Linux 서버가 아닌 Cloudflare Worker에서 실행됩니다. 따라서 로컬 PowerShell은 현재 개발 장비에 맞춘 선택이고, Linux CI는 POSIX 환경 호환성을 확인하는 기준입니다.

## 프로젝트 구성

```text
room-reservation/
  worker/                 # Cloudflare Worker/Hono API
  frontend/               # React/Vite SPA와 Pages API proxy
  docs/
  docker-compose.yml      # 로컬 Worker PostgreSQL
  start-worker.bat
  start-frontend.bat
```

로컬 개발에는 Docker Desktop 또는 Docker Engine, Node.js 22, npm, PowerShell이 필요합니다. Cloudflare 계정은 로컬 실행에 필요하지 않습니다.

## 최초 설정

```powershell
cd <repo>
Copy-Item .env.example .env
```

`.env`의 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`를 로컬 값으로 채웁니다. `.env`는 Git에 커밋하지 않습니다. 로컬 실행기는 외부 DB에 실수로 migration을 적용하지 않도록 loopback `DB_URL`만 허용합니다.

## 로컬 실행

첫 번째 터미널에서 Worker를 시작합니다.

```powershell
cd <repo>
.\start-worker.bat
```

이 스크립트는 PostgreSQL 기동, Worker 의존성 설치, `room_reservation_worker` database 생성, migration 적용과 HTTP adapter 시작을 처리합니다. Worker는 `http://127.0.0.1:8080`에서 실행됩니다. Docker를 이미 실행했다면 다음 명령만 실행해도 됩니다.

```powershell
cd <repo>\worker
npm.cmd run dev
```

두 번째 터미널에서 프런트엔드를 시작합니다.

```powershell
cd <repo>
.\start-frontend.bat
```

프런트엔드는 `http://localhost:5173`에서 실행되고 `/api`를 로컬 Worker로 프록시합니다.

## 검사와 테스트

Worker 정적 검사, unit/contract test, 격리 PostgreSQL 통합 test와 dry-run build:

```powershell
cd <repo>\worker
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd test
npm.cmd run test:isolated-postgres
npm.cmd run build
```

프런트엔드 Pages proxy test와 production build:

```powershell
cd <repo>\frontend
npm.cmd ci
npm.cmd run test:functions
npm.cmd run build
```

전체 Playwright E2E는 고유 이름의 일회용 PostgreSQL container와 같은 Hono app을 사용하는 로컬 Worker adapter를 자동으로 시작합니다.

```powershell
cd <repo>\worker
npm.cmd run test:local-e2e
```

E2E가 만든 데이터는 `testing-` 표식을 사용하며 suite 전후 id 기반 best-effort teardown과 guarded prefix cleanup을 수행합니다. 자세한 내용은 [admin-e2e.md](admin-e2e.md)를 참고하세요.

## GitHub Actions 검증 범위

`.github/workflows/ci.yml`은 다음 두 검증 job을 배포 전에 요구합니다.

- `worker-validation`: Worker 검사, unit/contract test, 격리 PostgreSQL test, dry-run build와 dependency audit
- `worker-frontend-e2e`: Pages proxy test, 프런트엔드 build와 Worker 기반 전체 Playwright E2E

`main` push의 production 배포는 두 검증 중 Worker E2E 경로가 성공한 뒤에만 실행됩니다.

## 트러블슈팅

- DB 연결 실패: `docker compose ps`와 `.env`의 loopback DB 설정을 확인합니다.
- API proxy 오류: Worker가 `http://127.0.0.1:8080`에서 실행 중인지 확인합니다.
- 포트 충돌: `5432`, `8080`, `5173`을 사용하는 프로세스를 확인합니다.
- Playwright browser 오류: `frontend`에서 `npx playwright install --with-deps chromium`을 다시 실행합니다.
- 관리자 로그인 실패: `.env`의 `ADMIN_USERNAME`, `ADMIN_PASSWORD`를 확인합니다.

## 문서 유지 기준

- 관리자 절차 변경: `docs/admin-manual.md`
- 실행·CI·테스트 방식 변경: `docs/dev-setup.md`
- 구현 범위 변경: `docs/known-limitations.md`
- E2E data workflow 변경: `docs/admin-e2e.md`와 `frontend/AGENTS.md`
