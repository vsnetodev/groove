@echo off
setlocal
cd /d "%~dp0"
where npm.cmd >nul 2>nul
if errorlevel 1 (echo Instale Node.js 22 LTS ou 24 LTS primeiro. & pause & exit /b 1)
call npm.cmd ci
if errorlevel 1 goto erro
call npm.cmd run check
if errorlevel 1 goto erro
call npm.cmd run build
if errorlevel 1 goto erro
echo Compilacao concluida. Configure .env conforme README.md para executar o aplicativo.
pause
exit /b 0
:erro
echo Falha. Copie a mensagem exibida acima para diagnostico.
pause
exit /b 1
