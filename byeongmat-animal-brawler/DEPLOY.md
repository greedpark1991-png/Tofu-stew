# 병맛 동물 격투게임 - 사이트 배포

이 프로젝트는 Node.js + Socket.IO 기반이므로 정적 사이트가 아니라 Web Service로 배포해야 합니다.

## 가장 쉬운 방법: GitHub + Render

1. GitHub에서 새 저장소를 만듭니다. 예: `byeongmat-animal-brawler`
2. 이 폴더 안의 파일과 `public` 폴더를 저장소 최상위에 업로드합니다.
   - package.json
   - server.js
   - render.yaml
   - public/
   - 나머지 파일들
3. Render에 로그인합니다.
4. New > Web Service를 선택합니다.
5. GitHub 저장소를 연결합니다.
6. 저장소의 `render.yaml`을 사용하거나 다음 값을 입력합니다.
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
7. 배포가 끝나면 `https://...onrender.com` 주소가 생성됩니다.
8. 그 주소를 친구에게 보내면 친구는 설치 없이 브라우저에서 접속할 수 있습니다.

## 주의

무료 Render Web Service는 일정 시간 사용하지 않으면 잠들 수 있어 첫 접속이 느릴 수 있습니다. 게임을 자주 공개 운영하려면 유료 인스턴스나 다른 상시 실행 호스팅을 고려하세요.
