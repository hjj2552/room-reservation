# room-reservation

강의실 예약 MVP입니다. 현재 저장소는 Spring Boot 백엔드와 React 기반 프런트엔드로 구성되어 있습니다.

## 문서

- [관리자 매뉴얼](docs/admin-manual.md)
- [개발자 실행/검증 문서](docs/dev-setup.md)
- [현재 제한 사항](docs/known-limitations.md)
- [공개 예약 신청 흐름](docs/public-reservation.md)
- [관리자 E2E 문서](docs/admin-e2e.md)
- [백엔드 테스트 워크플로](docs/testing-workflow.md)
- [배포 체크리스트](docs/deployment-checklist.md)
- [강의실 삭제 정책](docs/room-deletion-policy.md)

## 빠른 시작

최초 실행 전 로컬 전용 설정을 준비합니다.

```powershell
Copy-Item .env.example .env
Copy-Item backend\src\main\resources\application-local.example.yml backend\src\main\resources\application-local.yml
```

`.env`의 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`를 로컬 값으로 채웁니다. 이 파일들은 Git에 커밋하지 않습니다.

로컬 PostgreSQL을 실행합니다.

```powershell
docker compose up -d postgres
```

백엔드를 실행합니다.

```powershell
cd backend
.\gradlew.bat bootRun --args="--spring.profiles.active=local"
```

프런트엔드를 실행합니다.

```powershell
cd frontend
npm ci
npm run dev
```

관리자 계정은 `.env`의 `ADMIN_USERNAME`, `ADMIN_PASSWORD`를 사용합니다. `admin` / `admin1234`는 test/E2E profile의 일회성 기본값일 뿐 local 또는 운영 계정이 아닙니다. 자세한 실행, 테스트, E2E 절차는 [docs/dev-setup.md](docs/dev-setup.md)를 참고하세요.
