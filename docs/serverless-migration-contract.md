# 서버리스 마이그레이션 계약서

상태: Final

기준 버전: `spring-baseline-v1`

기준 커밋: `654e703`

현재 백엔드: Spring Boot + Render

목표 백엔드: TypeScript + Cloudflare Workers

데이터베이스: Neon PostgreSQL 유지 및 운영 전 초기화

프런트엔드: 기존 React 애플리케이션 유지

## 1. 목적

이 문서는 Spring Boot 백엔드를 TypeScript 기반 Cloudflare Workers 백엔드로 재작성할 때 유지해야 할 제품 동작, 제거할 기존 구현, 별도로 검증해야 할 기술 사항을 정의한다.

마이그레이션의 목적은 다음과 같다.

- Render 무료 플랜의 장기 콜드 스타트 제거
- 카드 등록 없는 무료 운영 환경 유지
- 기존 React 프런트엔드와 API 계약 유지
- 현재 제품 정책과 사용자 흐름 보존
- Cloudflare 종속성을 얇은 어댑터에 제한
- 기존 E2E를 재작성 완료 판정 기준으로 재사용
- 실제 운영이 시작되는 2026년 9월 전에 마이그레이션과 안정화 완료
- Spring 환경으로의 rollback 없이 Worker 중심의 운영 체계 확립

이번 마이그레이션은 기능 추가나 제품 재설계가 아니라 실행 환경과 백엔드 구현을 교체하는 작업이다.

전환 이후 발견되는 문제는 기존 Spring 시스템으로 되돌리는 방식이 아니라 Worker 코드 수정, 재배포 및 forward migration으로 해결한다.

## 2. 작업 범위

### 포함한다

- Spring Boot API의 TypeScript 재작성
- Cloudflare Workers 배포
- Neon PostgreSQL 초기화 및 연결
- Worker 기준 신규 DB baseline migration V1 작성
- 인증·세션·CSRF의 Worker 환경 재구현
- 기존 API와 제품 정책의 동등성 검증
- 기존 프런트 E2E 재사용
- 비운영 환경 전용 E2E 데이터 정리 경로
- 기존 Spring schema와 Flyway 이력 폐기
- Worker 백엔드 교체와 운영 전 검증
- Go-Live 전 실제 운영 설정과 데이터 상태 확인

### 포함하지 않는다

- React 프런트엔드 재작성
- 사용자 노출 UI 재설계
- 신규 기능 추가
- 관리자 다중 계정 시스템
- 역할·권한 관리 시스템
- 로고 파일 업로드 복구
- 다일 예약 기능
- 마이크로서비스 분리
- D1, KV, R2, Durable Objects 도입
- `styles.css` 구조 개편
- 기존 API의 임의 개선 또는 이름 변경
- 기존 Spring 데이터 이전
- 기존 Spring 환경으로의 운영 rollback 체계
- 무중단 운영 컷오버
- 컷오버용 maintenance gate
- 실제 운영 데이터가 생성된 이후의 데이터 초기화

## 3. 기준 버전과 판단 우선순위

`spring-baseline-v1`은 서버리스 마이그레이션 전 제품 동작의 역사적 기준이다.

마이그레이션 중 현재 동작이 불분명하면 다음 원칙을 적용한다.

1. 이 계약서에 명시적으로 규정된 제품 정책과 의도적인 변경 사항
2. 기준 버전의 자동화 테스트
3. 기준 버전의 실제 코드
4. 기존 운영 문서
5. 그래도 불명확하면 사용자에게 확인

이 계약서에 명시된 사항은 기준 버전의 코드나 테스트보다 우선한다.

기준 버전의 테스트와 코드는 계약서에서 명시하지 않은 기존 동작을 판단하기 위한 근거로 사용한다.

기준 태그는 이동하거나 덮어쓰지 않는다. 이후 새로운 Spring 기준점이 필요하더라도 기존 태그를 수정하지 않고 별도 태그를 생성한다.

`spring-baseline-v1`은 마이그레이션 이후에도 역사적 참고 자료로 유지할 수 있지만 운영 rollback 수단으로 간주하지 않는다.

## 4. 아키텍처 원칙

핵심 제품 로직은 Cloudflare Workers API에 직접 의존하지 않는 순수 TypeScript로 작성한다.

핵심 영역의 예시는 다음과 같다.

- 예약 시간 검증
- 충돌 판정
- 상태 전이
- 반복 예약 정책
- 공개·관리자 권한 차이
- 운영 설정 검증
- 날짜·시간 계산
- pagination과 조회 범위
- rate limit 정책

핵심 로직에서는 다음을 직접 참조하지 않는다.

- Cloudflare `env`
- Workers binding
- `ExecutionContext`
- KV, D1, R2, Durable Objects
- Wrangler 설정
- Neon SDK의 구체 타입
- HTTP `Request`와 `Response`
- Hono context
- Cloudflare의 IP 관련 header

외부 기술은 어댑터로 격리한다.

- HTTP 어댑터
- Neon PostgreSQL repository 어댑터
- 세션 저장소 어댑터
- 환경변수와 Worker secret 어댑터
- 시간 제공자
- 비밀번호 해싱
- rate limit 저장소와 클라이언트 IP 판정
- 로그·관측성

Hono를 사용하더라도 라우팅과 HTTP 변환 계층에 한정한다. 제품 서비스와 도메인 로직이 Hono context에 의존하지 않게 한다.

## 5. 프런트엔드 및 API 계약

기존 React 프런트엔드는 원칙적으로 수정하지 않는다.

다만 다음 한 가지는 명시적으로 승인된 제품 정책 변경이므로 P4의 최소 프런트 수정 범위에 포함한다.

- 공개 예약 비밀번호의 입력 제한·안내·클라이언트 검증을 14절의 printable ASCII 4~64자 정책에 맞춤

이 예외는 공개 예약 비밀번호 입력 UX에만 적용한다. 다른 UI, API 경로·필드, 시간 정책, 예약 정책은 변경하지 않는다.

다음을 유지한다.

- `/api` 기반 same-origin 호출
- 기존 API 경로와 HTTP method
- 요청·응답 JSON 필드
- 주요 HTTP status
- 프런트가 분기하는 오류 코드
- credentials 포함 요청
- `XSRF-TOKEN` cookie와 `X-XSRF-TOKEN` 요청 header
- pagination 구조
- 공개 설정 API
- 관리자 인증 확인 API
- 예약 생성·조회·수정·취소 흐름
- 공간·태그·반복 예약·운영 설정·감사 이력 흐름
- 관리자 예약 CSV 내보내기
- readiness가 사용하는 공개 설정 응답

응답 JSON의 필드 순서, 내부 클래스 이름, Java record 이름, Spring 기본 오류 형식까지 같을 필요는 없다. 프런트 동작과 테스트에 영향을 주는 외부 계약만 유지한다.

