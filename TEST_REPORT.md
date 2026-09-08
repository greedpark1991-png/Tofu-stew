# v7.2 테스트 결과

## 자동 테스트
`node test-harness.js` 실행 결과 **43 / 43 PASS**.

검증 범위:
- 4캐릭터 선택 및 PNG 상태 렌더링
- 원본 2맵 선택/렌더링
- 옥상 강풍 경고/활성
- 도장 광택 마루 판정
- BOT 0/1/2/3 및 BOT 성격
- WASD / Space / J / K / Shift+J / Shift+K / 공중 J / 공중 K
- 주먹/킥/점프킥 밸런스 데이터
- 히트스톱 / 화면 흔들림 / 피해/통계
- 누적 데미지 / 넉백 / 강한 넉백 궤적
- 3/5 Stock
- 장외 / 자살 장외 / 최근 공격자 장외 귀속
- 마지막 1명 승자 판정 / 결과 오버레이
- down/getup / 기상 보호
- 리스폰 보호 / 겹침 완화 / 효과 초기화
- 망치 / 무적 / 스피드 / 고기 / 똥
- 아이템 낙하 경고 및 중앙 스폰
- 원본 오프닝/전투 BGM 경로 및 화면 전환 BGM 교체
- 재경기 시 requestAnimationFrame 중복 방지
- 키 이벤트 리스너 중복 없음
- 4인 장시간 업데이트 중 주요 수치 NaN 없음

## 파일 보존 검증
- 원본 v5 캐릭터 PNG: **20 / 20 SHA-256 동일**
- `Cold_Bell_Impact.mp3`: 복구 원본과 SHA-256 동일
- `The_Rooftop_Bout.mp3`: 복구 원본과 SHA-256 동일

## 실제 자동 테스트 출력
```
PASS menu builds 4 characters and restored 2 maps 
PASS traits are distinct and tiny 
PASS default stock is 3 
PASS BOT 0 starts solo 
PASS BOT 1/2/3 counts 
PASS BOT personalities assigned 
PASS attack data roles 
PASS dash punch and dash kick exist 
PASS air punch exists 
PASS punch hit applies damage hitstop shake stats 
PASS kick trait boosts jjigae and mandu reduces incoming kb 
PASS jumpkick whiff landing lag in range 
PASS items all apply 
PASS item warning spawn central 
PASS rooftop wind telegraph and active phase 
PASS dojo polished floor is slippery only in marked zone 
PASS getup grants short shield 
PASS respawn avoids overlap and resets effects 
PASS ringout attribution within 2.2s 
PASS suicide ringout recorded 
PASS last stock decides winner and result 
PASS new Game resets stats/effects/map gimmick 
PASS draw all maps and states without error 
PASS all fighter numbers remain finite after simulation 
PASS WASD movement changes velocity 
PASS Space jump sets Z velocity 
PASS Shift+J triggers dash punch 
PASS Shift+K triggers dash kick 
PASS air J triggers air punch 
PASS air K triggers jumpkick 
PASS 3/5 stock selection affects fighter stock 
PASS all four character selections create correct player 
PASS normal J and K inputs preserved 
PASS invincible blocks normal hit 
PASS getup shield blocks hit 
PASS respawn shield blocks hit 
PASS poop reverses horizontal input only 
PASS strong knockback creates trail 
PASS jumpkick ringout statistic recorded 
PASS replay does not schedule duplicate RAF 
PASS original BGM files configured 
PASS game/menu BGM switching 
PASS window listeners not duplicated at load 
TOTAL 43 PASS 43 FAIL 0

```

## 수동 플레이테스트에서 특히 볼 것
- 옥상 강풍의 밀기 강도가 너무 강하거나 약하지 않은지
- 도장 광택 마루가 전투 흐름을 방해하지 않는지
- 3 Stock 4인 BOT전이 목표 3~5분에 근접하는지
- 마지막 KO의 히트스톱/슬로모션이 과하지 않은지
- 원본 BGM 볼륨 18%가 실제 환경에서 적당한지
