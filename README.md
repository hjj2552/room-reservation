# room-reservation

하나의 public Cloudflare Worker가 React Static Assets와 `/api/*` TypeScript API를 제공하고 Neon PostgreSQL에 연결하는 공간 예약 MVP입니다. `frontend`와 `worker` 소스는 분리되어 있으며 배포 시에만 하나의 Worker version으로 결합합니다.

## 문서

- [문서 안내와 현재/역사 기록 구분](docs/README.md)
- [관리자 매뉴얼](docs/admin-manual.md)
- [개발자 실행/검증 문서](docs/dev-setup.md)
- [현재 제한 사항](docs/known-limitations.md)
- [공개 예약 신청 흐름](docs/public-reservation.md)
- [관리자 E2E 문서](docs/admin-e2e.md)
- [배포 체크리스트](docs/deployment-checklist.md)
- [공간 삭제 정책](docs/room-deletion-policy.md)

## 빠른 시작

최초 실행 전 로컬 전용 설정을 준비합니다.

```powershell
Copy-Item .env.example .env
```

`.env`의 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`를 로컬 값으로 채웁니다. 이 파일들은 Git에 커밋하지 않습니다.

첫 번째 터미널에서 로컬 PostgreSQL과 Worker 백엔드를 실행합니다. 최초 실행 시 Worker 의존성 설치와 database migration도 수행합니다.

```powershell
./start-worker.bat
```

두 번째 터미널에서 프런트엔드를 실행합니다.

```powershell
./start-frontend.bat
```

Worker는 `http://127.0.0.1:8080`, 프런트엔드는 `http://localhost:5173`에서 실행됩니다. 로컬 데이터는 Docker PostgreSQL의 `room_reservation_worker` database에 저장됩니다.

관리자 계정은 `.env`의 `ADMIN_USERNAME`, `ADMIN_PASSWORD`를 사용합니다. `admin` / `admin1234`는 test/E2E profile의 일회성 기본값일 뿐 local 또는 운영 계정이 아닙니다. 자세한 실행, 테스트, E2E 절차는 [docs/dev-setup.md](docs/dev-setup.md)를 참고하세요.

## 라이선스

별도로 명시된 제3자 자산을 제외한 이 저장소의 소스 코드와 문서는 [MIT License](LICENSE)에 따라 제공됩니다.

번들된 Wanted Sans 글꼴에는 별도의 [SIL Open Font License 1.1](frontend/src/assets/fonts/wanted-sans/OFL.txt)이 적용됩니다.