### `slotMinutes` 호환 필드

예약 입력 단위는 더 이상 운영 설정값이 아니며 고정 5분이다.

기존 React 프런트엔드와 readiness가 아직 `slotMinutes` 필드를 사용하므로 다음 호환 계약을 유지한다.

- 공개·관리자 설정 응답의 `slotMinutes`는 항상 `5`
- 현재 관리자 설정 요청의 `slotMinutes` 필드를 수신
- 요청의 `slotMinutes`를 실제 운영 설정이나 예약 단위 변경으로 해석하지 않음
- 핵심 도메인에서는 고정 상수 `5` 사용
- 신규 DB에는 `slot_minutes` 열을 두지 않음
- 기존 프런트의 참조가 제거된 후 별도 API cleanup 작업으로 필드 제거 가능

이는 DB 호환성을 위한 것이 아니라 현재 프런트엔드와의 임시 API 호환성을 위한 것이다.

## 6. 프런트엔드 배포 단계

### 1차 마이그레이션

1차 서버리스 마이그레이션에서는 다음 구조를 사용한다.

- 기존 React 프런트엔드는 Cloudflare Pages에 유지
- 백엔드만 Cloudflare Workers로 이전
- 브라우저의 `/api` same-origin 계약 유지
- 마이그레이션 변경 범위를 백엔드와 연결 어댑터로 제한

P3 결과에 따라 1차 마이그레이션에서는 기존 Cloudflare Pages Function `/api` reverse proxy를 유지한다. production Pages domain에 direct Worker route를 추가하지 않는다. 프런트의 same-origin `/api` 호출 계약은 변경하지 않는다.

### 안정화 이후

Worker 백엔드가 안정화되면 프런트엔드도 Workers Static Assets 등으로 통합하는 방안을 별도로 검토한다.

검토 기준은 다음과 같다.

- 배포 원자성
- 운영 복잡성
- 장애 격리
- 무료 사용량
- Worker 배포 버전 관리와 forward-fix 편의성
- Pages Function proxy 제거 가능성
- 프런트·백엔드 단일 진입점의 장단점

기존 경험상 Worker 통합을 우선적인 후속 방향으로 고려하지만 1차 백엔드 마이그레이션 범위에는 포함하지 않는다.

## 7. 시간 정책

다음은 의도된 제품 정책이며 단순화하거나 재해석하지 않는다.

- 서비스 시간대는 `Asia/Seoul`
- 브라우저와 테스트 환경이 UTC여도 서울 기준 결과가 같아야 함
- 예약 시작·종료 입력 단위는 고정 5분
- 시간표 표시 간격은 30분
- 운영 시작·종료 시간은 30분 단위
- 최소 예약 시간은 30분 이상
- 최소·최대 예약 시간은 5분의 배수
- 최대 예약 시간은 최소 예약 시간 이상
- 기본 제안 길이는 `max(30분, 최소 예약 시간)`
- 예약 시작과 종료는 같은 날짜
- 종료 시간은 시작 시간보다 늦어야 함
- 예약 시간의 초와 나노초는 0
- 예약은 운영시간 안에 있어야 함
- 공개 자동 제안은 strict-future 조건을 만족해야 함
- 공개·관리자 자동 제안은 동일한 공통 규칙을 사용
- 시간표 빈칸 선택과 hover는 전체 제안 구간을 정확하게 표시
- 공개 화면에서도 과거 시간표 칸은 선택할 수 있지만 최종 제출에서 거부
- 관리자는 과거 시간을 예약할 수 있음
- 날짜 범위 조회는 서울 시간 기준 경계를 정확하게 처리
- KST와 UTC 실행 환경에서 종료 경계 처리 결과가 같아야 함

현재 시각과 과거·미래 여부의 최종 판정은 Worker의 주입 가능한 서버 time provider가 제공하는 UTC instant를 기준으로 한다.

클라이언트가 전달하거나 브라우저가 계산한 현재 시각을 권위 있는 값으로 사용하지 않는다.

제품 날짜·운영시간 판정과 사용자 표시는 서버의 현재 instant를 `Asia/Seoul`로 변환하여 처리한다.

현재 제품에는 시간대를 임의로 보정하는 환경변수나 서버 시간 `+/-` offset을 추가하지 않는다.

현재 날짜 필터 계약은 서울 시간 기준으로 다음 경계를 사용한다.

- `from = YYYY-MM-DDT00:00:00+09:00`
- `to = YYYY-MM-DDT23:59:59.999999+09:00`

PostgreSQL microsecond 정밀도의 마지막 시각이 누락되지 않도록 기존 포함·겹침 조건을 유지한다.

운영 설정을 변경해도 기존 예약 시간을 자동 수정하거나 소급 검증하지 않는다.

기존 예약은 그대로 조회·표시·상태 변경할 수 있어야 한다. 해당 예약의 시간을 실제 수정할 때만 현재 시간 정책을 적용한다.

## 8. 공개 예약과 관리자 예약의 차이

### 공개 사용자

- 예약 생성 시 기본 상태는 `REQUESTED`
- 서버 시간 기준 과거 시간 예약 불가
- 예약 비밀번호를 통한 조회·수정·취소
- 예약 비밀번호는 14절의 printable ASCII 4~64자 정책을 따름
- 공개 응답의 개인정보 마스킹 유지
- 공개 수정 후 상태는 `REQUESTED`로 복귀
- 공개 취소 후 상태는 `CANCELLED`
- 공개 availability 검사에서도 과거 시간 거부

### 관리자

- 로그인 세션 필요
- 과거 시간 예약 가능
- 승인 상태로 저장 가능
- 예약 상태 변경 가능
- 공간·반복 예약·운영 설정·감사 이력 관리 가능

이 차이를 코드 중복이나 우연한 분기라고 판단하여 임의로 통합하지 않는다.

## 9. 충돌과 상태 정책

다음을 유지한다.

- `REQUESTED` 예약은 시간대를 점유함
- `CONFIRMED` 예약은 시간대를 점유함
- `CANCELLED` 예약은 충돌 대상에서 제외
- 같은 공간에서 시간이 겹치는 예약을 생성하거나 수정할 수 없음
- 상태만 변경하는 동작과 예약 시간을 변경하는 동작을 구분
- 공개 수정은 상태를 다시 `REQUESTED`로 변경
- 동시 요청에서도 중복 예약이 생성되지 않아야 함

충돌 방지는 애플리케이션의 사전 조회만으로 구현하지 않는다. PostgreSQL transaction, constraint, lock 또는 그에 준하는 원자적인 방식으로 동시성을 보장해야 한다.

구체적인 구현 방식은 P3에서 검증한다.

## 10. 반복 예약

반복 예약은 관리자가 여러 개의 개별 예약을 일괄 생성하는 매크로 성격의 기능이다.

