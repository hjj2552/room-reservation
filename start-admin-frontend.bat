@echo off
setlocal

pushd "%~dp0admin-frontend"

if not exist "node_modules\.bin\vite.cmd" (
  echo Installing frontend dependencies...
  call npm ci
  if errorlevel 1 (
    echo Failed to install frontend dependencies.
    popd
    exit /b 1
  )
)

echo Starting Vite admin frontend...
call npm run dev
set FRONTEND_EXIT=%ERRORLEVEL%

popd
exit /b %FRONTEND_EXIT%
