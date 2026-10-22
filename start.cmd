@echo off
cd /d "%~dp0"
if not exist node_modules\express\package.json call npm ci --omit=dev
if errorlevel 1 exit /b %errorlevel%
call npm start