반복 예약을 매 요청 시 동적으로 계산되는 무기한 규칙이나 일반 예약과 동일한 CRUD 자원으로 재해석하지 않는다.

다음을 유지한다.

- 반복 예약 미리보기
- 반복 예약 생성
- 반복 예약 목록 조회
- 반복 예약 상세 조회
- 반복 예약과 생성된 개별 예약의 연결
- 반복 예약 취소
- 태그와 색상 표시
- 취소가 기존 개별 예약에 미치는 범위
- 충돌 시 `SKIP_CONFLICTS`와 `FAIL_ALL` 정책
- 반복 예약 관련 기존 E2E

현재 제품에 존재하지 않는 다음 기능은 추가하지 않는다.

- 반복 예약 일반 수정 API
- 반복 예약 일반 삭제 API
- 반복 예약과 단건 예약의 임의 통합
- 기존 반복 예약 규칙의 자동 재계산

세부 동작이 불명확하면 이 계약서에 명시된 매크로 개념을 우선하고, 나머지는 기준 버전의 테스트와 코드를 따른다.

## 11. 공간 삭제와 기록 보존

공간 삭제는 관련 예약과 반복 예약의 삭제를 의미하지 않는다.

다음을 유지한다.

- 공간 row 삭제 후 기존 예약 기록 보존
- 기존 반복 예약 기록 보존
- 원래 공간명 보존
- 삭제된 공간임을 사용자에게 표시
- 시스템 보존용 공간은 일반 공간 목록과 예약 선택 목록에서 제외
- 시스템 보존용 공간은 수정·삭제 불가
- 예약·감사 이력의 참조 무결성 유지

기존 Spring DB의 `(삭제된 강의실)` literal은 역사적 내부 구현이다. 신규 V1에서는 현재 사용자 용어에 맞는 `삭제된 공간`을 사용한다.

신규 DB의 일반 공간은 0건으로 시작하되, 삭제 기록 보존에 필요한 시스템 공간은 필수 시스템 데이터로 생성할 수 있다.

## 12. 감사 이력

다음을 유지한다.

- 예약 생성·수정·상태 변경·취소·삭제에 대한 감사 정보
- 변경 전후 값 표시
- 삭제된 예약의 감사 기록 보존
- 삭제된 공간의 원래 이름 표시
- 운영 화면의 감사 이력 조회·검색·pagination
- 서울 시간 기준 표시

감사 이력의 내부 테이블과 관리자 식별 구조는 변경할 수 있지만 관리자에게 제공되는 정보와 제품 정책은 유지한다.

P4에서는 환경변수 기반 관리자 username 등 현재 운영자를 식별할 수 있는 값을 감사 행위자로 기록할 수 있다. 기존 Spring의 `admins` 외래키 구조를 유지할 필요는 없다.

마이그레이션 전 기존 감사 이력은 모두 사전 운영·테스트 데이터이므로 신규 DB로 이전하지 않는다.

신규 시스템의 감사 이력은 0건부터 시작한다.

## 13. Pagination, 조회 범위 및 CSV

다음을 유지한다.

- 관리자 목록 기본 page size 20
- 관리자 목록 최대 page size 100
- 클라이언트가 100보다 큰 값을 보내면 서버에서 상한 적용
- 날짜 시간표는 하루 범위
- 공간별 시간표는 7일 범위
- 목록 API를 직접 호출해도 무제한 조회 불가
- 기존 정렬·검색·필터 동작 유지

관리자 예약 CSV 내보내기는 목록 pagination의 명시적인 예외다.

다음을 유지한다.

- 경로: `/api/admin/exports/reservations.csv`
- 관리자 인증 필요
- 현재 검색·필터 조건 적용
- 조건을 만족하는 전체 예약 내보내기
- UTF-8 BOM 포함
- `Content-Type: text/csv;charset=UTF-8`
- 다운로드용 `Content-Disposition`
- 파일명 `reservations.csv`
- 서울 시간대 기준 날짜·시간 표시
- 날짜·시간 형식 `yyyy-MM-dd HH:mm:ss`
- 쉼표·따옴표·줄바꿈을 포함하는 값의 CSV escaping
- 기존 열 이름과 열 순서 유지

CSV 열 순서는 다음과 같다.

1. `reservationId`
2. `roomName`
3. `applicantName`
4. `applicantEmail`
5. `applicantPhone`
6. `purpose`
7. `startAt`
8. `endAt`
9. `status`
10. `source`
11. `recurrenceId`
12. `createdAt`

사용자 화면의 용어를 `공간`으로 통일했더라도 기존 CSV의 `roomName` 열 이름은 이번 마이그레이션에서 변경하지 않는다.

CSV 내보내기의 사용 빈도가 낮다는 이유로 이번 마이그레이션에서 제거하지 않는다.

향후 데이터 규모가 커질 경우 내보내기 상한이나 비동기 처리를 별도 작업으로 검토할 수 있지만 이번 마이그레이션에는 포함하지 않는다.

## 14. 인증·세션·CSRF 및 Rate Limit

Spring Security 구현은 이식하지 않지만 다음 보안 속성은 유지한다.

- 관리자 로그인 성공 후 세션 유지
- 새로고침 후 로그인 유지
- 로그아웃 시 세션 무효화
- 로그아웃 후 보호 API는 401
- session cookie는 `Secure`
- session cookie는 `HttpOnly`
- session cookie는 `SameSite=Lax`
- CSRF 방어 유지
- 로그인 실패 시 계정 존재 여부를 구분하여 노출하지 않음
- 관리자 비밀번호를 코드나 저장소에 포함하지 않음
- 공개 예약 비밀번호를 평문으로 저장하지 않음

P4에서는 기존 React 프런트엔드와의 호환을 위해 다음 CSRF 계약을 유지한다.

- CSRF cookie 이름은 `XSRF-TOKEN`
- 요청 header 이름은 `X-XSRF-TOKEN`
- `XSRF-TOKEN`은 프런트가 읽어야 하므로 `HttpOnly=false`
- 운영 HTTPS 환경에서 `XSRF-TOKEN`은 `Secure`
- `XSRF-TOKEN`은 `SameSite=Lax`
- `XSRF-TOKEN`의 path는 `/`
- credentials를 포함하는 기존 요청 흐름 유지

`XSRF-TOKEN` cookie나 `X-XSRF-TOKEN` header의 이름을 P4에서 변경하지 않는다. 명칭 변경은 프런트와 백엔드를 함께 수정하는 별도 cleanup 작업으로만 수행한다.

Session cookie 이름은 프런트가 직접 의존하지 않고 외부 세션 동작을 그대로 유지한다면 변경할 수 있다.

### 공개 예약 비밀번호

공개 예약 생성·조회·수정·취소에 사용하는 비밀번호는 다음 제품 정책을 따른다.

