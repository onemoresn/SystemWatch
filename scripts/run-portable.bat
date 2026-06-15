@echo off
title SiteCommand
cd /d "%~dp0.."
echo Starting SiteCommand (portable)...
if not exist "dist-bundle\sitecommand\api\dist\index.js" (
  echo Run scripts\prepare-desktop-bundle.ps1 first.
  pause
  exit /b 1
)
set SITECOMMAND_ROOT=%~dp0..\dist-bundle\sitecommand
set DATABASE_PATH=%LOCALAPPDATA%\SiteCommand\sitecommand.db
set PORT=3847
set HOST=127.0.0.1
start "" "http://127.0.0.1:%PORT%/"
node "%SITECOMMAND_ROOT%\api\dist\index.js"
pause
