@echo off
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+가 필요합니다.
  echo https://nodejs.org 에서 Node.js를 설치한 뒤 다시 실행해주세요.
  pause
  exit /b 1
)
start "병맛 동물 격투게임 REBOOT 서버" cmd /k "cd /d %~dp0 && node server.js"
timeout /t 2 /nobreak >nul
start "" http://localhost:8080
exit /b 0