- 길이: 4~64자
- 허용 범위: printable ASCII `!`부터 `~`
- 서버 검증 정규식: `^[\x21-\x7E]{4,64}$`
- 허용: 영문 대·소문자, 숫자, ASCII 특수문자
- 불허: 한글, 공백, emoji, 전각 문자, 기타 Unicode
- 영문 대·소문자를 구분
- 앞뒤 공백을 자동 제거하지 않음
- Unicode normalization이나 비ASCII 문자의 자동 변환을 하지 않음
- 한글을 영문 물리 키 문자열로 transliteration하지 않음
- API 직접 호출에도 같은 규칙을 최종 적용

프런트는 기존 네이티브 `type="password"` 입력을 유지한다. 브라우저와 IME의 정상 입력 동작을 따르며 물리 키를 QWERTY 영문으로 변환하는 커스텀 로직이나 deprecated/non-standard `ime-mode`를 추가하지 않는다. 정상적인 데스크톱 입력에서 브라우저가 자연스럽게 영문으로 입력하면 별도 오류를 표시하지 않는다. 모바일·붙여넣기 등으로 실제 비ASCII 값이 입력될 때의 클라이언트 차단은 UX 보조이며 Worker 검증을 대체하지 않는다.

기본 안내 문구는 다음과 같다.

> 예약 비밀번호는 영문, 숫자, 특수문자를 사용해 4~64자로 입력해 주세요.

실제 비ASCII 입력을 차단했을 때의 보조 문구는 다음과 같다.

> 한글과 공백은 사용할 수 없습니다.

저장은 Neon `pgcrypto`의 bcrypt를 사용한다.

- `crypt(password, gen_salt('bf', 12))`로 cost 12 hash 생성
- 검증은 저장 hash를 salt로 전달한 `crypt` 결과와 비교
- 사용자 비밀번호를 별도 pre-hash 없이 직접 bcrypt에 전달
- HMAC pre-hash와 pepper를 추가하지 않음
- PBKDF2-HMAC-SHA256 600,000회를 사용하지 않음
- PBKDF2 반복 횟수를 100,000회로 낮춰 사용하지 않음
- 모든 query는 parameterized query로 실행
- DB에는 bcrypt hash만 저장하고 평문·salt·검증 입력을 일반 로그나 응답에 남기지 않음

허용 입력은 ASCII 최대 64자이므로 UTF-8에서도 최대 64 bytes이며 bcrypt의 72-byte 제한보다 작다. 기존 Spring도 공통 `BCryptPasswordEncoder`로 공개 예약 비밀번호를 처리하면서 DTO는 Unicode 4~100자를 허용했으므로 동일한 72-byte 잠재 문제가 있었다. 이번 변경은 Worker 마이그레이션이 새로 만든 제약이 아니라 기존 잠재 문제를 명시적으로 해결하는 승인된 제품 정책 변경이다.

현재 DB는 운영 전 초기화 예정이고 실제 운영 데이터가 없으므로 기존 100자·한글 비밀번호에 대한 호환 또는 hash 이전을 제공하지 않는다.

관리자 비밀번호는 Worker secret 기반 단일 관리자 계정 정책을 따르며 이 공개 예약 비밀번호 정책의 대상이 아니다.

### Rate limit

P4 핵심 재작성에서 분리했던 rate limit과 Pages→Worker IP 신뢰 경계는 Go-Live 전 후속 작업에서 다음과 같이 확정한다.

목적은 정확한 전역 과금 제한이 아니라 공개 API의 기본적인 남용 완화다. 모든 Cloudflare 실행 위치에서 완전히 동일한 전역 counter를 제공하는 것은 요구사항이 아니다.

Workers Rate Limiting binding은 정확히 세 개만 사용한다.

- `INGRESS_GUARD_RATE_LIMITER`: 모든 `/api/**`, 인증 여부와 무관하게 IP별 600회/60초
- `PUBLIC_READ_RATE_LIMITER`: 인증된 관리자가 아닌 `GET /api/**`, IP별 120회/60초
- `PUBLIC_WRITE_RATE_LIMITER`: 인증된 관리자가 아닌 비GET `/api/**`, IP별 24회/60초
- 인증된 관리자 요청: `INGRESS`는 적용하고 기존 제품 정책인 READ/WRITE만 우회
- 비인증 관리자 API 요청: 공개 요청과 동일하게 제한
- `/health`: `/api/**`가 아니므로 제외
- 초과 시 HTTP 429와 `Retry-After: 60`
- 오류 코드 `RATE_LIMIT_EXCEEDED`
- 메시지 `Too many requests. Please retry later.`
- `details.retryAfterSeconds = 60`

Cloudflare binding은 정확한 token 수나 해제 시점을 제공하지 않으므로 `Retry-After`는 60으로 고정하고 `X-RateLimit-Remaining`을 추정하지 않는다. 이 API는 Cloudflare 위치별이고 permissive/eventually consistent하므로 과금·정산용 정확한 전역 counter로 사용하지 않는다.

`INGRESS` 600/60초는 위조 세션 cookie를 포함한 과도한 요청이 세션 DB 조회에 도달하지 못하게 하는 높은 인프라 안전 상한이며 제품별 제한이 아니다. 세션 발급·관리자 로그인·예약 비밀번호·경로별 limiter, Neon rate-limit table, Durable Objects, KV, isolate-local memory와 WAF 규칙은 추가하지 않는다.

브라우저는 기존처럼 Pages same-origin `/api`를 호출한다. production Pages Function은 공개 `BACKEND_ORIGIN`이 아니라 `API_BACKEND` Service Binding으로 backend Worker를 호출한다. Pages Function은 사용자가 보낸 `X-Forwarded-For`와 `X-Room-Reservation-Client-IP`를 제거하고 Pages ingress의 `CF-Connecting-IP`만 `X-Room-Reservation-Client-IP`로 덮어쓴다. backend Worker는 `workers_dev=false`, `preview_urls=false`, route/custom domain 없음으로 두고 이 Service Binding에서만 도달 가능하게 한다. 따라서 별도 HMAC 또는 proxy secret은 추가하지 않는다.

Worker core/application은 `RateLimiter`와 `ClientIpProvider` 포트만 알고 Cloudflare binding과 내부 header는 어댑터에 격리한다. 처리 순서는 신뢰 IP 확인, INGRESS limiter, 정상 형식의 session cookie만 session 조회, 관리자 판정, 비관리자 READ/WRITE limiter, 기존 CSRF, body/password/Neon 처리다. production에서 신뢰 IP가 없거나 어떤 binding 호출이라도 실패하면 세션 조회·제품 Neon query·bcrypt 전에 `RATE_LIMIT_UNAVAILABLE` 서버 의존성 오류로 fail closed한다. 로그에는 환경과 정책·경로·method만 남기며 IP, session token, session hash, password와 CSRF token 원문을 남기지 않는다.

