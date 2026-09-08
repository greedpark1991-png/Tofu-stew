# Render 배포 — v7.2

1. 압축을 풉니다.
2. 폴더 자체가 아니라 안쪽의 `public`, `server.js`, `package.json`, `Dockerfile`, `render.yaml` 등을 GitHub 저장소 최상단에 올립니다.
3. 기존 저장소에 예전 `game-v7.js`, `style-v7.css`가 남아 있어도 v7.2의 `index.html`은 새 `game-v7-2.js`, `style-v7-2.css`만 읽습니다.
4. Render → Settings → Root Directory는 빈칸으로 둡니다.
5. Manual Deploy → Deploy latest commit.
6. 화면 상단에 `v7.2 · ORIGINAL MAP & AUDIO + PARTY UPDATE`가 보이면 새 버전입니다.
7. 브라우저 정책상 첫 클릭 전에는 BGM 자동 재생이 막힐 수 있습니다. 화면을 한 번 클릭하거나 게임 시작을 누르면 오프닝/전투 BGM이 정상 재생됩니다.
