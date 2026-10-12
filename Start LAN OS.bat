@echo off
rem Double-click to start LAN OS. Keep this window open while LAN OS runs; close it to stop.
title LAN OS
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org and double-click this file again.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)"
if errorlevel 1 (
  echo Your Node.js is too old. Install the latest Node.js 22 LTS from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First start: installing LAN OS. This takes a minute...
  call npm install
  if errorlevel 1 goto failed
)
echo Preparing the screens...
call npm run build --silent
if errorlevel 1 goto failed

:run
node apps\server\src\main.ts %LANOS_MODE%
if %errorlevel%==0 goto end
if %errorlevel%==2 (
  echo.
  echo Fix the settings above, save the file, then press any key to try again.
  pause >nul
  goto run
)
echo.
echo LAN OS stopped unexpectedly. The crash report is in data\logs\crashes and on the admin page.
echo Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto run

:failed
echo.
echo Something went wrong while installing or preparing LAN OS. Scroll up to read the message.
pause

:end
