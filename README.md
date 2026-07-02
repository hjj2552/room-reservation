# room-reservation

강의실 예약 MVP입니다. 현재 저장소는 Spring Boot 백엔드와 React 기반 프런트엔드로 구성되어 있습니다.

## 문서

- [운영자용 관리자 매뉴얼](docs/operator-manual.md)
- [개발자 실행/검증 문서](docs/dev-setup.md)
- [현재 제한 사항](docs/known-limitations.md)
- [공개 예약 신청 흐름](docs/public-reservation.md)
- [관리자 E2E 문서](docs/admin-e2e.md)
- [백엔드 테스트 워크플로](docs/testing-workflow.md)

## 빠른 시작

로컬 PostgreSQL을 먼저 실행합니다.

```powershell
docker compose up -d postgres
```

백엔드를 실행합니다.

```powershell
cd backend
.\gradlew.bat bootRun
```

프런트엔드를 실행합니다.

```powershell
cd frontend
npm ci
npm run dev
```

기본 로컬 관리자 계정은 `admin` / `admin1234`입니다. 자세한 실행, 테스트, E2E 절차는 [docs/dev-setup.md](docs/dev-setup.md)를 참고하세요.
