# room-reservation

학교/기관용 강의실 예약 웹앱 MVP입니다.

현재 저장소는 백엔드부터 구축 중이며, 백엔드는 Gradle Wrapper 기준으로만 실행합니다. Maven은 사용하지 않습니다.

## 기술 스택

- Backend: Java 21, Spring Boot, Spring Web, Spring Security, Spring Data JPA, Bean Validation, Flyway
- Database: PostgreSQL
- Build: Gradle Wrapper
- Local infra: Docker Compose

## 디렉터리

```text
room-reservation/
  docker-compose.yml
  backend/
    gradlew
    gradlew.bat
    build.gradle
    settings.gradle
    src/main/java/com/school/reservation
    src/main/resources/db/migration
```

## 실행 조건

- JDK 21 필요
- Docker Desktop 또는 Docker Engine 필요
- PostgreSQL은 루트의 `docker-compose.yml`로 실행
- 백엔드 명령어는 `backend/` 디렉터리에서 실행

## PostgreSQL 실행

프로젝트 루트에서 실행합니다.

Windows PowerShell:

```powershell
docker compose up -d postgres
```

상태 확인:

```powershell
docker compose ps
```

중지:

```powershell
docker compose down
```

DB 접속 정보는 `backend/src/main/resources/application-local.yml`과 동일합니다.

```text
url: jdbc:postgresql://localhost:5432/room_reservation
username: room_reservation
password: room_reservation
```

## 백엔드 테스트

통합 테스트는 PostgreSQL 테스트 DB를 사용합니다. 먼저 프로젝트 루트에서 `postgres-test`를 실행합니다.

Windows PowerShell:

```powershell
docker compose up -d postgres-test
```

그 다음 `backend/` 디렉터리에서 실행합니다.

Windows PowerShell:

```powershell
cd backend
.\gradlew.bat test
```

macOS/Linux:

```bash
cd backend
./gradlew test
```

## 백엔드 실행

먼저 프로젝트 루트에서 PostgreSQL을 실행합니다.

```powershell
docker compose up -d postgres
```

그 다음 `backend/` 디렉터리에서 Spring Boot를 실행합니다.

```powershell
cd backend
.\gradlew.bat bootRun
```

`application.yml`에서 기본 profile이 `local`로 설정되어 있으므로 별도 옵션 없이 `application-local.yml`이 사용됩니다.

명시적으로 local profile을 지정하려면:

```powershell
.\gradlew.bat bootRun --args="--spring.profiles.active=local"
```

서버가 정상 실행되면 기본 포트는 `8080`입니다.

```text
http://localhost:8080
```

## application-local.yml 사용 방법

로컬 개발용 설정 파일입니다.

- PostgreSQL 연결 정보
- Flyway 활성화
- Hibernate SQL 로그
- 임시 관리자 계정

초기 관리자 계정:

```text
username: admin
password: admin1234
```

운영 환경에서는 `application-prod.yml`을 사용하고, 관리자 계정과 DB 접속 정보는 환경변수로 주입해야 합니다.

## Gradle Wrapper

이 프로젝트는 전역 Gradle 설치를 요구하지 않습니다.

Windows:

```powershell
.\gradlew.bat test
.\gradlew.bat bootRun
```

macOS/Linux:

```bash
./gradlew test
./gradlew bootRun
```

## 처음 실행 체크리스트

1. JDK 21 설치 여부 확인: `java -version`
2. Docker 실행 여부 확인: `docker --version`
3. 프로젝트 루트로 이동
4. PostgreSQL 실행: `docker compose up -d postgres`
5. 테스트 DB 실행: `docker compose up -d postgres-test`
6. `backend/`로 이동
7. 테스트 실행: `.\gradlew.bat test`
8. 서버 실행: `.\gradlew.bat bootRun`
9. 로그에서 `Started RoomReservationApplication` 확인
10. 종료는 터미널에서 `Ctrl+C`
