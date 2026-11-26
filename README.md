# HANPAN 한판: 브라우저 온라인 FPS (팀 데스매치)

서비스 주소: https://hanpan.team

레드 팀과 블루 팀이 싸우는 온라인 FPS입니다. 브라우저에서 바로 실행되고, Node.js 게임 서버가 판정을 맡습니다. 접속한 사람이 적으면 봇이 자동으로 자리를 채워서 빈 방이 생기지 않습니다.

> 서든어택, 모던 컴뱃 같은 기존 게임의 이름, 로고, 맵, 무기 디자인은 쓰지 마세요(상표·저작권 문제).

## 지금 들어있는 것

| 영역 | 내용 |
|---|---|
| 모드 | 팀 데스매치. 15킬 또는 10분이 지나면 승패가 나고, 10초 뒤 다음 판이 자동으로 시작 |
| 전장 | 도시 6곳(Tokyo Crossing, Seoul Gate, New York Square, Paris Boulevard, London Row, Dubai Marina, 모두 무료), 실제 거리 1곳(Seoul Gangnam, OpenStreetMap 기반), 무료 전장 7곳(Desert Compound, Iron Shore(바다에서 상륙하는 2차 대전풍 전장, 폭격기·헬리콥터 등장, 좌우 비대칭), Hill 625(6.25 전쟁 겨울 전장: 얼어붙은 강, 끊어진 철교, 초가 마을, 걸어 올라가는 다랑논 고지, 폭격기·헬리콥터 등장, 좌우 비대칭), Harbor Yard, Frost Station, Night Market, Jungle Ruins), 유료 3곳(Orbital Dock, Ember Foundry, Blossom Palace). Any land를 고르면 사람이 가장 많은 방에 들어감 |
| 캐릭터 | `/character.html`에서 3D 병사를 꾸밈: 헤드기어 9종, 얼굴 7종, 군복 8종, 방탄복 5종, 배낭 5종, 장갑, 군화, 벨트 장비, 총 도색 8종. 키트 3개 저장. 외형은 능력치에 영향 없음. 온라인에서 다른 사람에게도 보이고, 팀 색 완장·띠·등 패치는 항상 표시됨 |
| 장비(G) | 파편 수류탄, 연막탄(봇 시야도 가림), 섬광탄, 화염병, 원격 폭탄, 구급 키트 중 하나. G를 누르고 있으면 궤적이 보이고, 떼면 던짐(우클릭 취소). 원격 폭탄은 G를 다시 누르면 폭발. 서버가 궤적·폭발·회복을 판정 |
| 무기 | 무료 주무기 4종(카빈, 마크스맨 라이플, 전투소총, 불펍)과 보조무기 3종(권총, 리볼버, 기관권총). 탄 퍼짐, 반동, 거리별 데미지 감소, 헤드샷 2배 |
| 움직임 | 걷기, 달리기, 무릎 앉기(C), 엎드리기(X), 슬라이딩(달리면서 C), 점프, 정조준(ADS), 지형 충돌, 낮은 턱 자동으로 오르기 |
| 네트워크 | 서버 권위형 판정, 20Hz 스냅샷, 클라이언트 예측 + 보간, **지연 보상**(쏜 사람 화면 기준으로 판정) |
| 치트 방어(기본) | 이동 속도 검증 및 되돌리기, 발사 속도와 탄약을 서버가 관리, 조준 방향 검증, 메시지 크기·속도 제한 |
| 봇 | 시야 판정, 반응 시간, 좌우 회피, 웨이포인트 순찰. 사람이 들어오면 봇이 자동으로 빠짐 |
| UI | 미니맵, 킬피드, 스코어보드(Tab), 피격 방향 표시, 히트마커, 리스폰 화면 |
| 상점 | 유료 무기 4종과 전장 3곳을 NOWPayments 암호화폐(SOL 등)로 구매. 온라인에서는 게임 서버가 소유 여부를 확인하고, 연습 모드에서는 모두 무료로 체험 |
| 로그인(선택) | 솔라나 지갑 서명으로 로그인(Supabase Auth). 로그인하지 않아도 게스트로 플레이 가능 |
| 팀 대화 | V를 누르고 있는 동안 팀 음성, Enter로 팀 채팅. 음성은 게임 서버가 같은 팀에게만 중계(플레이어끼리 IP가 노출되지 않고 녹음하지 않음). Esc 화면에서 팀원별 음소거 |
| 비공개 대결 | 채팅 서버에서 **Fight**를 눌러 1:1, 2:2 또는 5:5 대결을 만들면 서버 채팅에 참가 카드가 올라감. 링크(추측하기 어려운 코드)를 가진 사람만 들어올 수 있고 봇 없음. 양 팀이 다 차면 5초 뒤 시작, 대기 중에는 T로 팀 변경. 1:1은 10킬, 2:2는 15킬, 5:5는 20킬. 한 팀이 모두 나가면 남은 팀 승리. 무료 전장만 선택 가능 |
| 연습 모드 | 서버 없이 브라우저에서 봇과 대전. 서버와 **같은 게임 코드**를 그대로 실행 |

