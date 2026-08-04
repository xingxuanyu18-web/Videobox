@echo off
chcp 65001 >nul
title Node.js 证书修复工具
echo.
echo   ╔══════════════════════════════════════╗
echo   ║   Node.js 证书问题 — 永久修复方案    ║
echo   ╚══════════════════════════════════════╝
echo.
echo   此脚本将解决 "unable to verify the first certificate" 错误
echo.

set "NPMRC=%USERPROFILE%\.npmrc"

echo [1/3] 配置 npm 使用系统 CA 证书...
echo node-options=--use-system-ca>> "%NPMRC%" 2>nul
echo registry=https://registry.npmmirror.com>> "%NPMRC%" 2>nul
echo ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/>> "%NPMRC%" 2>nul
echo   已配置: 使用 npmmirror 镜像 + 系统 CA

echo.
echo [2/3] 设置环境变量 (当前用户)...
setx NODE_OPTIONS "--use-system-ca" >nul 2>&1
setx NODE_EXTRA_CA_CERTS "" >nul 2>&1
echo   已设置: NODE_OPTIONS=--use-system-ca

echo.
echo [3/3] 验证 Node.js 网络连接...
node --use-system-ca -e "const https = require('https'); https.get('https://registry.npmmirror.com', (res) => { console.log('   状态码:', res.statusCode); console.log('   证书验证: 通过!'); });" 2>nul

echo.
echo   ┌──────────────────────────────────────────┐
echo   │  修复完成! 请重新打开终端运行:             │
echo   │                                          │
echo   │  cd D:\1\videobox                        │
echo   │  npm install                             │
echo   │  npm run dev                             │
echo   │                                          │
echo   │  或直接双击:  start.bat                   │
echo   └──────────────────────────────────────────┘
echo.
pause
