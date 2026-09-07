# 초간단 배포 가이드 — GitHub + Render Dashboard

이 게임은 친구 여러 명이 동시에 접속해야 하므로 HTML 파일만 올리는 GitHub Pages가 아니라 **Node.js 실시간 서버**가 필요합니다. 코드는 GitHub에 두고, 실제 게임 서버는 Render Web Service에서 실행하면 됩니다.

## 1. 압축 풀기

`pet-brawl-online-v1.zip`을 원하는 폴더에 풉니다.

## 2. GitHub에 올리기

1. GitHub 로그인
2. 새 Repository 생성
3. Repository 화면에서 Add file → Upload files
4. 압축을 푼 폴더 안의 파일/폴더를 전부 업로드
   - `public` 폴더
   - `server.js`
   - `package.json`
   - `render.yaml`
   - 나머지 문서 파일
5. Commit changes

중요: 압축 파일 자체를 저장소 안에 넣는 것이 아니라 **압축을 푼 내용물**을 저장소 루트에 올립니다.

## 3. Render Dashboard에서 서버 만들기

1. Render 로그인
2. Dashboard → New → Web Service
3. GitHub 계정 연결 후 방금 만든 저장소 선택
4. 아래 설정 입력
   - Language / Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/health`
5. Create Web Service / Deploy

`render.yaml`을 인식시키는 Blueprint 배포를 사용해도 됩니다.

## 4. 친구와 하기

배포가 끝나면 Render가 `https://xxxxx.onrender.com` 형태의 주소를 만듭니다.

1. 그 주소 접속
2. 방 만들기
3. 게임 안의 `초대 링크 복사` 클릭
4. 친구 1~3명에게 전송
5. 친구가 캐릭터를 고르고 준비
6. 방장이 맵 선택 후 게임 시작

## 로컬에서 먼저 확인하고 싶을 때

Windows에서는 `START_LOCAL.bat`을 더블클릭합니다. 처음 한 번은 npm 패키지를 설치한 뒤 브라우저가 자동으로 열립니다.

직접 명령어를 쓴다면:

```bash
npm install
npm start
```

그 후 `http://localhost:3000`으로 접속합니다.
