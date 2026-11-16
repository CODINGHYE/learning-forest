@echo off
setlocal
cd /d "%~dp0"
py -3 --version >nul 2>nul
if not errorlevel 1 (
  py -3 run.py %*
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3.11+ is required. Install Python from https://www.python.org/downloads/
    pause
    exit /b 1
  )
  python run.py %*
)
set "forest_exit=%errorlevel%"
if not "%forest_exit%"=="0" pause
exit /b %forest_exit%
