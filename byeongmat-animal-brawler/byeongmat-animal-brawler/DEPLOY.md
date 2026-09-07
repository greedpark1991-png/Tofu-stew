# 기존 Render 사이트를 v2로 교체하는 가장 쉬운 방법

1. GitHub의 `Tofu-stew` 저장소를 엽니다.
2. `byeongmat-animal-brawler` 폴더로 들어갑니다.
3. `Add file` → `Upload files`를 누릅니다.
4. 이 배포본의 `byeongmat-animal-brawler` 폴더 안에 있는 파일/폴더 전체를 업로드합니다.
5. 같은 이름의 파일은 새 버전으로 덮어씁니다.
6. `Commit changes`를 누릅니다.
7. Render가 자동으로 새 배포를 시작합니다.
8. `Deploy succeeded`가 뜨면 기존 사이트 주소를 새로고침합니다.

핵심 파일: `server.js`, `package.json`, `Dockerfile`, `public/index.html`, `public/style.css`, `public/game.js`
