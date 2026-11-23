@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "process.exit(Number(process.versions.node.split('.')[0]) < 20 ? 1 : 0)" >nul 2>nul
if errorlevel 1 goto nonode
node theme\edit.mjs %*
if errorlevel 1 (
  echo The edit command stopped with an error.
  pause
)
exit /b
:nonode
echo The editor needs Node.js 20 or later, which is not installed on this computer.
echo Install it from https://nodejs.org, then open this file again.
pause
exit /b 1
