@echo off
rem Stops LAN OS from starting by itself with Windows.
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LAN OS.lnk" 2>nul
echo Done. LAN OS no longer starts with Windows.
pause
