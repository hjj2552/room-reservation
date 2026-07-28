@echo off
setlocal

pushd "%~dp0"

if not exist ".env" (
  echo Missing .env. Copy .env.example to .env and fill in the local values first.
  popd
  exit /b 1
)

echo Starting local PostgreSQL container...
docker compose up -d --wait postgres
if errorlevel 1 (
  echo Failed to start PostgreSQL.
  popd
  exit /b 1
)

pushd worker
if not exist "node_modules\.bin\tsx.cmd" (
  echo Installing Worker dependencies...
  call npm.cmd ci --ignore-scripts
  if errorlevel 1 (
    echo Failed to install Worker dependencies.
    popd
    popd
    exit /b 1
  )
)

echo Applying local Worker database migrations and starting the Worker adapter...
call npm.cmd run dev
set WORKER_EXIT=%ERRORLEVEL%
popd

popd
exit /b %WORKER_EXIT%
