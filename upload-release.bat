@echo off
REM Set your GitHub token first: set GH_TOKEN=xxx
echo Building and publishing to GitHub...
cd /d D:\1\videobox
call npm run build
echo Done!
pause