## 로컬 실행

```bash
npm install
npm start            # http://localhost:3000
npm test             # 판정·봇·서버 접속 스모크 테스트
```

브라우저 탭 두 개로 접속하면 서로 싸울 수 있습니다.

## 실제 도시 맵 (OpenStreetMap)

`tools/osm/cities.json`에 도시를 적고 빌드 타임에 한 번 실행합니다. 게임은 실행 중에 Overpass를 부르지 않습니다.

```bash
npm run maps gangnam              # public/maps/gangnam.json 생성 (받은 원본은 tools/osm/cache에 보관)
npm run maps gangnam -- --refresh # 원본을 다시 받기
npm run maps all                  # 설정에 있는 모든 도시
```

- 영역은 `center` + `radius`(원) 또는 `bbox: [남, 서, 북, 동]`. `defaults`의 값은 도시별로 바꿀 수 있음
- 높이는 height → building:levels × 3.2 m → 12 m. 좌표는 도시의 주된 건물 방향이 축에 맞도록 돌려서 저장(`turn`)
- 실제 상호는 저장하지 않음. 업종별 가상 상호는 `tools/osm/shops.json`의 단어로 만들고, 원본 데이터에 있는 이름과 겹치면 버림
- `play`는 전투 구역 반지름(m), `sidewalk`는 도로 종류별 인도 폭(한쪽), `drive`는 통행 방향
- gzip 5 MB를 넘으면 실패로 끝남
- 빌드할 때 충돌 박스, 경계 펜스, 차량과 엄폐물, 스폰을 정해 같은 파일에 저장함. 서버와 화면이 같은 값을 쓰므로 어긋나지 않음(`tools/osm/arena.mjs`)
- 스폰은 중심까지 걷는 거리가 비슷하고 서로 보이지 않는 두 곳을 고름. 전투 구역의 빈 1층은 가상 매장으로 채움
- 만든 도시는 `public/shared/realcities.js`에 자동으로 등록되어 메뉴에 나타남. 도시 파일은 고를 때만 받음
- 확인과 성능 측정: `npm start` 후 `/cityview.html?city=gangnam`
- 데이터는 © OpenStreetMap contributors (ODbL). 도시가 보이는 모든 화면에 이 출처 표기가 있어야 함

## 호스팅어 비즈니스 플랜에 올리기

1. hPanel → **Websites** → **Add Website** → **Node.js web app** → GitHub 저장소 `Jinanalyst/hanpan` 연결
2. 빌드 설정: Framework `Other`, Build command `None`, **Entry file `app.cjs`**, Node 20 이상(18도 동작)
3. 도메인 `hanpan.team` 연결
4. 배포 후 hanpan.team에서 **Play online**을 눌러 보세요.
   - 게임이 시작되면 성공입니다. 왼쪽 위 ping 값으로 속도를 확인하세요.
   - "Connecting…"에서 멈추면 이 플랜이 들어오는 WebSocket을 막는 것입니다. 이때는 아래 VPS 방법으로 옮기세요.

