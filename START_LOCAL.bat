@echo off
chcp 65001 > nul
title 멍냥대난투 로컬 서버
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 설치되어 있지 않습니다.
  echo https://nodejs.org 에서 Node.js LTS를 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
if not exist node_modules (
  echo 처음 실행입니다. 필요한 패키지를 설치합니다...
  call npm install
  if errorlevel 1 (
    echo npm install 실패. 인터넷 연결을 확인하세요.
    pause
    exit /b 1
  )
)
echo.
echo 멍냥대난투 실행: http://localhost:3000
echo 종료하려면 이 창에서 Ctrl+C
start "" http://localhost:3000
npm start
pause
