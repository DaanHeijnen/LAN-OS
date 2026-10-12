@echo off
rem Makes LAN OS start by itself when you sign in to Windows (a shortcut in your Startup folder).
rem To undo: double-click "Stop starting with Windows.bat".
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = (Get-Location).Path; $link = Join-Path ([Environment]::GetFolderPath('Startup')) 'LAN OS.lnk'; $s = (New-Object -ComObject WScript.Shell).CreateShortcut($link); $s.TargetPath = Join-Path $root 'Start LAN OS.bat'; $s.WorkingDirectory = $root; $s.WindowStyle = 7; $s.Save()"
if errorlevel 1 (
  echo That did not work. You can still start LAN OS by double-clicking "Start LAN OS.bat".
) else (
  echo Done. LAN OS now starts by itself when you sign in to Windows.
)
pause
