@echo off
setlocal EnableDelayedExpansion
title SLM Workflow Platform - Demo Launcher
color 0A

echo.
echo  =========================================================
echo   SLM Workflow Platform  -  Demo Launcher
echo  =========================================================
echo.

echo  [S01] Setting root paths...
set "DEMO_DIR=%~dp0"
if "%DEMO_DIR:~-1%"=="\" set "DEMO_DIR=%DEMO_DIR:~0,-1%"
set "BACKEND_DIR=%DEMO_DIR%\backend"
set "FRONTEND_DIR=%DEMO_DIR%\frontend"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "VENV_UV=%VENV_DIR%\Scripts\uvicorn.exe"
echo  [S02] DEMO_DIR    = %DEMO_DIR%
echo  [S03] BACKEND_DIR = %BACKEND_DIR%
echo  [S04] FRONTEND_DIR= %FRONTEND_DIR%
echo  [S05] VENV_DIR    = %VENV_DIR%
echo.

:: ── [1/5] Python ─────────────────────────────────────────────
echo  [S06] Checking Python in PATH...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo  [S06-FAIL] Python not found. Install Python 3.11+ and tick "Add to PATH".
    pause & exit /b 1
)
echo  [S07] Python found:
python --version
echo.

:: ── [2/5] Node ───────────────────────────────────────────────
echo  [S08] Checking Node.js in PATH...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [S08-FAIL] Node.js not found. Install from nodejs.org
    pause & exit /b 1
)
echo  [S09] Node.js found:
node --version
echo.

:: ── [3/5] Backend ────────────────────────────────────────────
echo  [S10] Changing directory to backend...
cd /d "%BACKEND_DIR%"
echo  [S11] Current dir: %CD%

echo  [S12] Checking for existing venv...
if exist "%VENV_DIR%" (
    echo  [S13] Old venv found - removing...
    rmdir /s /q "%VENV_DIR%"
    echo  [S14] Old venv removed. Waiting 1s...
    timeout /t 1 /nobreak >nul
) else (
    echo  [S13] No existing venv found.
)

echo  [S15] Creating new virtual environment...
python -m venv "%VENV_DIR%"
if %errorlevel% neq 0 (
    echo  [S15-FAIL] Could not create venv.
    pause & exit /b 1
)
echo  [S16] Venv created.

echo  [S17] Verifying venv python.exe exists...
if not exist "%VENV_PY%" (
    echo  [S17-FAIL] python.exe not found at: %VENV_PY%
    pause & exit /b 1
)
echo  [S18] Venv python.exe OK: %VENV_PY%

echo  [S19] Installing fastapi...
"%VENV_PY%" -m pip install --no-warn-script-location fastapi
if %errorlevel% neq 0 ( echo  [S19-FAIL] fastapi install failed. & pause & exit /b 1 )
echo  [S20] fastapi installed OK.

echo  [S21] Installing uvicorn...
"%VENV_PY%" -m pip install --no-warn-script-location uvicorn
if %errorlevel% neq 0 ( echo  [S21-FAIL] uvicorn install failed. & pause & exit /b 1 )
echo  [S22] uvicorn installed OK.

echo  [S23] Installing python-multipart...
"%VENV_PY%" -m pip install --no-warn-script-location python-multipart
if %errorlevel% neq 0 ( echo  [S23-FAIL] python-multipart install failed. & pause & exit /b 1 )
echo  [S24] python-multipart installed OK.

echo  [S25] Verifying uvicorn.exe exists...
if not exist "%VENV_UV%" (
    echo  [S25-FAIL] uvicorn.exe not found at: %VENV_UV%
    pause & exit /b 1
)
echo  [S26] uvicorn.exe OK.
echo  [S27] Backend setup complete.
echo.

:: ── [4/5] Frontend ───────────────────────────────────────────
echo  [S28] Changing directory to frontend...
cd /d "%FRONTEND_DIR%"
echo  [S29] Current dir: %CD%

echo  [S30] Checking package.json...
if not exist "%FRONTEND_DIR%\package.json" (
    echo  [S30-FAIL] package.json not found in: %FRONTEND_DIR%
    pause & exit /b 1
)
echo  [S31] package.json found.

echo  [S32] Checking node_modules...
if not exist "%FRONTEND_DIR%\node_modules" (
    echo  [S33] node_modules missing - running npm install...
    call npm install
    if %errorlevel% neq 0 ( echo  [S33-FAIL] npm install failed. & pause & exit /b 1 )
    echo  [S34] npm install complete.
) else (
    echo  [S33] node_modules already present, skipping.
)
echo  [S35] Frontend setup complete.
echo.

:: ── [5/5] Launch ─────────────────────────────────────────────
echo  [S36] Launching backend window...
start "SLM Backend [8000]" cmd /k "title SLM Backend [8000] && cd /d "%BACKEND_DIR%" && "%VENV_UV%" main:app --host 0.0.0.0 --port 8000 --reload && pause"
echo  [S37] Backend window opened. Waiting 4s...
timeout /t 4 /nobreak >nul

echo  [S38] Launching frontend window...
start "SLM Frontend [5173]" cmd /k "title SLM Frontend [5173] && cd /d "%FRONTEND_DIR%" && npm run dev && pause"
echo  [S39] Frontend window opened. Waiting 6s for Vite...
timeout /t 6 /nobreak >nul

echo  [S40] Opening browser...
start "" "http://localhost:5173"

echo.
echo  =========================================================
echo   [S41] Demo is running!
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:8000/docs
echo  =========================================================
echo.
pause