`ROOM-SESSION`은 32바이트 난수의 padding 없는 base64url 표현인 43자 `[A-Za-z0-9_-]`만 DB 조회 후보로 인정한다. 형식이 틀린 cookie는 존재하지 않는 세션처럼 처리하고 DB를 조회하지 않는다. 이는 형식에 맞는 임의 token을 막지 못하는 보조 방어이며 INGRESS guard를 대체하지 않는다.

UAT와 production은 INGRESS/READ/WRITE에 서로 다른 여섯 개의 양의 정수 namespace를 사용한다. local, unit, CI와 전체 로컬 E2E는 production namespace를 호출하지 않고 deterministic fake 또는 local adapter를 사용한다. production에는 limiter를 끄는 일반 환경변수나 disable flag를 두지 않는다.

rate limit과 신뢰 가능한 클라이언트 IP 판정이 완료되기 전에는 실제 공개 예약 접수를 활성화하지 않는다.

## 15. 관리자 계정 정책

### 서버리스 마이그레이션 단계

P4 서버리스 마이그레이션에서는 현재 환경변수 기반 단일 관리자 계정을 유지한다.

- 관리자 사용자명과 비밀번호는 Cloudflare Worker secret으로 관리
- 관리자 계정 DB 테이블을 추가하지 않음
- 기존 Spring의 `admins` 테이블을 신규 V1에 승계하지 않음
- 다중 계정 기능을 미리 구현하지 않음
- 역할·권한 시스템을 미리 구현하지 않음
- 기존 로그인 UX와 세션 동작 유지
- 관리자 자격 증명을 코드, 저장소 또는 평문 일반 Variable에 노출하지 않음

### P7 다중 계정 시스템

다중 관리자 계정 시스템은 P7에서 도입하는 것으로 확정한다. 다만 P4에는 포함하지 않는다.

P7에서는 다음을 별도로 설계한다.

- 관리자 개인별 계정
- 역할·권한 모델
- 계정 생성·비활성화·비밀번호 변경
- 관리자 작업의 개인별 감사 추적
- 계정 복구
- 최초 관리자 생성 방식
- 현재 환경변수 계정의 최종 역할

현재 단일 관리자 계정은 P7 이후에도 master 또는 복구 계정으로 유지할 가능성이 있다. 다만 상시 활성화된 감사 불가능한 우회 계정으로 운영하지 않는다.

우선 검토할 대안은 bootstrap 또는 break-glass 계정이다.

- 최초 관리자 계정 생성에 사용하는 bootstrap 계정
- 평상시 비활성화 가능한 emergency 계정
- 별도의 활성화 flag
- 강력한 임의 비밀번호
- 정기적인 secret 교체
- 사용 시 감사 이력 기록
- 일반 운영은 개인별 관리자 계정 사용

최종 방식은 P7 설계에서 결정한다.

## 16. Readiness와 콜드 스타트

현재 프런트 readiness gate는 Render 콜드 스타트를 처리하기 위해 존재한다.

마이그레이션 중에는 다음을 적용한다.

- 기존 공개 설정 API 계약 유지
- 기존 readiness gate 동작 유지
- readiness 응답이 요구하는 `slotMinutes: 5` 호환 필드 유지
- Worker 백엔드에 Render의 지연을 인위적으로 재현하지 않음
- keep-alive 요청이나 외부 ping을 추가하지 않음
- Worker 환경에서 즉시 성공하면 gate가 자연스럽게 통과하도록 함

제거 대상은 Render 전용 백엔드·배포 콜드 스타트 대응 코드와 keep-alive 구성이다.

프런트 readiness gate는 제거 대상에 포함하지 않는다.

Readiness gate 제거 여부는 서버리스 운영 안정화 이후 별도 UI 작업으로 판단한다.

## 17. DB 초기화와 Worker baseline V1

실제 서비스 운영은 2026년 9월부터 시작한다. 서버리스 마이그레이션과 안정화는 실제 운영 시작 전에 완료한다.

Neon PostgreSQL 서비스는 유지하되 기존 Spring schema, 데이터 및 Flyway migration 이력은 폐기한다.

현재 저장된 모든 데이터는 사전 운영·개발·스모크 테스트 데이터로 간주하며 신규 Worker DB로 이전하지 않는다.

폐기 대상은 다음과 같다.

- 예약
- 반복 예약
- 공간
- 태그
- 운영 설정
- 감사 이력
- 세션
- 테스트 데이터
- Spring 관리자 테이블
- Flyway migration 이력

기존 데이터에 대한 rollback 목적의 별도 백업은 생성하지 않는다.

초기화 직전에는 실제 운영이 시작되지 않았고 실제 운영 데이터가 없다는 사실을 읽기 전용으로 최종 확인한다.

예상하지 못한 실제 운영 데이터가 발견되면 초기화를 즉시 중단하고 별도의 데이터 이전 계획을 수립한다. 데이터를 자동 보정하거나 임의 삭제하지 않는다.

### 초기화 전 사전 검증

기존 Spring 데이터와 Flyway 이력을 폐기하기 전에 다음 조건을 충족해야 한다.

- Worker 구현과 baseline V1이 격리된 빈 PostgreSQL 저장소에서 동작함
- 신규 빈 DB에 baseline V1 단독 적용이 성공함
- Worker unit·integration·contract 테스트가 통과함
- 기존 React 프런트엔드 production build가 성공함
- 격리된 비운영 환경에서 기존 React 전체 E2E가 통과함
- 테스트 종료 후 `testing-*` 데이터 정리가 완료됨

전체 E2E를 수행하는 Worker는 명시적인 `e2e` 또는 `uat` 실행 환경으로 배포한다.

실제 운영이 시작되지 않았다는 시간적 상태만으로 `prod` 실행 환경을 non-prod로 간주하지 않는다.

E2E cleanup 경로는 다음 두 조건을 모두 만족하는 경우에만 등록한다.

- 실행 환경이 `prod`가 아님
- E2E cleanup flag가 명시적으로 활성화됨

`prod` 실행 환경에서는 cleanup flag 값과 관계없이 cleanup route를 등록하지 않는다.

구체적인 실행 환경 식별 방식과 설정 이름은 P3에서 결정하되 위의 보호 조건은 변경하지 않는다.

이 조건을 충족하지 못하면 기존 Spring schema와 Flyway 이력을 폐기하지 않는다.

### 신규 V1 원칙

신규 baseline V1은 기존 Spring schema의 테이블·열·enum·외래키를 기계적으로 합친 migration이 아니다.

현재 제품 동작, API 계약, 데이터 무결성, 보안 속성 및 조회 요구사항을 만족하는 Worker 기준 논리 스키마를 새로 정의한다.

다음을 자동 승계하지 않는다.

