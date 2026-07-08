@echo off
setlocal

pushd "%~dp0"

echo Starting PostgreSQL container...
docker compose up -d postgres
if errorlevel 1 (
  echo Failed to start PostgreSQL.
  popd
  exit /b 1
)

echo Starting Spring Boot backend with E2E cleanup endpoint enabled...
echo This is for local/dev test data cleanup only. Do not use for production.
set SPRING_PROFILES_ACTIVE=local
pushd backend
set E2E_CLEANUP_ENABLED=true
call gradlew.bat bootRun
set BACKEND_EXIT=%ERRORLEVEL%
popd

popd
exit /b %BACKEND_EXIT%