## 서버에 올리기 (VPS 등)

필요한 것: Node 18 이상, WebSocket을 지원하는 호스팅. 정적 호스팅(Vercel, Netlify 같은 곳)만으로는 안 되고, 계속 켜져 있는 서버가 있어야 합니다.

**가장 빠른 방법: Render / Railway / Fly.io**
1. 이 폴더를 GitHub 저장소에 올립니다.
2. 새 Web Service를 만들고 Build `npm install`, Start `npm start`로 설정합니다.
3. 포트는 `PORT` 환경변수를 자동으로 따릅니다. https 주소로 접속하면 클라이언트가 자동으로 `wss://`로 연결합니다.

**Docker**
```bash
docker build -t hanpan .
docker run -p 3000:3000 hanpan
```

**VPS(예: AWS Lightsail, 네이버 클라우드) + nginx**
```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```
`pm2 start server/index.js --name hanpan`처럼 프로세스 관리자로 띄우세요.

**한국 유저 대상이면 서버를 서울 리전에 두세요.** FPS는 핑이 체감 품질을 크게 좌우합니다.

### 환경변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 3000 | 서버 포트 |
| `MAX_PER_ROOM` | 12 | 방 하나에 들어갈 수 있는 사람 수. 차면 새 방이 생김 |
| `MIN_PLAYERS` | 6 | 사람이 이보다 적으면 봇으로 채움 |

상태 확인: `GET /healthz`(헬스체크), `GET /status`(방 목록, 인원, 점수).

## 솔라나 지갑 로그인 (Supabase)

1. Supabase 대시보드 → **Authentication → Sign In / Providers → Web3 Wallet**에서 Solana를 켭니다.
2. **Authentication → URL Configuration**에서 Site URL을 `https://hanpan.team`으로, Redirect URLs에 `https://hanpan.team/**`를 넣습니다(로컬 테스트는 `http://localhost:3000/**`).
3. **Project Settings → API**의 Project URL과 publishable(또는 anon) 키를 `public/config.js`에 넣습니다. 이 두 값은 공개되어도 되는 값입니다. **secret / service_role 키는 절대 넣지 마세요.**

설정이 비어 있으면 로그인 링크가 숨겨지고 게임은 그대로 동작합니다. 지금은 화면에서 로그인 상태만 확인합니다. 전적이나 보상을 계정에 저장하려면 게임 서버에서 토큰을 검증하는 단계를 추가해야 합니다.

## 상점 (NOWPayments)

1. `supabase/migrations`의 SQL을 Hanpan 프로젝트에 적용하고 `supabase/functions/store`를 배포합니다(`verify_jwt` 끔).
2. Supabase 대시보드 → **Edge Functions → Secrets**에 `NOWPAYMENTS_API_KEY`와 `NOWPAYMENTS_IPN_SECRET`을 넣습니다. **이 두 값은 코드, GitHub, 채팅에 절대 넣지 마세요.**
3. NOWPayments 대시보드에서 정산 지갑을 설정하고, SOL을 결제 통화로 켭니다.

- 가격 변경: `update public.products set price_usd = 3.99 where id = 'weapon:smg';` 판매 중지: `set active = false`.
- 확인이 필요한 결제: `select * from public.orders where status in ('review', 'partial', 'duplicate') or note is not null;`
- 상품은 NOWPayments 서명과 결제 조회를 모두 통과하고 상태가 `finished`일 때만 지급됩니다.
- 상품을 추가할 때는 `weapons.js` 또는 `map.js`에 `product`를 넣고, 같은 id를 `products` 테이블에도 추가하세요.

## 채팅 서버