- `admins` 테이블
- `admin_role` enum
- 관리자 FK 중심의 Spring 감사 구조
- DB의 `slot_minutes`
- `flyway_schema_history`
- Hibernate/JPA를 위한 물리 구조
- 사용되지 않는 기존 index와 constraint
- Java 구현에 종속된 명명

신규 V1에는 다음 제품 요구사항을 구현하는 구조가 포함되어야 한다.

- 공간
- 예약
- 반복 예약
- 태그
- 운영 설정
- 감사 이력
- 예약 상태와 출처
- 시간 정밀도와 5분 정렬 검증
- 운영 시작·종료의 30분 정렬
- 최소·최대 예약 시간 검증
- 동시 예약 충돌 방지
- 삭제된 공간 기록 보존
- 조회 성능에 필요한 index
- 필수 시스템 데이터
- 기본 운영 설정

신규 V1을 처음 적용한 직후에는 다음 상태여야 한다.

- 예약 0건
- 반복 예약 0건
- 감사 이력 0건
- 일반 공간 0건
- 사용자 정의 태그 0건
- 필수 시스템 데이터 존재
- 기본 운영 설정 존재
- 공개 예약 접수 비활성화
- `testing-*` 데이터 0건

운영 준비가 끝난 후에는 다음 상태여야 한다.

- 실제 운영 설정 존재
- 실제 운영 공간 존재
- 필요한 실제 운영 태그 존재
- 예약 0건
- 반복 예약 0건
- 감사 이력 0건
- `testing-*` 데이터 0건
- 실제 Go-Live 전까지 공개 예약 접수 비활성화

운영 시작 이후에는 이 초기화 정책을 다시 사용할 수 없다. 실제 운영 데이터가 생긴 이후의 구조 변경에는 별도의 forward migration이 필요하다.

## 18. 환경 교체와 운영 전 전환

이번 마이그레이션은 운영 중인 시스템의 무중단 컷오버가 아니다.

현재 환경은 실제 운영 전이며 저장된 데이터도 모두 테스트 데이터이므로, 백엔드 교체 과정에서 일시적인 서비스 중단을 허용한다.

별도의 무중단 전환, dual-write 또는 DB와 독립적인 maintenance gate를 구현하지 않는다.

Worker 백엔드 교체와 실제 Go-Live는 서로 다른 단계로 구분한다.

### Worker 백엔드 교체

다음 순서로 진행한다.

1. 17절의 초기화 전 사전 검증이 통과했는지 확인한다.
2. 실제 운영이 아직 시작되지 않았음을 확인한다.
3. 기존 데이터에 실제 운영 데이터가 없는지 읽기 전용으로 최종 확인한다.
4. 실제 운영 데이터가 발견되면 작업을 중단하고 별도 이전 계획을 수립한다.
5. 기존 Render Spring Boot 서비스를 중지한다.
6. 기존 Spring 데이터, schema 및 Flyway migration 이력을 폐기한다.
7. 빈 Neon PostgreSQL 저장소에 Worker 기준 baseline V1을 적용한다.
8. Cloudflare Workers를 명시적인 `e2e` 또는 `uat` 실행 환경으로 배포하고 `/api`를 Worker에 연결한다.
9. Non-prod 실행 환경과 E2E cleanup flag가 모두 확인된 경우에만 보호된 E2E cleanup 경로를 활성화한다.
10. 실제 same-origin `/api` 경로에서 기존 React 전체 E2E를 수행한다.
11. 배포된 Worker revision과 실행 환경을 확인하고, 실제 same-origin `/api`를 대상으로 API 계약과 주요 기능을 검증한다.
12. 테스트가 생성한 리소스를 ID 기반으로 정리한다.
13. 필요한 경우 `testing-*` prefix 기반 보조 정리를 수행한다.
14. 예약·반복 예약·감사 이력과 `testing-*` 데이터가 0건인지 확인한다.
15. 마지막 전체 E2E를 통과한 Worker 코드 커밋 또는 build artifact와 baseline V1을 운영 배포 후보로 고정한다.
16. 동일한 Worker 코드 커밋 또는 build artifact와 동일한 baseline V1을 사용해 명시적인 `prod` 실행 환경으로 다시 배포한다.
17. 16번의 운영 배포에서는 실행 환경, secret 및 운영 설정만 변경하며 검증된 제품 코드를 임의로 변경하지 않는다.
18. `prod` 실행 환경에서 cleanup route가 등록되지 않았고 해당 경로를 호출할 수 없는지 확인한다.
19. 관리자 화면에서 실제 운영 설정·공간·태그를 새로 등록한다.
20. 공개 예약 접수는 비활성화 상태로 유지한다.
21. readiness, 공개 설정, 관리자 로그인·세션·로그아웃, CSRF와 주요 읽기 API에 대한 최종 smoke test를 수행한다.
22. 실제 운영 설정·공간·태그만 존재하는지 확인한다.
23. 예약·반복 예약·감사 이력과 `testing-*` 데이터가 0건인지 다시 확인한다.
24. Worker 환경을 실제 운영 시작 전까지 안정화한다.

백엔드 교체 과정에서 일시적으로 웹사이트 또는 `/api`가 정상 동작하지 않는 시간은 허용한다.

### 운영 전 수정

실제 운영이 시작되기 전 발견되는 문제는 다음 방식으로 해결한다.

- Worker 코드 수정과 재배포
- baseline V1 수정
- Worker 데이터 저장소 재초기화
- 전체 자동화 테스트와 E2E 재수행
- 테스트 데이터 정리
- 실제 운영 설정 재입력

마지막 전체 E2E 이후 Worker 코드 또는 baseline V1을 수정하면 기존 운영 배포 후보 고정은 무효가 된다.

변경된 Worker 코드와 baseline V1을 새로운 후보로 다시 식별하고 다음 검증을 다시 수행한다.

- 빈 DB에 baseline V1 단독 적용
- Worker unit·integration·contract 테스트
- React production build
- 명시적인 `e2e` 또는 `uat` 실행 환경에서 same-origin 전체 E2E
- 테스트 데이터와 감사 이력 정리
- `testing-*` 데이터 0건 확인

새로운 후보가 위 검증을 통과한 후에만 동일 코드와 동일 baseline V1을 `prod` 실행 환경으로 배포할 수 있다.

실행 환경, secret 등 운영 설정만 변경하고 Worker 코드와 baseline V1이 그대로인 경우에는 전체 E2E를 반복하지 않고 최종 production smoke로 운영 설정 차이를 검증할 수 있다.

### 실제 Go-Live

2026년 9월 실제 운영을 시작할 때 다음을 확인한다.

- Worker 배포가 안정화되어 있음
- E2E cleanup route가 운영 배포에 등록되지 않음
- 실제 운영 설정·공간·태그가 입력되어 있음
- 예약·반복 예약·감사 이력 0건
- `testing-*` 데이터 0건
- readiness와 주요 공개·관리자 기능 정상
- 실제 운영 데이터가 아직 없음

