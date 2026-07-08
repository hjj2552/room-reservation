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

echo Starting Spring Boot backend...
set SPRING_PROFILES_ACTIVE=local
pushd backend
call gradlew.bat bootRun
set BACKEND_EXIT=%ERRORLEVEL%
popd

popd
exit /b %BACKEND_EXIT%