플레이어가 직접 서버를 만들고(`/servers.html`) 친구를 **솔라나 지갑 주소**로 초대해 채팅합니다. 초대받은 사람은 그 지갑으로 로그인하면 초대가 보이고, 수락해야 들어옵니다. 아직 한 번도 로그인하지 않은 지갑도 초대할 수 있습니다.

- 설정: `supabase/migrations/20261125063707_chat_servers.sql`을 Hanpan 프로젝트에 적용합니다. 다른 비밀 키는 필요 없습니다.
- 메시지는 데이터베이스의 행 규칙(RLS)으로 멤버만 읽을 수 있고, 모든 변경은 `chat_*` 함수가 확인합니다. 지갑 주소는 검증된 로그인 정보에서 가져오므로 속일 수 없습니다.
- 한도: 1인당 서버 5개 소유·30개 참여, 서버당 50명(초대 포함), 메시지 500자·10초에 6개. 초대를 거절하면 같은 사람이 7일 동안 다시 초대할 수 없습니다.

## 구조

```
server/index.js          HTTP 정적 파일 + WebSocket, 방 배정, 30Hz 틱
public/index.html        클라이언트 페이지
public/login.html/.js    솔라나 지갑 로그인 페이지
public/store.html/.js    상점 페이지
public/servers.html/.js  채팅 서버 페이지 (지갑 주소로 친구 초대)
public/character.html/.js 캐릭터 페이지 (외형, 무기, 장비, 키트 3개)
public/profile.js        캐릭터 저장(이 브라우저의 localStorage), 온라인 전적
public/soldier.js        병사 모델과 장비 외형
public/arsenal.js        총·수류탄 모델 (1인칭, 다른 병사, 캐릭터 페이지가 같이 씀)
public/models.js         모델링 도구, 위장 무늬, 메시 합치기
public/studio.js         카드와 메뉴에 쓰는 정지 그림
public/shared/gear.js    외형 목록과 코드 변환 (새 항목은 반드시 맨 뒤에 추가)
public/voice.js          팀 음성(녹음·재생), voice-worklet.js는 마이크 처리
public/battle.js         전투 소리(병사 외침, 무전, 먼 총성·폭발), voicelines.js는 대사 위치, sounds/는 이 게임용으로 생성한 목소리
public/shared/adpcm.js   음성 압축 (말하는 사람당 약 8KB/s)
public/floorplan.js      전장 미니 평면도
server/owned.js          플레이어가 가진 상품 조회 (비밀 키 불필요)
supabase/migrations/     상점 DB 테이블, 권한, 함수
supabase/functions/store 결제 생성과 결제 알림 처리 (Edge Function)
public/auth.js           Supabase 세션 (로그인 페이지와 메뉴가 같이 씀)
public/config.js         Supabase 주소와 공개 키
public/vendor/           supabase-js (고정 버전)
public/client.js         렌더링(Three.js), 입력, 예측·보간, HUD, 사운드
public/shared/game.js    매치 규칙, 판정, 봇 AI (서버와 연습 모드가 같이 씀)
public/shared/physics.js 이동·충돌·레이캐스트 (서버와 클라이언트가 같이 씀)
public/shared/cities.js  도시 6곳의 배치와 테마
public/shared/landkit.js 전장 부품(계단, 자동차, 노점, 횡단보도 등)
public/cityscape.js      도시 그래픽(건물 외벽, 상점, 차량, 스카이라인, 랜드마크)
public/shared/map.js     일반 전장 8곳(점대칭이라 양 팀이 공평), 스폰, 테마 색, 봇 길찾기
public/shared/weapons.js 무기와 장비 수치
test/smoke.js            스모크 테스트
```

밸런스 조정은 `weapons.js`, 전장 수정은 `map.js`의 `FIELDS`(도시는 `cities.js`의 `CITIES`)에서 해당 전장의 `half` 배열만 고치면 됩니다. 자동으로 반대편에 대칭 복사됩니다. 두 곳 중 한 곳에 항목을 추가하면 메뉴, 서버, 테스트에 새 전장이 자동으로 나타납니다.