모든 조건을 확인한 후 공개 예약 접수를 활성화한다.

공개 예약 접수를 활성화하기 전에는 추가로 다음을 확인한다.

- 14절의 공개 API rate limit과 429 응답 계약 구현·검증 완료
- Pages `API_BACKEND` Service Binding에서 backend Worker로 전달되는 클라이언트 IP의 인증된 신뢰 경계 확인
- 클라이언트가 주입한 `X-Forwarded-For`와 `X-Room-Reservation-Client-IP`를 모두 제거하고 Pages ingress 값으로 덮어씀
- production Worker의 `workers_dev=false`, `preview_urls=false`, route/custom domain 없음 확인
- UAT와 production INGRESS/READ/WRITE namespace 여섯 개가 모두 분리됐는지 확인
- 위조 session cookie가 세션 조회 전에 INGRESS guard를 통과해야 하고 형식 오류 cookie는 DB 조회 후보가 아닌지 확인

실제 운영 시작 이후에는 다음 원칙을 적용한다.

- 데이터 저장소를 초기화하지 않음
- baseline V1을 수정하지 않음
- V2 이상의 TypeScript forward migration 사용
- 실제 운영 데이터를 보존하며 Worker를 수정·재배포
- Spring 또는 Render 환경으로 되돌리지 않음

Worker 배포 버전 rollback은 현재 DB schema와 호환되는 경우에만 사용할 수 있다. 이는 Spring 시스템이나 기존 Spring DB로 되돌리는 것을 의미하지 않는다.

## 19. 기존 Spring 환경 폐기

Worker 백엔드 교체와 실제 same-origin E2E가 성공하면 기존 Spring 환경을 폐기한다.

Spring 데이터, schema 및 Flyway 이력은 18절의 환경 교체 단계에서 폐기한다.

나머지 폐기 범위는 다음과 같다.

- Render Spring Boot 서비스
- 기존 Spring 전용 DB 자격 증명
- Render 환경변수와 secret
- 기존 backend origin 설정
- Spring 전용 배포·운영 문서
- 사용하지 않는 Spring 관련 인프라와 secret

Worker에서 사용하는 Neon 자격 증명과 Worker secret은 폐기 대상에 포함하지 않는다.

기존 Spring 자격 증명과 Worker 자격 증명을 명확하게 구분하고 Spring 전용 자격 증명만 폐기한다.

`spring-baseline-v1` Git 태그는 역사적 기준점으로 유지할 수 있지만 운영 rollback 수단으로 간주하지 않는다.

폐기 이후에는 Cloudflare Workers와 Worker 기준 PostgreSQL 데이터 저장소를 유일한 백엔드 환경으로 사용한다.

실제 운영 시작 전까지는 Worker 환경을 비운영 검증 및 안정화 상태로 유지한다.

## 20. 의도적으로 제거할 현재 구현

다음은 제품 계약이 아니므로 신규 백엔드에 그대로 옮기지 않는다.

- Spring Boot
- Spring MVC controller 구조
- Spring Data JPA
- Hibernate entity 구조
- Spring Security의 구체적인 설정 방식
- Flyway 실행 체계
- 기존 Spring 물리 schema
- 사용되지 않는 `admins` 구조
- 설정값으로서의 DB `slot_minutes`
- Dockerfile
- Render `PORT`
- Render health check
- Render 전용 백엔드 콜드 스타트 대응 코드
- keep-alive 구성
- Java package 구조
- `application-*.yml`
- Java 전용 환경변수 검증 구현

단, 이 구현들이 제공하던 제품 동작과 보안 속성은 별도로 유지한다.

프런트 readiness gate는 이 제거 목록에 포함되지 않는다.

## 21. P3 기술 결정

다음 항목을 P3 최소 기술 검증 대상으로 삼았다.

- Hono 사용 여부
- raw Fetch API와 Hono의 경계
- Neon 연결 드라이버
- ORM 또는 query builder 사용 여부
- TypeScript migration 도구
- transaction과 동시성 제어 방식
- 세션 저장 방식
- CSRF 구현 방식
- 비밀번호 해싱 구현
- Pages Function proxy 유지 여부
- Workers route 구성
- rate limit 구현 범위와 Go-Live gate 이전
- Cloudflare 클라이언트 IP 판정 어댑터
- 감사 행위자 저장 구조
- 로그·관측성 방식
- Workers 무료 한도에서의 예상 사용량
- 로컬 개발·테스트 환경 구성
- Neon 초기화 및 Worker V1 적용 절차
- 격리된 비운영 same-origin E2E 환경 구성
- `e2e` 또는 `uat`와 `prod` 실행 환경의 식별·분리 방식
- E2E cleanup의 non-prod profile 및 명시적 flag 이중 보호 방식
- `prod` 실행 환경에서 cleanup route를 등록하지 않는 방식
- 검증된 Worker 코드 commit 또는 build artifact의 식별 방식
- 검증된 baseline V1의 식별 및 동일성 확인 방식
- 비운영 검증 구성과 운영 구성의 분리

P3는 위 항목을 실제 최소 코드와 원격 환경에서 검증하고 아래 P4 구현 결정을 확정했다.

P3 결과로 다음을 확정한다.

- TypeScript Cloudflare Worker와 Neon PostgreSQL 채택
- D1 채택 취소
- Hono는 HTTP 계층에만 사용
- Neon HTTP query, HTTP batch transaction, 요청 범위 WebSocket transaction 구분
- `node-pg-migrate` TypeScript migration 사용
- Neon PostgreSQL session 저장과 기존 CSRF cookie/header 계약 유지
- 1차 마이그레이션에서 기존 Pages Function `/api` proxy 유지
- 공개 예약 비밀번호는 printable ASCII 4~64자와 `pgcrypto` bcrypt cost 12 사용
- rate limit은 P4 완료 조건에서 제외하고 실제 Go-Live 전 필수 보안 gate로 이전

제품 정책과 외부 API 동작은 원칙적으로 P3 기술 선택을 이유로 변경하지 않는다. 단, 14절의 공개 예약 비밀번호 정책은 기존 bcrypt 72-byte 잠재 문제를 해결하기 위해 사용자가 명시적으로 승인한 예외다.

P3에서 기술적으로 현행 계약을 유지할 수 없는 항목이 발견되면 임의로 정책을 축소하지 않고 구현 전에 사용자에게 보고한다.

## 22. 마이그레이션 완료 조건

다음 조건을 모두 충족해야 서버리스 마이그레이션 완료로 판정한다.

### 코드와 계약

