@echo off
setlocal
cd /d "%~dp0"
node scripts\prepare-github.mjs
if errorlevel 1 (pause & exit /b 1)
explorer upload-github
pause
