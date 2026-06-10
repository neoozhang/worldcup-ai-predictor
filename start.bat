@echo off
title World Cup 2026 AI Predictor
where node >/dev/null 2>&1
if %errorlevel% neq 0 (
    echo Node.js not found. Please install from https://nodejs.org
    pause
    exit /b 1
)
cd /d "%~dp0"
if not exist "node_modules" (
    echo Installing...
    call npm install
)
echo Opening http://localhost:3000
start http://localhost:3000
node server.js
pause