- 기존 React production build 성공
- 기존 전체 프런트 E2E 통과
- 기준 버전의 백엔드 동작을 TS unit·integration·contract 테스트로 이전
- 공개 예약 생성·조회·수정·취소 통과
- 공개 availability 검사 통과
- 관리자 로그인·세션·로그아웃 통과
- 관리자 예약 승인과 상태 변경 통과
- 공간·태그 관리 통과
- 반복 예약 미리보기·생성·목록/상세 조회·취소 통과
- 운영 설정과 감사 이력 기능 통과
- 관리자 예약 CSV 내보내기 통과
- KST·UTC 시간 회귀 테스트 통과
- 날짜 종료 경계 테스트 통과
- 서버 clock 기준 과거·미래 검증 통과
- 5분 예약·30분 시간표 정책 통과
- 공개 과거 예약 거부와 관리자 과거 예약 허용 통과
- 동시 예약 충돌 방지 검증
- page size 상한과 날짜 조회 범위 확인

### 보안

- `XSRF-TOKEN` cookie 이름 유지 확인
- `X-XSRF-TOKEN` 요청 header 이름 유지 확인
- CSRF 검증 통과
- Session cookie의 `Secure`, `HttpOnly`, `SameSite=Lax` 확인
- 운영 `XSRF-TOKEN`의 `Secure`, `HttpOnly=false`, `SameSite=Lax`, `Path=/` 확인
- 로그아웃 후 보호 API 401 확인
- 공개 예약 비밀번호가 평문으로 저장되지 않음
- 공개 예약 비밀번호 ASCII 4자와 64자 성공
- 공개 예약 비밀번호 3자와 65자 거부
- 한글·공백·emoji·전각 문자 거부
- ASCII 특수문자 허용과 영문 대·소문자 구분
- 한글 자판 상태에서 브라우저의 네이티브 영문 password 입력 동작 확인
- 붙여넣기 비ASCII 값의 프런트 차단 확인
- API 직접 호출의 비ASCII 값 거부
- bcrypt hash에 평문이 남지 않음
- 올바른 공개 예약 비밀번호 검증 성공과 잘못된 비밀번호 검증 실패
- 관리자 자격 증명이 Worker secret으로 관리됨

### CSV

- `/api/admin/exports/reservations.csv` 유지
- 관리자 인증 확인
- 현재 검색·필터 조건 반영
- 목록 pagination과 무관하게 전체 조건 결과 내보내기
- UTF-8 BOM 확인
- `Content-Type: text/csv;charset=UTF-8` 확인
- `Content-Disposition`과 `reservations.csv` 파일명 확인
- 기존 CSV 열 이름과 순서 확인
- `yyyy-MM-dd HH:mm:ss` 서울 시간 형식 확인
- 쉼표·따옴표·줄바꿈 escaping 확인

### DB와 마이그레이션

- 격리된 비운영 빈 DB에 Worker V1 단독 적용 성공
- Worker unit·integration·contract 테스트 통과
- 명시적인 `e2e` 또는 `uat` 실행 환경의 same-origin 경로에서 전체 E2E 통과
- 기존 Spring schema와 Flyway 이력 비승계 확인
- DB에 `slot_minutes`가 없는 상태로 정책 검증
- API 응답의 `slotMinutes: 5` 호환 확인
- 필수 시스템 데이터와 기본 운영 설정 생성
- 기본 공개 예약 접수 비활성화 확인
- 관리자 화면에서 운영 설정 신규 저장 성공
- 실제 운영 공간·태그 신규 등록 성공
- 실제 운영 데이터가 없음을 초기화 직전에 재확인
- 예상하지 못한 운영 데이터 발견 시 중단 조건 확인

### E2E 데이터 위생

- 실제 운영 전이라는 이유만으로 `prod` 실행 환경을 non-prod로 간주하지 않음
- E2E cleanup은 `prod`가 아닌 실행 환경에서만 사용
- E2E cleanup flag가 명시적으로 활성화된 경우에만 cleanup route 등록
- `testing-*` 식별자 사용
- ID 기반 정리 우선
- E2E 종료 후 `testing-*` 데이터 0건 확인
- `prod` 실행 환경에서 cleanup route가 등록되지 않음
- 운영 cleanup 경로 호출 시 404 등 사용할 수 없는 상태 확인
- 최종 예약·반복 예약·감사 이력 0건 확인

### 배포와 운영 준비

- Cloudflare Workers 무료 환경 배포 성공
- keep-alive 없이 정상 동작
- `/api`가 Worker 백엔드로 연결됨
- 명시적인 `e2e` 또는 `uat` 실행 환경의 실제 same-origin `/api`에서 전체 E2E 통과
- E2E 종료 후 테스트 데이터 정리 완료
- 마지막 전체 E2E를 통과한 Worker 코드 커밋 또는 build artifact 식별
- 마지막 전체 E2E를 통과한 baseline V1 식별
- 동일한 코드와 baseline V1을 사용해 `prod` 실행 환경으로 재배포
- 운영 배포에서는 실행 환경·secret 등 운영 설정만 변경
- `prod`에서 cleanup route가 등록되지 않았는지 확인
- 실제 운영 설정·공간·태그 등록
- readiness와 주요 공개·관리자 smoke 통과
- 공개 예약 접수 비활성화 상태 확인
- Spring rollback 절차가 없음을 확인
- Render와 Spring 전용 인프라 폐기 확인
- 실제 운영 시작 전 안정화 상태 확인

서버리스 마이그레이션 완료는 실제 공개 예약 접수 시작과 구분한다.

실제 Go-Live는 2026년 9월에 별도 최종 확인 후 공개 예약 접수를 활성화하는 시점이다.

INGRESS 600과 기존 READ 120/WRITE 24 수치, 429, `RATE_LIMIT_EXCEEDED`, `Retry-After`, Service Binding 기반 클라이언트 IP 판정, 세션 조회 전 보호 순서와 isolate-local memory 비의존 여부는 P4 핵심 재작성과 분리된 실제 Go-Live 전 필수 완료 조건이다. 구현과 UAT가 끝나더라도 별도 전환 작업에서 production binding·Pages 설정과 최종 smoke를 확인하기 전에는 공개 예약 접수를 활성화하지 않는다.

## 23. 변경 통제

마이그레이션 중 기존 제품보다 더 좋아 보이는 구조나 기능이 발견되어도 임의로 추가하지 않는다.

다음은 별도 작업으로 분리한다.

- UI/UX 개선
- P7 다중 관리자 계정 시스템
- 새로운 권한 체계
- 이메일 알림
- 다일 예약
- 예외 휴일
- 공간별 운영시간
- API 이름 정리
- `slotMinutes` API 호환 필드 최종 제거
- CSS 리팩터링
- 프런트 Workers Static Assets 통합
- readiness gate 제거
- 데이터 분석 기능
- CSV 비동기 처리 또는 내보내기 상한 변경
- CSRF cookie와 header 이름 변경

제품 계약 변경이 필요하면 구현 전에 이유와 영향을 설명하고 사용자 승인을 받는다.
