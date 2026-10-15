@echo off
rem Double-click to start LAN OS. Keep this window open while LAN OS runs; close it to stop.
title LAN OS
cd /d "%~dp0"

rem Use this PC's Node.js if it is new enough; otherwise use (or download) LAN OS's own copy in runtime\node.
call :checknode
if errorlevel 1 (
  if not exist runtime\node\node.exe (
    echo First start: downloading Node.js for LAN OS. Nothing is installed on Windows.
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\get-node.ps1"
    if errorlevel 1 goto nonode
  )
  set "PATH=%~dp0runtime\node;%PATH%"
  call :checknode
  if errorlevel 1 goto nonode
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

:nonode
echo.
echo Could not get Node.js. Check that this PC is online, then double-click this file again.
pause
exit /b 1

:checknode
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)" >nul 2>nul
exit /b %errorlevel%

:failed
echo.
echo Something went wrong while installing or preparing LAN OS. Scroll up to read the message.
pause
exit /b 1

:end
