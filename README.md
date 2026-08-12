# fight_class — 턴제 1:1 웹 대전 게임

브라우저에서 두 플레이어가 방에 모여 캐릭터(전사/궁수/마법사)를 고르고 턴제로 싸우는 게임.
`PLAN.md`의 설계를 그대로 따르되, 전송 계층만 Cloudflare에 맞게 바꿨다: Node+Express+Socket.IO
대신 **Cloudflare Workers + Durable Objects**(네이티브 WebSocket)를 쓴다 — Socket.IO는
서버리스 Workers 런타임에서 동작하지 않기 때문. 프론트엔드는 계획대로 빌드 도구 없는 순수
HTML/JS다.

## 아키텍처

- **서버 권위**: 클라이언트는 "이 스킬 쓰겠다"는 의도만 보내고, 데미지/MP/디버프 계산은 전부
  서버(`src/battle.js`)가 한다.
- **방 하나 = Durable Object 인스턴스 하나** (`src/room.js`의 `BattleRoom`). 6자리 방 코드로
  `getByName()`해서 항상 같은 인스턴스로 라우팅한다. 상태는 `ctx.storage`에만 두고(메모리 수준
  영속성), 프로세스가 정리되면 사라진다 — 영속화가 필요해지면 나중에 D1을 붙이면 된다.
- **이벤트 + 스냅샷 동시 전송**: 매 턴 `{ events[], snapshot }`을 두 클라이언트에 완전히 동일하게
  브로드캐스트한다. 클라는 events로 애니메이션을 재생하고, 재생이 끝나면 snapshot으로 상태를
  확정한다.
- **데이터 주도 스킬**: 캐릭터 스탯(`src/data/characters.json`)과 스킬(`src/data/skills.json`)은
  전부 데이터 파일. 밸런스 조정은 이 두 파일만 고치면 된다.
- **AI 대전**: 로비에서 "AI와 대전"을 고르면 실제 소켓 없는 "가상 플레이어"가 방의 두 번째
  자리(p2)로 들어간다. 캐릭터는 랜덤으로, 스킬은 규칙 기반(`src/ai.js`)으로 고른다 — 사람의
  행동이 처리된 직후 서버가 AI 차례를 곧바로 대신 처리해서 같은 `battle:turn` 흐름을 탄다.

## 디렉토리 구조

```
wrangler.jsonc         Workers + Durable Object 설정
src/
  worker.js            정적 자산 서빙 + /ws 요청을 방 코드별 Durable Object로 라우팅
  room.js              BattleRoom Durable Object — 로비/캐릭터선택/전투진행/재대결/이탈 처리
  battle.js            턴 처리 순수 함수 (소켓과 분리, node --test로 바로 검증 가능)
  effects.js           dot/stat_mod/control 3종 효과 해석기
  ai.js                AI 대전 상대의 캐릭터/스킬 선택 로직 (규칙 기반, 순수 함수)
  data/
    characters.json    캐릭터별 기본 스탯
    skills.json        스킬 정의 (MP 소모, 배율, 부여 효과, 쿨다운) — 밸런스는 여기만 고치면 됨
public/
  index.html, css/     로비 → 캐릭터 선택 → 전투 → 종료 화면
  shared/protocol.js   서버·클라 공용 메시지 상수 (양쪽 다 그대로 import하는 ES module)
  js/
    net.js             네이티브 WebSocket 래퍼
    state.js           서버 스냅샷 보관
    render.js          Canvas 드로잉 (도형 캐릭터, 칼 휘두르기/피격/회복 이펙트)
    anim.js            서버 events[] 재생 큐 — 재생 중엔 스킬 버튼 잠금
    ui.js              DOM 조작 (화면 전환, HP/MP 바, 전투 로그)
    charMeta.js         캐릭터/스킬 표시용 이름·색·라벨 (서버 데이터와 별개, 화면 표시 전용)
    main.js            진입점, 서버 메시지 ↔ UI/애니메이션 연결, rAF 루프
test/
  battle.test.js       턴 시퀀스를 넣고 최종 HP/MP/효과 만료/쿨다운/승패를 단언
```

## 로컬 개발

```bash
npm install            # wrangler devDependency 설치
npm test                # 전투 엔진 순수 함수 테스트 (node --test)
npm run dev             # wrangler dev — http://localhost:8787
```

브라우저 두 탭(또는 일반 창 + 시크릿 창)으로 접속 → 한쪽에서 방 생성, 다른 쪽에서 코드로 입장 →
양쪽 다 캐릭터를 고르면 전투가 시작된다.

## 배포

```bash
npx wrangler login      # 최초 1회, 브라우저 OAuth
npm run deploy          # wrangler deploy
```

`main`(또는 `claude/repo-permissions-check-llt7ab`) 브랜치에 푸시되면
`.github/workflows/deploy-cloudflare.yml`이 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
저장소 Secret으로 자동 배포한다.

## 계획서와 다른 점 (Cloudflare 전환에 따른 조정)

| 계획서 | 여기서는 | 이유 |
|---|---|---|
| Node + Express + Socket.IO | Cloudflare Workers + Durable Objects, 네이티브 WebSocket | Socket.IO/Express는 서버리스 Workers 런타임에서 동작하지 않음 |
| `room:create`/`room:join`을 소켓 이벤트로 | 연결 시점의 쿼리스트링(`?action=create\|join`)으로 | 네이티브 WebSocket은 연결 전에 목적을 정해야 함 |
| `battle:end`의 `winnerId` | `winnerKey`(`p1`/`p2`) | 클라이언트가 서버 내부 playerId를 알 방법이 없음 |

전투 로직·데이터 구조·클라이언트 렌더링/애니메이션 설계는 계획서 그대로다.

## 백엔드를 더 확장한다면

지금은 방 상태를 Durable Object 메모리(`ctx.storage`)에만 둔다. 연승 기록을 세션을 넘어
영속화하거나 대진표(브래킷)를 붙이려면 D1을 추가해서 `room.js`가 전투 종료 시 결과를 기록하게
하면 된다 (`npx wrangler d1 create fight-class-db` → `wrangler.jsonc`의 `d1_databases`에 바인딩).