## 프로토콜 (JSON over WebSocket `/ws`)

클라이언트 → 서버: `join{name,lo,sa,eq,gear,map,token}`(lo 주무기, sa 보조무기, eq 장비, gear 외형 코드, map은 전장 id 또는 `any`, token은 로그인한 경우의 Supabase 토큰), `in{sp,x,y,z,yaw,pitch,cr}`(20Hz, cr은 0 서기, 1 무릎, 2 엎드리기), `f{yaw,pitch}`(발사), `r`(장전), `w{w}`(무기 교체), `g{yaw,pitch}`(장비 사용), `lo{lo,sa,eq}`(다음 리스폰부터 쓸 무기), `c{x}`(팀 채팅), 바이너리(음성 324바이트, 초당 25개), `po{s}`(핑 응답)
서버 → 클라이언트: `welcome`, `tp`(위치 강제 이동), `s`(스냅샷), `ro`(명단), `sh`(다른 사람 사격), `hit`, `dmg`, `k`(킬), `rl`(장전 시작), `gt`(수류탄 던짐), `gs`(폭탄이 붙음), `gx`(폭발·연막·불), `fl`(섬광), `heal`(회복 시작), `end`/`start`, `pi`(핑)

## 실제 서비스 전에 해야 할 것 (우선순위 순서)

1. **그래픽 에셋 교체**: 지금은 박스로 만든 프로토타입 모델입니다. 실제 사람처럼 보이려면 리깅된 캐릭터(glTF)와 무기 모델이 필요합니다. 시작용으로는 Mixamo(애니메이션), Quaternius·Kenney(무료 로우폴리), 유료 에셋 스토어를 쓰면 됩니다. `soldier.js`의 `makeSoldier()`와 `arsenal.js`의 `buildGun()`을 `GLTFLoader`로 바꾸면 됩니다.
2. **계정과 저장**: 로그인(카카오·구글 OAuth), 전적, 레벨. DB는 Postgres나 Supabase를 추천합니다.
3. **매치메이킹 개선**: 지금은 "빈자리가 있는 첫 방" 방식입니다. 실력 기반 매칭, 친구 초대, 방 만들기를 추가하세요.
4. **치트 방어 강화**: 이동을 서버에서도 시뮬레이션하고(지금은 속도 상한 검증만 함), 비정상 명중률을 탐지하고, 신고 기능을 넣으세요. 브라우저 게임은 클라이언트를 숨길 수 없어서 서버 검증이 전부입니다.
5. **확장**: 처음에는 서버 한 대로 시작하고, `/status`와 CPU 사용량을 보면서 늘리세요. 한 대로 부족해지면 방 단위로 여러 프로세스나 서버에 나누고, Redis 같은 저장소로 방 목록을 공유하세요. 트래픽이 커지면 JSON 대신 바이너리 패킷으로 바꾸면 대역폭이 3~5배 줄어듭니다.
6. **모바일**: 지금은 PC(마우스+키보드) 전용입니다. 모바일을 지원하려면 가상 조이스틱과 자동 사격 보조가 필요합니다.

## 수익화 방향

- **광고**: 게임 화면 안이 아니라 메인 메뉴, 매치 사이 대기 화면, 게임을 소개하는 랜딩 페이지에 넣으세요. 플레이 중 광고는 이탈률을 크게 올립니다.
- **치장 아이템**: 무기 스킨, 캐릭터 외형, 킬 이펙트. 능력치에 영향이 없어야 "Pay to win" 비판을 피할 수 있습니다.
- **시즌 패스**: 계정 시스템이 생긴 다음에 붙이세요.
- 결제를 붙이면 전자상거래·확률형 아이템 관련 국내 규정(확률 공개 의무 등)을 확인하세요.
