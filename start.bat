@echo off
chcp 65001 >nul
title Videobox

echo.
echo   ╔══════════════════════════════╗
echo   ║     V I D E B O X           ║
echo   ║  视频下载 + 智能语音识别     ║
echo   ╚══════════════════════════════╝
echo.
echo   正在启动开发服务器...
echo.

cd /d "%~dp0"

:: 设置 Node.js 使用系统 CA 证书（解决证书验证问题）
set NODE_OPTIONS=--use-system-ca
set NODE_TLS_REJECT_UNAUTHORIZED=0

:: 启动
call npm run dev

pause
