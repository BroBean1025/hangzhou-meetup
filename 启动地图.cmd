@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.13 或更新版本，再打开此文件。
  pause
  exit /b 1
)
if not exist ".env" (
  node scripts/setup.mjs
  echo 请在打开的文件中填写高德 Web 服务 Key，保存关闭后再次运行此文件。
  notepad .env
  pause
  exit /b 0
)
node --env-file=.env scripts/doctor.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
echo 浏览器打开 http://localhost:8080；保持本窗口开启。
node --env-file=.env server.mjs
pause
