@echo off
setlocal EnableExtensions EnableDelayedExpansion

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
if not exist "package-lock.json" (
  echo Missing Worker package-lock.json.
  popd
  popd
  exit /b 1
)

set "LOCKFILE_HASH="
for /f "usebackq delims=" %%H in (`powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference = 'Stop'; (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash" 2^>nul`) do set "LOCKFILE_HASH=%%H"
if not defined LOCKFILE_HASH (
  echo Failed to calculate Worker dependency lockfile hash.
  popd
  popd
  exit /b 1
)

set "LOCKFILE_STAMP=node_modules\.room-reservation-package-lock.sha256"
set "INSTALL_WORKER_DEPENDENCIES="
if not exist "node_modules\.bin\tsx.cmd" set "INSTALL_WORKER_DEPENDENCIES=1"
if not exist "!LOCKFILE_STAMP!" set "INSTALL_WORKER_DEPENDENCIES=1"

if not defined INSTALL_WORKER_DEPENDENCIES (
  set "STAMP_HASH="
  set /p "STAMP_HASH="<"!LOCKFILE_STAMP!" 2>nul
  if not defined STAMP_HASH set "INSTALL_WORKER_DEPENDENCIES=1"
  if /i not "!STAMP_HASH!"=="!LOCKFILE_HASH!" set "INSTALL_WORKER_DEPENDENCIES=1"
)

if defined INSTALL_WORKER_DEPENDENCIES (
  echo Worker dependencies are missing or out of sync. Installing...
  call npm.cmd ci --ignore-scripts
  if errorlevel 1 (
    echo Failed to install Worker dependencies.
    popd
    popd
    exit /b 1
  )

  set "LOCKFILE_STAMP_TMP=!LOCKFILE_STAMP!.tmp.!RANDOM!"
  >"!LOCKFILE_STAMP_TMP!" echo(!LOCKFILE_HASH!
  if errorlevel 1 (
    echo Failed to record Worker dependency state.
    if exist "!LOCKFILE_STAMP_TMP!" del /q "!LOCKFILE_STAMP_TMP!" >nul 2>&1
    popd
    popd
    exit /b 1
  )
  move /y "!LOCKFILE_STAMP_TMP!" "!LOCKFILE_STAMP!" >nul
  if errorlevel 1 (
    echo Failed to record Worker dependency state.
    if exist "!LOCKFILE_STAMP_TMP!" del /q "!LOCKFILE_STAMP_TMP!" >nul 2>&1
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
