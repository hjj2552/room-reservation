# 개발자 실행/검증 문서

이 문서는 로컬 개발자와 미래 인수자가 프로젝트를 실행하고 검증하기 위한 기준 절차입니다. 명령 예시는 Windows PowerShell 기준이며, macOS/Linux에서는 `.\gradlew.bat` 대신 `./gradlew`를 사용하면 됩니다.

아래 명령의 `<repo>`는 이 저장소를 내려받은 프로젝트 루트 경로를 뜻합니다.

## 프로젝트 구성

```text
room-reservation/
  docker-compose.yml
  backend/
    build.gradle
    gradlew.bat
    src/main/java/com/school/reservation
    src/main/resources/application-*.yml
    src/main/resources/db/migration
    src/test/java/com/school/reservation
  admin-frontend/
    package.json
    vite.config.ts
    playwright.config.ts
    src/
    tests/e2e/
  docs/
```

주요 구성은 다음과 같습니다.

- `backend`: Java 21, Spring Boot, Spring Web, Spring Security, Spring Data JPA, Bean Validation, Flyway 기반 API 서버입니다.
- `admin-frontend`: React, Vite, TypeScript, React Router, TanStack Query 기반 관리자 SPA입니다.
- `docker-compose.yml`: 로컬 개발 DB와 테스트/E2E DB를 실행합니다.
- `.github/workflows/ci.yml`: 백엔드 테스트와 관리자 프런트엔드 build/E2E를 검증합니다.

## 사전 준비

- JDK 21
- Docker Desktop 또는 Docker Engine
- Node.js 22 권장
- npm
- PowerShell

버전 확인 예시는 다음과 같습니다.

```powershell
java -version
docker --version
node --version
npm --version
```

## Docker/Postgres 실행 방법

일반 로컬 개발 DB를 실행합니다.

```powershell
cd <repo>
docker compose up -d postgres
docker compose ps
```

테스트와 E2E용 DB를 실행합니다.

```powershell
cd <repo>
docker compose up -d postgres-test
docker compose ps postgres-test
```

중지하려면 다음 명령을 사용합니다.

```powershell
docker compose down
```

로컬 개발 DB 접속 정보는 다음과 같습니다.

```text
url: jdbc:postgresql://localhost:5432/room_reservation
username: room_reservation
password: room_reservation
```

테스트 DB 접속 정보는 다음과 같습니다.

```text
url: jdbc:postgresql://localhost:5433/room_reservation_test
username: room_reservation
password: room_reservation
```

## 백엔드 실행

1. 개발 DB를 실행합니다.

```powershell
cd <repo>
docker compose up -d postgres
```

2. Spring Boot 서버를 실행합니다.

```powershell
cd backend
.\gradlew.bat bootRun
```

기본 서버 주소는 `http://localhost:8080`입니다. 기본 활성 profile은 `local`이며, 명시하려면 다음과 같이 실행합니다.

```powershell
.\gradlew.bat bootRun --args="--spring.profiles.active=local"
```

로컬 관리자 계정은 `application-local.yml` 기준 `admin` / `admin1234`입니다.

## 관리자 프런트엔드 실행

1. 의존성을 설치합니다.

```powershell
cd <repo>\admin-frontend
npm ci
```

2. 개발 서버를 실행합니다.

```powershell
npm run dev
```

기본 Vite 주소는 `http://localhost:5173`입니다. 관리자 프런트엔드는 `/api` 요청을 백엔드로 프록시합니다. 백엔드는 `http://localhost:8080`에서 실행 중이어야 합니다.

## 백엔드 테스트 실행

통합 테스트는 `postgres-test`가 필요합니다.

```powershell
cd <repo>
docker compose up -d postgres-test
cd backend
.\gradlew.bat test
```

특정 영역만 빠르게 확인할 때는 `--tests`를 사용할 수 있습니다.

```powershell
.\gradlew.bat test --tests "*RecurrenceIntegrationTest"
.\gradlew.bat test --tests "*AdminReservationIntegrationTest"
.\gradlew.bat test --tests "*ReservationCsvExportIntegrationTest"
```

상세 테스트 기준은 [testing-workflow.md](testing-workflow.md)를 참고하세요.

## 프런트엔드 build 실행

```powershell
cd <repo>\admin-frontend
npm ci
npm run build
```

`npm run build`는 TypeScript 타입 검사(`tsc --noEmit`)와 Vite production build를 함께 실행합니다.

## 관리자 E2E 실행

E2E는 Playwright 기반입니다. `postgres-test`를 먼저 실행합니다.

```powershell
cd <repo>
docker compose up -d postgres-test
```

백엔드 jar를 빌드합니다.

```powershell
cd backend
.\gradlew.bat bootJar
```

관리자 프런트엔드에서 E2E를 실행합니다.

```powershell
cd ..\admin-frontend
npm ci
npx playwright install --with-deps chromium
npm run e2e
```

CI와 같은 형태로 실행하려면 다음 명령을 사용합니다.

```powershell
npm run e2e:ci
```

E2E runner는 기본적으로 백엔드 readiness URL이 열려 있지 않으면 `e2e` profile로 백엔드 jar를 실행하고, 프런트엔드 URL이 열려 있지 않으면 Vite 개발 서버를 실행합니다.

자세한 E2E 범위와 환경 변수는 [admin-e2e.md](admin-e2e.md)를 참고하세요.

## GitHub Actions 검증 범위

CI workflow는 `.github/workflows/ci.yml`에 있습니다. 현재 `pull_request`, `push`, `workflow_dispatch`에서 실행됩니다.

`backend-test` job은 다음을 검증합니다.

- PostgreSQL 16 테스트 서비스 실행
- JDK 21 설정
- Gradle wrapper 실행 권한 설정
- `backend/./gradlew test`

`admin-frontend` job은 `backend-test` 성공 후 다음을 검증합니다.

- PostgreSQL 16 테스트 서비스 실행
- JDK 21 설정
- Node.js 22 설정
- `admin-frontend/npm ci`
- `npm run build`
- `backend/./gradlew bootJar`
- Playwright Chromium 설치
- `npm run e2e:ci`

E2E 실패 시 다음 artifact가 업로드됩니다.

- `admin-playwright-report`
- `admin-e2e-test-results`

## 트러블슈팅

DB 연결 실패가 나면 다음을 확인합니다.

```powershell
docker compose ps
docker compose up -d postgres
docker compose up -d postgres-test
```

백엔드 테스트가 `connection refused`로 실패하면 `postgres-test`가 켜져 있는지 확인합니다. 테스트 DB 포트는 호스트 기준 `5433`입니다.

Flyway 또는 JPA validate 오류가 나면 최근 migration과 엔티티 필드가 맞는지 확인합니다. 로컬 개발 DB가 오래된 상태라면 데이터 보존 필요 여부를 먼저 판단한 뒤 DB 초기화를 검토합니다.

관리자 로그인이 실패하면 profile별 관리자 계정을 확인합니다.

- `local`: `backend/src/main/resources/application-local.yml`
- `test`: `backend/src/main/resources/application-test.yml`
- `e2e`: `ADMIN_USERNAME`, `ADMIN_PASSWORD` 환경 변수 또는 기본값

프런트엔드에서 API가 401을 반환하면 로그인 세션이 없거나 만료된 상태입니다. 다시 로그인합니다.

프런트엔드에서 API가 404 또는 프록시 오류를 반환하면 백엔드가 `http://localhost:8080`에서 실행 중인지 확인합니다.

E2E가 브라우저 설치 오류로 실패하면 다음 명령을 다시 실행합니다.

```powershell
cd <repo>\admin-frontend
npx playwright install --with-deps chromium
```

포트 충돌이 나면 `8080`, `5173`, `5432`, `5433`을 사용하는 프로세스가 있는지 확인합니다. 이미 서버가 떠 있다면 종료하거나 환경 변수로 다른 URL을 지정합니다.

CSV 한글 또는 Excel 표시가 이상하면 파일이 UTF-8로 열리는지 확인합니다. 현재 CSV는 UTF-8 BOM을 포함합니다.

## 문서 유지 기준

기능이 추가되면 다음 문서를 함께 확인합니다.

- 운영자 절차가 바뀌면 `docs/operator-manual.md`
- 실행 명령, CI, 테스트 방식이 바뀌면 `docs/dev-setup.md`
- 구현 범위나 미지원 범위가 바뀌면 `docs/known-limitations.md`
- E2E 범위가 바뀌면 `docs/admin-e2e.md`
