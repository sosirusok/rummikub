/* =========================================================================
   app.js — 라우터(홈·로비2종·대기실 탭·결과·랭킹) + 루미큐브 게임 + 미니게임 위임
   공용: ui-core.js($/app/esc/setScreen/toast/bindAppInput/openSheet/flashBanner),
         tiers.js(tier/score/표시 헬퍼), engine.js(루미룰), net.js(Supabase),
         mini-core.js(miniStart/miniOnRoom/miniStop), race.js/hunt.js(MiniGames).
   ========================================================================= */

/* ----------------------------- 상태 ----------------------------------- */
let TOKEN = localStorage.getItem('rk_token') || null;
let ME = null;                 // {id,username,real_name,display_game,games,display,token}
let MODE = 'board';            // 현재 로비 컨텍스트: board(방1~5) | mini(방6~10)
let RULES_GAME = 'rummikub';   // 규칙 화면에서 선택된 게임

let ROOM_ID = null, ROOM = null, MEMBERS = [];
let lobbyCh = null, roomDbCh = null, presenceCh = null, hbIv = null;
let presentIds = [];
let mySnapGame = null;         // 내 room_members 스냅샷이 반영한 게임

let G = null;                  // 게임 상태(루미)
let mySeat = null, amSpectator = false;
let work = null, turnStart = null, turnStartBoardSet = new Set();
let rackOrder = [];            // 내 패 개인 정렬(영구·자동 변경 안 함)
let undoStack = [];
let dragging = null;           // 드래그 상태
let liveBoard = null;          // 다른 플레이어가 편집 중인 보드(실시간)
let rkBc = null, _rkBcT = 0;   // 루미 실시간 broadcast 채널
let busy = false;
let prevTurn = null;
let timerIv = null, lastAutoKey = null, lastDanger = false;
let lbCache = {};              // 현재 게임 기준 user_id -> {score,wins,losses,streak,real_name}
let lbCacheGame = null;
let WAIT_TAB = 'seat';
let RANK_GAME = 'rummikub';
let lastRoomSig = '';
let lastRoomVersion = -1;        // 방 상태 단조 버전(늦게 도착한 옛 스냅샷 무시용)
let oneTileSeen = new Set();     // '1장!' 배너 1회 발화용(좌석별 엣지)
let DEV_UNLOCKED = false;        // 개발자 모드 비번 통과(세션 한정)
let DEV_SEL = new Set();         // 강제 초기화로 선택된 방들
const DEV_PW = 'Lemon14436';
let DEV_TAB = 'rooms', DEV_USERS = null, DEV_LOG_GAME = '', DEV_USER_Q = '', _noticeShown = false;  // 개발자 도구 상태
let resultLeaveIv = null, resultLeaveAt = 0;   // 결과창 자동 홈이동 카운트다운

const GAME_CAP = { rummikub: 4, davinci: 4, splendor: 4, uno: 4, mafia: 12, race: 8, hunt: 8 };
function curGame() { return ROOM ? ROOM.game : null; }
function capOf(game) { return GAME_CAP[game] || 8; }            // 게임별 최대 인원
function minOf(game) { return game === 'mafia' ? 4 : 2; }       // 게임별 최소 시작 인원
function statsOf(uid) { return lbCache[uid] || {}; }

/* ----------------------------- 부팅 ----------------------------------- */
async function boot() {
  if (!configReady()) { app().innerHTML = `<div class="screen center" style="justify-content:center"><h2>설정 필요</h2><p class="muted">config.js / supabase_setup.sql 을 확인하세요.</p></div>`; return; }
  initSupabase();
  await syncServerTime();                                  // 오프셋 확보 후 진행(타이머 15초→45초 클럭스큐 방지)
  bindAppInput(handleAct, () => {}, () => false);
  app().addEventListener('pointerdown', rkPointerDown);   // 루미큐브 타일 드래그
  if (TOKEN) {
    ME = await apiMe(TOKEN);
    if (ME) TOKEN = ME.token;
    else if (ME === null) { localStorage.removeItem('rk_token'); TOKEN = null; }   // null=토큰무효 → 정리(undefined=일시오류는 토큰 보존)
  }
  if (ME) goHome(); else showLogin();
}

/* ----------------------------- 액션 위임 ------------------------------- */
function handleAct(act, el) {
  if (typeof chatOnAct === 'function' && chatOnAct(act)) return;   // 채팅 위임(모든 화면 공통)
  if (act.indexOf('eng_') === 0) { if (typeof engageAct === 'function' && engageAct(act, el)) return; }   // 흥미요소(코인/업적/상점/출석)
  if (act.indexOf('dv_') === 0) { davinciAct(act, el); return; }   // 다빈치 코드 액션 위임
  if (act.indexOf('mf_') === 0) { mafiaAct(act, el); return; }     // 마피아 액션 위임
  if (act.indexOf('sp_') === 0) { splendorAct(act, el); return; }  // 스플랜더 액션 위임
  if (act.indexOf('uno_') === 0) { unoAct(act, el); return; }      // 우노 액션 위임
  switch (act) {
    case 'authTab': switchAuthTab(el.dataset.tab); break;
    case 'authSubmit': doAuth(); break;
    case 'logout': doLogout(); break;
    case 'goBoard': goLobby('board'); break;
    case 'goMini': goLobby('mini'); break;
    case 'goDev': showDev(); break;
    case 'devUnlock': doDevUnlock(); break;
    case 'devToggle': { const n = Number(el.dataset.room); DEV_SEL.has(n) ? DEV_SEL.delete(n) : DEV_SEL.add(n); showDev(); break; }
    case 'devReset': doDevReset(); break;
    case 'devTab': DEV_TAB = el.dataset.tab; showDev(); break;
    case 'devUserSearch': DEV_USER_Q = ($('#devUserQ') && $('#devUserQ').value) || ''; loadDevUsers(); break;
    case 'devEditUser': devEditUser(el.dataset.uid); break;
    case 'devSaveName': devSaveName(el.dataset.uid); break;
    case 'devSaveScore': devSaveScore(el.dataset.uid, el.dataset.game); break;
    case 'devLogGame': DEV_LOG_GAME = el.dataset.game || ''; showDev(); break;
    case 'devSaveNotice': devSaveNotice(); break;
    case 'devClearNotice': devClearNotice(); break;
    case 'kick': doKick(el.dataset.uid); break;
    case 'leaveNow': doResultAutoLeave(); break;
    case 'backHome': goHome(); break;
    case 'goRank': showRank(RANK_GAME); break;
    case 'goTiers': showTiers(); break;
    case 'goDeco': showDeco(); break;
    case 'goRules': showRules(RULES_GAME); break;
    case 'rulesGame': RULES_GAME = el.dataset.game; if (SCREEN === 'room') renderWaiting(true); else showRules(RULES_GAME); break;
    case 'rankGame': RANK_GAME = el.dataset.game; showRank(RANK_GAME); break;
    case 'enterRoom': enterRoomFlow(Number(el.dataset.room)); break;
    case 'waitTab': WAIT_TAB = el.dataset.tab; renderWaiting(true); break;
    case 'setDisplay': doSetDisplay(el.dataset.dg || null); break;
    case 'sit': doSit(Number(el.dataset.seat)); break;
    case 'spectate': doSpectate(); break;
    case 'unseat': netCall(() => unseat(ROOM_ID, ME)); break;
    case 'setTime': doSetTime(Number(el.dataset.sec)); break;
    case 'setGame': doSetGame(el.dataset.game); break;
    case 'start': doStart(); break;
    case 'leave': if (ROOM && ROOM.status === 'playing') confirmLeave(); else doLeave(); break;   // 게임 중엔 확인창
    case 'leaveConfirm': closeSheet(); doLeave(); break;
    case 'submit': onSubmit(); break;
    case 'draw': onDraw(); break;
    case 'undo': doUndo(); break;
    case 'reset': doReset(); break;
    case 'sort': doSort(el.dataset.key); break;
    case 'peek': openPeek(Number(el.dataset.seat)); break;
    case 'closeSheet': closeSheet(); break;
  }
}
async function netCall(fn) { if (busy) return; busy = true; try { await fn(); } finally { busy = false; } }

/* ============================ 로그인 ================================== */
let authTab = 'login';
function showLogin() {
  cleanupAll(); setScreen('login');
  app().innerHTML = `
    <section class="screen screen--login">
      <div class="auth">
        <div class="auth__logo">🎮 게임 허브<small>친구들과 실시간 대결</small></div>
        <div class="auth__tabs">
          <button class="btn ${authTab === 'login' ? 'is-active' : ''}" data-act="authTab" data-tab="login">로그인</button>
          <button class="btn ${authTab === 'signup' ? 'is-active' : ''}" data-act="authTab" data-tab="signup">회원가입</button>
        </div>
        <div class="auth__form">
          <input class="input" id="f_user" placeholder="아이디 (2~20자)" autocomplete="username" />
          <input class="input" id="f_pw" type="password" placeholder="비밀번호 (4자 이상)" autocomplete="current-password" />
          ${authTab === 'signup' ? `<input class="input" id="f_name" placeholder="본명 (한글)" />` : ''}
          <div class="auth__err" id="f_err"></div>
          <button class="btn btn--primary btn--lg" data-act="authSubmit">${authTab === 'login' ? '로그인' : '회원가입 후 시작'}</button>
        </div>
      </div>
    </section>`;
}
function switchAuthTab(tab) { authTab = tab; showLogin(); }
async function doAuth() {
  const u = ($('#f_user').value || '').trim();
  const p = $('#f_pw').value || '';
  const nm = $('#f_name') ? ($('#f_name').value || '').trim() : '';
  const err = $('#f_err');
  const mark = (sel, bad) => { const el = $(sel); if (el) el.classList.toggle('is-invalid', bad); };
  mark('#f_user', false); mark('#f_pw', false); mark('#f_name', false);
  if (!u || !p || (authTab === 'signup' && !nm)) {
    mark('#f_user', !u); mark('#f_pw', !p); mark('#f_name', authTab === 'signup' && !nm);
    err.textContent = '모든 칸을 채워주세요.'; return;
  }
  if (authTab === 'signup' && !/^[가-힣]{1,10}$/.test(nm)) { mark('#f_name', true); err.textContent = '본명은 한글로 1~10자 입력하세요.'; return; }
  err.textContent = '처리 중…';
  const res = authTab === 'login' ? await apiLogin(u, p) : await apiSignup(u, p, nm);
  if (res.error) { err.textContent = res.error; return; }
  ME = res.profile; TOKEN = ME.token; localStorage.setItem('rk_token', TOKEN);
  goHome();
}
function doLogout() { localStorage.removeItem('rk_token'); TOKEN = null; ME = null; DEV_UNLOCKED = false; DEV_SEL.clear(); cleanupAll(); showLogin(); }
// 주기적 apiMe 갱신 처리: 객체=정상 / null=토큰무효(타 기기 로그인)→로그아웃 / undefined=일시오류→유지
function handleMeRefresh(p) {
  if (p) { ME = p; TOKEN = p.token; return true; }
  if (p === null && TOKEN) { toast('다른 기기에서 로그인되어 로그아웃됐어요'); doLogout(); }
  return false;
}

/* ============================ 홈 ====================================== */
function headerHTML() {
  const dg = ME.display && ME.display.game ? ME.display.game : null;
  const dscore = ME.display ? ME.display.score : 0;
  return `<span class="lobby__hello">${nameHTML(ME.real_name, dg ? dscore : null)}
    <small>${dg ? decoChipEmbHTML(dg, dscore, 'eqs') : '<span class="muted">티어 숨김</span>'}</small></span>`;
}
function goHome() {
  cleanupRoom(); cleanupLobby(); ROOM_ID = null; setScreen('home');
  app().innerHTML = `
    <section class="screen screen--home">
      <header class="lobby__top">
        ${headerHTML()}<span class="spacer"></span>
        ${typeof engageChipHTML === 'function' ? engageChipHTML() : ''}
        <button class="btn btn--ghost" data-act="goRules">규칙</button>
        <button class="btn btn--ghost" data-act="goTiers">티어</button>
        <button class="btn btn--ghost" data-act="goDeco">꾸미기</button>
        <button class="btn btn--ghost" data-act="goRank">랭킹</button>
        <button class="btn btn--ghost" data-act="logout">로그아웃</button>
      </header>
      <div id="resumeChip"></div>
      <div class="home-cards grow">
        <button class="home-card home-card--rk" data-act="goBoard">
          <span class="home-card__badge"><span class="home-card__emoji">🎲</span></span><span class="home-card__title">보드게임</span>
          <span class="home-card__sub">방 1~5 · 루미큐브 / 다빈치 코드 / 스플랜더 / 우노 / 마피아</span></button>
        <button class="home-card home-card--mini" data-act="goMini">
          <span class="home-card__badge"><span class="home-card__emoji">🎮</span></span><span class="home-card__title">미니게임</span>
          <span class="home-card__sub">방 6~10 · 운빨 대시 / 나도 사람이야</span></button>
        <button class="home-card home-card--dev" data-act="goDev">
          <span class="home-card__badge"><span class="home-card__emoji">🛠</span></span><span class="home-card__title">개발자 모드</span>
          <span class="home-card__sub">방 초기화 · 유저 스탯 · 게임 로그 · 공지 (관리자)</span></button>
      </div>
      <p class="muted center" style="padding:10px 14px">로그인 후 게임을 고르세요. 티어·전적·꾸미기는 게임별로 따로 쌓여요.</p>
    </section>`;
  apiMe(TOKEN).then(p => { if (handleMeRefresh(p) && SCREEN === 'home') { const h = document.querySelector('.screen--home .lobby__hello'); if (h) h.outerHTML = headerHTML(); } });
  if (typeof loadEngage === 'function') loadEngage();
  showAnnouncementIfAny();   // 활성 공지가 있으면 팝업(세션 1회)
  // 직전 방이 아직 진행/대기 중이고 내가 멤버면 '이어서 입장' 칩 표시
  const lr = Number(localStorage.getItem('rk_last_room'));
  if (lr) fetchRoom(lr).then(async r => {
    if (SCREEN !== 'home' || !r || (r.status !== 'waiting' && r.status !== 'playing')) { localStorage.removeItem('rk_last_room'); return; }
    const ms = await fetchMembers(lr);
    if (!ms.some(m => m.user_id === ME.id)) { localStorage.removeItem('rk_last_room'); return; }
    const c = document.querySelector('#resumeChip');
    if (c) c.innerHTML = `<button class="btn btn--primary resume-chip" data-act="enterRoom" data-room="${lr}">🔄 방 ${lr} 이어서 입장</button>`;
  }).catch(() => {});
}

/* ============================ 로비 ==================================== */
function cleanupLobby() { if (lobbyCh) { leaveChannel(lobbyCh); lobbyCh = null; } _lobbySig = null; }
function cleanupRoom() {
  stopTimer(); miniStop(); davinciStop(); mafiaStop(); splendorStop(); unoStop(); disarmResultLeave();
  if (typeof chatLeave === 'function') chatLeave();
  if (roomDbCh) { leaveChannel(roomDbCh); roomDbCh = null; }
  if (presenceCh) { leaveChannel(presenceCh); presenceCh = null; }
  if (hbIv) { clearInterval(hbIv); hbIv = null; }
  if (rkBc) { leaveChannel(rkBc.ch); rkBc = null; }
  presentIds = []; ROOM = null; G = null; work = null; liveBoard = null; lastRoomSig = ''; lastRoomVersion = -1; oneTileSeen.clear();
}
function cleanupAll() { cleanupLobby(); cleanupRoom(); ROOM_ID = null; }

async function goLobby(mode) {
  MODE = mode; _lobbySig = null; cleanupRoom(); ROOM_ID = null; setScreen('lobby');
  if (!lobbyCh) lobbyCh = subscribeLobby(() => scheduleLobbyRefresh());
  await refreshLobby();
  apiMe(TOKEN).then(handleMeRefresh);
}
let _reapAt = 0, _lobbySig = null;
async function refreshLobby() {
  if (SCREEN !== 'lobby') return;
  const lo = MODE === 'mini' ? 6 : 1, hi = MODE === 'mini' ? 10 : 5;
  const [rooms, members] = await Promise.all([fetchRooms(), fetchAllMembers()]);
  const seatCount = {};
  members.forEach(m => { if (m.seat != null && m.role === 'player') seatCount[m.room_id] = (seatCount[m.room_id] || 0) + 1; });
  const vis = rooms.filter(r => r.id >= lo && r.id <= hi);
  // 보이는 방들 유령정리(throttle)
  if (Date.now() - _reapAt > 4000) {
    _reapAt = Date.now();
    vis.forEach(r => { reapStale(r.id); });
  }
  // 보이는 칸 내용 동일하면 재렌더 생략(마피아 표/밤 version 증가로 인한 무의미 재구축 차단)
  const sig = vis.map(r => r.id + ':' + r.status + ':' + (r.game || '') + ':' + (seatCount[r.id] || 0)).join('|');
  if (sig === _lobbySig && SCREEN === 'lobby') return;
  _lobbySig = sig;
  app().innerHTML = `
    <section class="screen screen--lobby">
      <header class="lobby__top">
        <button class="btn btn--ghost" data-act="backHome">← 홈</button>
        <b style="margin-left:6px">${MODE === 'mini' ? '🎮 미니게임' : '🎲 보드게임'}</b>
        <span class="spacer"></span>${headerHTML()}
      </header>
      <ul class="room-grid scrollable grow">
        ${rooms.filter(r => r.id >= lo && r.id <= hi).map(r => {
          const c = seatCount[r.id] || 0;
          const playing = r.status !== 'waiting';
          const cap = r.game ? capOf(r.game) : (r.id <= 5 ? 4 : 8);   // 게임 미선택 보드룸=4(서버 일치)
          const gname = r.game ? GAME_NAME[r.game] : '게임 선택 전';
          return `<li class="room-card ${playing ? 'is-playing' : ''}" data-act="enterRoom" data-room="${r.id}" data-game="${r.game || ''}">
            <span class="room-card__id">방 ${r.id}</span>
            <span class="room-card__game">${esc(gname)}</span>
            <span class="room-card__count ${c >= cap ? 'is-full' : ''}">${c}/${cap}</span>
            <span class="room-card__state">${playing ? '게임중' : '대기중'}</span>
          </li>`;
        }).join('')}
      </ul>
      <p class="muted center" style="padding:10px">친구들과 같은 방에 모이면 방장이 시작해요.</p>
    </section>`;
}

/* ============================ 방 입장 ================================= */
async function enterRoomFlow(roomId) {
  if (ROOM_ID === roomId || busy) return;
  busy = true;
  try {
    cleanupLobby(); cleanupRoom();
    ROOM_ID = roomId;
    await reapStale(roomId);
    const room0 = await fetchRoom(roomId);
    ROOM = room0;                       // 선반영: curGame()/refreshLbCache 가 'rummikub' 폴백 대신 실제 게임 사용
    await enterRoom(roomId, ME, room0 ? room0.game : null);
    mySnapGame = (room0 && room0.game) || null;
    await refreshLbCache(true);
    roomDbCh = subscribeRoom(roomId, () => scheduleRoomRefresh());
    presenceCh = joinPresence(roomId, ME, { name: ME.real_name }, onPresence);
    if (typeof chatEnter === 'function') chatEnter(roomId, ME);
    hbIv = setInterval(() => heartbeat(ME.token, roomId), 4000);
    WAIT_TAB = 'seat';
    try { localStorage.setItem('rk_last_room', String(roomId)); } catch (e) {}   // 홈 '이어서 입장'용
    await refreshRoom();
  } finally { busy = false; }
}
let _lbAt = 0;
async function refreshLbCache(force) {
  const g = curGame() || 'rummikub';
  if (!force && g === lbCacheGame && Date.now() - _lbAt < 9000 && Object.keys(lbCache).length) return;
  _lbAt = Date.now(); lbCacheGame = g;
  const list = await apiLeaderboard(g);
  lbCache = {};
  list.forEach(u => lbCache[u.id] = { score: u.score, wins: u.wins, losses: u.losses, streak: u.streak, real_name: u.real_name });
}
let _roomT = null, _lobbyT = null;
function scheduleRoomRefresh() { clearTimeout(_roomT); _roomT = setTimeout(() => refreshRoom(), 140); }
function scheduleLobbyRefresh() { clearTimeout(_lobbyT); _lobbyT = setTimeout(() => refreshLobby(), 300); }

async function refreshRoom() {
  if (ROOM_ID == null) return;
  const [room, members] = await Promise.all([fetchRoom(ROOM_ID), fetchMembers(ROOM_ID)]);   // 직렬 2회 → 병렬 1회(지연↓)
  ROOM = room; MEMBERS = members;
  if (!ROOM) { goLobby(MODE); return; }
  // 내 멤버 행이 사라짐 = 방장 강퇴 / 개발자 강제초기화 / 유령정리 → 홈으로.
  // (playing 중 일시적 fetch 실패로 빈 배열이 와도 게임이 안 끊기도록 playing 은 제외)
  if (!MEMBERS.some(m => m.user_id === ME.id) && (MEMBERS.length > 0 || ROOM.status !== 'playing')) {
    try { localStorage.removeItem('rk_last_room'); } catch (e) {}
    toast('방에서 나왔어요'); cleanupRoom(); ROOM_ID = null; goHome(); return;
  }
  // 버전 역행 가드: 늦게 도착한 옛 스냅샷이 최신 화면을 덮지 않게(결과→게임 되돌림 방지). 대기는 버전이 안 올라가므로 동일 버전은 통과.
  if (ROOM.version != null) { if (ROOM.version < lastRoomVersion) return; lastRoomVersion = ROOM.version; }
  // 내 표시 스냅샷이 방 게임과 어긋나면 갱신(방장이 게임 고른 경우)
  const g = curGame();
  if (g && g !== mySnapGame && MEMBERS.some(m => m.user_id === ME.id)) { mySnapGame = g; updateMemberSnapshot(ROOM_ID, ME, g); }

  if (ROOM.status === 'waiting') {
    stopTimer(); miniStop(); davinciStop(); mafiaStop(); splendorStop(); unoStop(); disarmResultLeave();
    await refreshLbCache();   // 게이트 앞에서 먼저 갱신 — 좌석행이 쓰는 lbCache 를 최신화
    const sig = JSON.stringify({ g: ROOM.game, h: ROOM.host_id, ts: ROOM.turn_seconds, tab: WAIT_TAB,
      m: MEMBERS.map(m => { const s = statsOf(m.user_id); return [m.user_id, m.seat, m.role, s.score ?? m.score ?? 0, s.streak ?? m.streak ?? 0, s.wins ?? m.wins ?? 0, s.losses ?? m.losses ?? 0, m.display_game, m.display_score]; }).sort() });
    if (sig === lastRoomSig && SCREEN === 'room') return;   // 대기실 내용 동일 → 재렌더 생략(렉↓)
    lastRoomSig = sig;
    renderWaiting();
  } else if (ROOM.status === 'playing') {
    if (ROOM.game === 'rummikub') enterGameView();
    else if (ROOM.game === 'davinci') enterDavinciView();
    else if (ROOM.game === 'mafia') enterMafiaView();
    else if (ROOM.game === 'splendor') enterSplendorView();
    else if (ROOM.game === 'uno') enterUnoView();
    else enterMiniView();
  } else if (ROOM.status === 'finished') {
    stopTimer(); miniStop(); davinciStop(); mafiaStop(); splendorStop(); unoStop();
    if (SCREEN !== 'result') renderResult();   // 멤버 이탈 이벤트마다 재렌더/카운트다운 리셋 방지
  }
}

/* presence: 떠난 멤버 즉시정리 보조 + 방장 승격 (대기 중에만) */
async function onPresence(state) {
  presentIds = Object.keys(state || {});
  // 다빈치는 타이머가 없어 턴홀더가 탭을 닫으면 멈춤 → presence 이탈을 즉시 중퇴 처리 트리거
  if (ROOM && ROOM.status === 'playing' && ROOM.game === 'davinci') { davinciOnRoom(ROOM); return; }
  if (ROOM && ROOM.status === 'playing' && ROOM.game === 'splendor') { splendorOnRoom(ROOM); return; }
  if (ROOM && ROOM.status === 'playing' && ROOM.game === 'uno') { unoOnRoom(ROOM); return; }
  if (!ROOM || ROOM.status !== 'waiting' || !MEMBERS.length) return;
  const earliest = MEMBERS.slice().sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at));
  const janitor = earliest.find(m => presentIds.includes(m.user_id));
  if (!janitor || janitor.user_id !== ME.id) return;
  // 유령 멤버/방장 공석 정리는 서버 권위(rk_reap_stale, 하트비트 기반)에 위임 — 클라 임의 삭제 제거(보안)
  const reaped = await reapStale(ROOM_ID, 12);
  if (reaped) refreshRoom();
}
// 타임아웃 대리자: 접속 중 최저좌석(현재 차례 제외) 1명
function timeoutActorId() {
  if (!G || !G.players) return null;
  const curUid = G.players[G.turn];
  const seated = MEMBERS.filter(m => m.seat != null && presentIds.includes(m.user_id) && m.user_id !== curUid).sort((a, b) => a.seat - b.seat);
  return seated.length ? seated[0].user_id : null;
}

/* ----------------------------- 대기실(탭) ----------------------------- */
// scrollReset=true 면 본문을 최상단으로(탭 전환 등). 기본은 스크롤 위치 보존
// — 실시간 갱신(착석/이탈/방장 게임변경)마다 전체 innerHTML 재구축으로 스크롤이 튕기던 문제 해결.
function renderWaiting(scrollReset) {
  const amHost = ROOM.host_id === ME.id;
  const g = curGame();
  const cap = g ? capOf(g) : (ROOM_ID <= 5 ? 4 : 8);   // 게임 미선택 보드룸=4(서버 일치)
  const seated = MEMBERS.filter(m => m.seat != null).length;
  const tabBtn = (k, label) => `<button class="tab ${WAIT_TAB === k ? 'is-active' : ''}" data-act="waitTab" data-tab="${k}">${label}</button>`;
  const navHTML = `${tabBtn('seat', '좌석')}${tabBtn('tier', '티어표')}${tabBtn('deco', '꾸미기')}${tabBtn('rules', '규칙')}`;
  // 이미 대기실이 떠 있으면 부분 갱신(헤더 텍스트·탭·본문만 교체) → 스크롤 보존
  const sec = (SCREEN === 'room') ? document.querySelector('.screen--room') : null;
  if (sec) {
    const gn = sec.querySelector('.room__gname'); if (gn) gn.textContent = ' · ' + (g ? GAME_NAME[g] : '게임 선택 전');
    const cnt = sec.querySelector('.room__count'); if (cnt) cnt.textContent = `${seated}/${cap}`;
    const nav = sec.querySelector('.tabbar'); if (nav && nav.innerHTML !== navHTML) nav.innerHTML = navHTML;
    const body = sec.querySelector('.wait-body');
    if (body) {
      const keep = scrollReset ? 0 : body.scrollTop;
      body.innerHTML = waitBody(WAIT_TAB, amHost, g, cap);
      body.scrollTop = keep;
    }
    return;
  }
  setScreen('room');
  app().innerHTML = `
    <section class="screen screen--room">
      <header class="room__top">
        <button class="btn btn--ghost" data-act="leave">← 나가기</button>
        <b style="margin-left:6px">방 ${ROOM_ID}</b>
        <span class="muted room__gname"> · ${g ? GAME_NAME[g] : '게임 선택 전'}</span>
        <span class="spacer"></span>
        <span class="muted room__count">${seated}/${cap}</span>
      </header>
      <nav class="tabbar">${navHTML}</nav>
      <div class="wait-body grow scrollable">${waitBody(WAIT_TAB, amHost, g, cap)}</div>
    </section>`;
}
function waitBody(tab, amHost, g, cap) {
  if (tab === 'tier') return tierLadderHTML(g);
  if (tab === 'deco') return decoBody();
  if (tab === 'rules') return rulesBody(RULES_GAME);
  // 좌석 탭
  const seatMap = {}; MEMBERS.forEach(m => { if (m.seat != null) seatMap[m.seat] = m; });
  const mine = MEMBERS.find(m => m.user_id === ME.id) || {};
  const iAmSpectator = mine.role === 'spectator';
  const mySeatNow = mine.seat;
  const seated = MEMBERS.filter(m => m.seat != null).length;
  const seats = [];
  for (let n = 1; n <= cap; n++) {
    const m = seatMap[n];
    if (m) {
      const st = statsOf(m.user_id);
      const sc = st.score ?? m.score ?? 0, wn = st.wins ?? m.wins ?? 0, ls = st.losses ?? m.losses ?? 0, sk = st.streak ?? m.streak ?? 0;   // lbCache 우선 + 현재게임 멤버 스냅샷 폴백(100위 밖/미플레이 0점·아이언 방지)
      const isMe = m.user_id === ME.id;
      const decoGame = m.display_game;                 // 꾸미기에서 고른 대표 게임
      const decoScore = m.display_score || 0;
      const decoTier = decoGame ? tierForScore(decoScore) : null;
      const curG = g || 'rummikub';                    // 현재(플레이 중인) 게임 — lbCache 기준과 일치
      const curTier = tierForScore(sc);
      seats.push(`<li class="seat is-occupied ${isMe ? 'is-me' : ''}" data-seat="${n}">
        <span class="seat__no">${n}</span>
        <div class="seat__main">
          <div class="seat__name" style="--tc:${curTier.color}">${nameHTML(m.name, sc)}${isMe ? ' <small>(나)</small>' : ''}${ROOM.host_id === m.user_id ? ' <span class="seat__badge">방장</span>' : ''}</div>
          ${decoGame
            ? `<div class="seat__rep" style="--tc:${decoTier.color}"><span class="seat__rep-txt">대표 게임: ${GAME_NAME[decoGame]} ${decoTier.fullName} ${decoScore}</span><span class="seat__rep-emb">${emblemHTML(decoGame, decoScore, 'eq')}</span></div>`
            : `<div class="seat__rep seat__rep--none">대표 게임 미설정</div>`}
          <div class="seat__record">${wn}승 ${ls}패 ${streakHTML(sk)}</div>
        </div>
        <div class="seat__cur" style="--tc:${curTier.color}">
          <span class="seat__cur-emb">${emblemHTML(curG, sc, 'eq')}</span>
          <span class="seat__cur-line">${curTier.fullName}, ${sc}</span>
        </div>${amHost && !isMe ? `<button class="seat__kick" data-act="kick" data-uid="${m.user_id}" aria-label="내보내기">✕</button>` : ''}</li>`);
    } else {
      const canSit = !mySeatNow && !iAmSpectator;
      seats.push(`<li class="seat is-empty${canSit ? ' is-joinable' : ''}" ${canSit ? `data-act="sit" data-seat="${n}"` : ''}>＋ ${n}번${canSit ? ' 앉기' : ''}</li>`);
    }
  }
  let host = '';
  if (amHost) {
    const headcount = MEMBERS.length;                 // 방 인원(좌석+관전 포함)
    const lock5 = headcount >= 5;                      // 5명 이상이면 cap<=4 게임 전환 금지(마피아만)
    const picks = MODE === 'mini'
      ? [['race', '🏁 운빨 대시'], ['hunt', '🕵️ 나도 사람이야']]
      : [['rummikub', '🀄 루미큐브'], ['davinci', '🔢 다빈치 코드'], ['splendor', '💎 스플랜더'], ['uno', '🎴 우노'], ['mafia', '🔪 마피아']];
    const gamePick = `<div class="game-select">${picks.map(([k, lab]) => {
      const locked = lock5 && capOf(k) <= 4;
      return `<button class="chip ${ROOM.game === k ? 'is-active' : ''} ${locked ? 'is-locked' : ''}" data-act="setGame" data-game="${k}" ${locked ? 'disabled' : ''}>${lab}</button>`;
    }).join('')}</div>${lock5 ? `<div class="muted center" style="font-size:12px">5명 이상이라 <b>마피아</b>만 선택할 수 있어요</div>` : ''}`;
    const timeSel = ROOM.game === 'rummikub'   // 타이머 선택은 루미큐브만
      ? `<div class="time-select">${[15, 30, 60].map(s => `<button class="chip ${ROOM.turn_seconds === s ? 'is-active' : ''}" data-act="setTime" data-sec="${s}">${s}초</button>`).join('')}</div>`
      : '';
    const mn = ROOM.game ? minOf(ROOM.game) : 2;
    const canStart = !!ROOM.game && seated >= mn && seated <= cap;
    host = `<div class="host-controls">
        ${gamePick}${timeSel}
        <button class="btn btn--primary btn--lg" data-act="start" ${canStart ? '' : 'disabled'}>${ROOM.game ? `게임 시작 (${mn}~${cap}명)` : '게임을 먼저 고르세요'}</button>
      </div>`;
  } else {
    host = `<div class="wait-note">방장이 ${ROOM.game ? GAME_NAME[ROOM.game] + ' 시작' : '게임 선택'}을 기다리는 중…</div>`;
  }
  return `<ul class="seat-list">${seats.join('')}</ul>${host}
    <div class="room__actions">
      ${mySeatNow ? `<button class="btn btn--ghost" data-act="unseat">자리 비우기</button>` : ''}
      ${!iAmSpectator ? `<button class="btn btn--ghost" data-act="spectate">관전하기</button>` : `<div class="muted center">👁 관전 중</div>`}
    </div>`;
}
function decoBody() {
  const cur = ME.display && ME.display.game ? ME.display.game : '';
  const opt = (val, label) => {
    const score = val ? (ME.games && ME.games[val] ? ME.games[val].score : 0) : 0;
    return `<button class="deco-opt ${cur === val ? 'is-active' : ''}" data-act="setDisplay" data-dg="${val}">
      <span>${label}</span>${val ? decoChipEmbHTML(val, score, 'eqs') : '<span class="muted">아무것도 안 보임</span>'}</button>`;
  };
  const preview = cur ? `${nameHTML(ME.real_name, ME.display.score)} ${decoChipEmbHTML(cur, ME.display.score, 'eq')}` : `${nameHTML(ME.real_name, null)} <span class="muted">(숨김)</span>`;
  return `<div class="deco">
    <p class="muted">점수 아래·이름 옆에 보일 티어를 고르세요. 이름 색도 이 티어색이 돼요.</p>
    <div class="deco-preview">미리보기: ${preview}</div>
    ${opt('', '숨김')}${opt('rummikub', '루미큐브')}${opt('davinci', '다빈치 코드')}${opt('splendor', '스플랜더')}${opt('uno', '우노')}${opt('mafia', '마피아')}${opt('race', '운빨 대시')}${opt('hunt', '나도 사람이야')}
  </div>`;
}
function tierLadderHTML(g) {
  const score = (g && ME.games && ME.games[g]) ? ME.games[g].score : 0;
  const cur = tierForScore(score);
  return `<div class="tier-list-wrap">
    <div class="tier-hero">${emblemHTML(g, score, 'lg')}
      <div class="tier-hero__txt"><div class="tier-hero__name" style="--tc:${cur.color}">${cur.fullName}</div>
        <div class="muted">${g ? GAME_NAME[g] : '내'} · ${score}점</div></div></div>
    <ul class="tier-list">
      ${TIER_LADDER.slice().reverse().map(t => {
        const full = t.division ? `${t.name} ${ROMAN[t.division]}` : t.name;
        return `<li class="tier-row ${t.level === cur.level ? 'is-cur' : ''}" style="--tc:${t.color}">${emblemHTML(g, t.min, 'sm')}<span class="tier-row__name">${full}</span><span class="tier-row__cut">${t.min}점 +</span></li>`;
      }).join('')}
    </ul>
    ${scoreTableHTML(g)}
    <div class="muted center" style="padding:10px;font-size:12px;line-height:1.6">
      점수는 <b>등수·인원·티어</b>로 정해져요(위 표). 고티어일수록 적게 오르고 많이 내려가요(1등/승리는 항상 +).<br>
      연승 보너스: 다이아 이하 2연승부터. 게임마다 티어가 따로 쌓여요.
    </div></div>`;
}
async function doSit(seat) {
  await netCall(async () => {
    const r = await takeSeat(ROOM_ID, ME, seat);
    if (!r.ok) {
      if (r.reason === 'taken') { toast('이미 찬 자리예요'); await reapStale(ROOM_ID); }
      else if (r.reason === 'not_waiting') toast('이미 게임이 시작됐어요');
      else if (r.reason === 'full') toast('방이 가득 찼어요');
      else toast('자리 선택 실패, 다시 시도하세요');
    }
    await refreshRoom();
  });
}
async function doSpectate() { await netCall(async () => { await spectate(ROOM_ID, ME); await refreshRoom(); }); }
async function doSetTime(sec) { await netCall(async () => { await setTurnSeconds(ROOM_ID, sec); await refreshRoom(); }); }   // 낙관적 즉시 반영(칩 지연 제거)
async function doSetGame(game) {
  if (MEMBERS.length >= 5 && capOf(game) <= 4) { toast('5명 이상은 마피아만 선택할 수 있어요'); return; }
  await netCall(async () => { await setRoomGame(ROOM_ID, game); await refreshRoom(); });
}
async function doKick(uid) {
  await netCall(async () => { const r = await kickMember(ROOM_ID, ME, uid); if (r && r.ok === false) toast('내보내기 실패'); await refreshRoom(); });
}
function confirmLeave() {
  openSheet(`<h3 class="sheet__title">⚠ 지금 나가면?</h3>
    <p class="muted" style="padding:0 6px 12px;line-height:1.55">진행 중인 게임에서 나가면 <b style="color:var(--danger)">꼴찌(패배)로 처리</b>되어 점수가 차감돼요. 정말 나가시겠어요?</p>
    <button class="btn btn--primary btn--lg" data-act="leaveConfirm">나가기 (패배 처리)</button>
    <button class="btn btn--ghost btn--lg" data-act="closeSheet">취소</button>`);
}
async function doLeave() { try { localStorage.removeItem('rk_last_room'); } catch (e) {} await netCall(() => leaveRoomRpc(ROOM_ID, ME)); goLobby(MODE); }
async function doSetDisplay(game) {
  await netCall(async () => {
    const r = await apiSetDisplay(TOKEN, game || null);
    if (r.error) { toast(r.error); return; }
    ME.display = r.display; ME.display_game = r.display.game;
    if (ROOM_ID != null) await updateMemberSnapshot(ROOM_ID, ME, curGame());
    if (SCREEN === 'room') renderWaiting(); else if (SCREEN === 'deco') showDeco(); else if (SCREEN === 'home') goHome();
  });
}
async function doStart() {
  await netCall(async () => {
    const game = ROOM.game;
    if (!game) { toast('게임을 먼저 고르세요'); return; }
    const seated = MEMBERS.filter(m => m.seat != null).sort((a, b) => a.seat - b.seat);
    const cap = capOf(game), mn = minOf(game);
    if (seated.length < mn || seated.length > cap) { toast(`${mn}~${cap}명이 앉아야 시작`); return; }
    const seatNums = seated.map(m => m.seat);
    const scoresMap = {}; seated.forEach(m => { scoresMap[m.seat] = (lbCache[m.user_id] && lbCache[m.user_id].score) ?? 0; });
    let st;
    if (game === 'rummikub') {
      st = dealNewGame(seatNums);
      st.game = 'rummikub'; st.players = {}; st.names = {}; st.scores = {};
      seated.forEach(m => { st.players[m.seat] = m.user_id; st.names[m.seat] = m.name; st.scores[m.seat] = scoresMap[m.seat]; });
      st.n = seated.length; st.passStreak = 0; st.results = null;
    } else if (game === 'davinci') {
      st = davinciInitialState(seated.map(m => ({ seat: m.seat, user_id: m.user_id, name: m.name })), scoresMap);
    } else if (game === 'splendor') {
      st = splendorInitialState(seated.map(m => ({ seat: m.seat, user_id: m.user_id, name: m.name })), scoresMap);
    } else if (game === 'uno') {
      st = unoInitialState(seated.map(m => ({ seat: m.seat, user_id: m.user_id, name: m.name })), scoresMap);
    } else if (game === 'mafia') {
      const seed = ((serverNow() & 0x7fffffff) ^ (ROOM_ID * 2654435761)) >>> 0;
      st = { game: 'mafia', seed, players: {}, names: {}, scores: {}, n: seated.length,
             alive: {}, phase: 'lobby_assign', day: 0, votes: {}, voteCount: {}, log: [], winner: null, results: null };
      seated.forEach(m => { st.players[m.seat] = m.user_id; st.names[m.seat] = m.name; st.scores[m.seat] = scoresMap[m.seat]; st.alive[m.seat] = true; });
    } else {                                         // race / hunt
      const seed = ((serverNow() & 0x7fffffff) ^ (ROOM_ID * 2654435761)) >>> 0;
      st = { game, seed, players: {}, names: {}, scores: {}, n: seated.length, results: null };
      seatNums.forEach(s => { const m = seated.find(x => x.seat === s); st.players[s] = m.user_id; st.names[s] = m.name; st.scores[s] = scoresMap[s]; });
      if (game === 'race') { st.phase = 'racing'; st.finishOrder = []; st.ranks = null; }
      if (game === 'hunt') {
        const rng = mulberry32(seed);
        const it = seatNums[Math.floor(rng() * seatNums.length)];
        st.phase = 'playing'; st.it = it; st.roles = {}; st.alive = {}; st.caughtMid = {}; st.limitSec = 120;
        seatNums.forEach(s => { st.roles[s] = (s === it ? 'seeker' : 'hider'); st.alive[s] = true; });
      }
    }
    const r = await startGame(ROOM_ID, st);
    if (!r.ok) { toast('시작 실패 — 잠시 후 다시 시도해 주세요'); return; }
    if (game === 'mafia') await mafiaStartRoles(ROOM_ID, ME);   // 서버가 역할 비밀 배정 → 밤 시작
  });
}

/* ============================ 미니게임 위임 =========================== */
function enterMiniView() {
  G = ROOM.state;
  mySeat = seatOfUser(G, ME.id);
  amSpectator = (mySeat == null);
  if (SCREEN !== 'mini' || MINI.roomId !== ROOM_ID || !MINI.on) miniStart(ROOM, ME, mySeat, amSpectator);
  else miniOnRoom(ROOM);
}
function enterDavinciView() {
  G = ROOM.state;
  mySeat = seatOfUser(G, ME.id);
  amSpectator = (mySeat == null);
  if (SCREEN !== 'davinci' || !DV.on || DV.roomId !== ROOM_ID) davinciEnter(ROOM, ME, mySeat, amSpectator);
  else davinciOnRoom(ROOM);
}
function enterSplendorView() {
  G = ROOM.state;
  mySeat = seatOfUser(G, ME.id);
  amSpectator = (mySeat == null);
  if (SCREEN !== 'splendor' || !SP.on || SP.roomId !== ROOM_ID) splendorEnter(ROOM, ME, mySeat, amSpectator);
  else splendorOnRoom(ROOM);
}
function enterUnoView() {
  G = ROOM.state;
  mySeat = seatOfUser(G, ME.id);
  amSpectator = (mySeat == null);
  if (SCREEN !== 'uno' || !UN.on || UN.roomId !== ROOM_ID) unoEnter(ROOM, ME, mySeat, amSpectator);
  else unoOnRoom(ROOM);
}
function enterMafiaView() {
  G = ROOM.state;
  mySeat = seatOfUser(G, ME.id);
  amSpectator = (mySeat == null);
  if (SCREEN !== 'mafia' || !MF.on || MF.roomId !== ROOM_ID) mafiaEnter(ROOM, ME, mySeat, amSpectator);
  else mafiaOnRoom(ROOM);
}

/* ============================ 루미큐브 게임 =========================== */
function isMyTurn() { return ROOM && ROOM.status === 'playing' && mySeat && Number(G.turn) === Number(mySeat); }
function cloneWork(s) { return { board: deepClone(s.board), hands: deepClone(s.hands) }; }
function seatOfUser(s, uid) { const p = s.players || {}; for (const k in p) if (p[k] === uid) return Number(k); return null; }
function isOver(s) { return Object.keys(s.hands).some(k => s.hands[k].length === 0) || (s.passStreak || 0) >= s.n; }

function enterGameView() {
  G = ROOM.state;
  mySeat = seatOfUser(G, ME.id);
  amSpectator = (mySeat == null);
  if (prevTurn !== Number(G.turn)) liveBoard = null;        // 턴 바뀌면 라이브보드 초기화
  if (ROOM.status === 'playing' && isOver(G)) {
    stopTimer();
    setScreen('game');
    app().innerHTML = `<section class="screen center" style="justify-content:center;gap:8px"><h2>🏁 게임 종료</h2><p class="muted">결과 집계 중…</p></section>`;
    if (mySeat != null) settleRummikub();
    return;
  }
  if (!rkBc) rkBc = joinBroadcast(ROOM_ID, rkOnBroadcast);  // 실시간 중계 채널
  if (isMyTurn()) { if (!work || prevTurn !== Number(G.turn)) initWork(); }
  else { work = cloneWork(G); syncRackOrder(work.hands[mySeat]); }
  prevTurn = Number(G.turn);
  renderGame();
  startTimer();
}
function initWork() {
  work = cloneWork(G);
  turnStart = { board: deepClone(G.board), rack: G.hands[mySeat].slice() };
  turnStartBoardSet = new Set(G.board.flat());
  undoStack = [];
  syncRackOrder(work.hands[mySeat]);
}
function tileMarkup(id) {
  const t = TILES[id];
  const cls = t.joker ? 'tile--joker' : 'tile--' + t.color;
  const face = t.joker ? '★' : t.num;
  return `<span class="tile-hit" data-tile="${id}"><span class="tile ${cls}">${face}</span></span>`;
}
function setClass(ids) { if (ids.length === 0) return ''; if (ids.length < 3) return 'is-incomplete'; return isValidMeld(ids) ? 'is-valid' : 'is-invalid'; }
function boardHTML(board) {
  return board.map((set, i) => `<div class="board-set ${setClass(set)}" data-set-idx="${i}">${set.map(id => tileMarkup(id)).join('')}</div>`).join('')
    + `<div class="new-set-zone" data-newset>＋ 여기에 끌어다 새 세트</div>`;
}
// 내 패는 rackOrder(개인 정렬)대로. 자동으로 안 바뀜. 새 타일은 끝에 추가.
function syncRackOrder(hand) {
  hand = hand || (work ? work.hands[mySeat] : (G && G.hands[mySeat]) || []) || [];
  const inHand = new Set(hand);
  rackOrder = rackOrder.filter(id => inHand.has(id));
  hand.forEach(id => { if (!rackOrder.includes(id)) rackOrder.push(id); });
  return rackOrder;
}
function rackTilesHTML(hands) { return syncRackOrder(hands[mySeat] || []).map(id => tileMarkup(id)).join(''); }
function meldHintHTML() {
  if (!isMyTurn()) return '';
  if (!(mySeat && G.initialMeld[mySeat])) {
    const pts = previewNewPoints(G, mySeat, turnStart.board, work.board) || 0;
    return `<div class="meld-hint" data-can="${pts >= 30 ? 1 : 0}"><div class="meld-hint__bar"><i style="--p:${Math.min(1, pts / 30)}"></i></div><span class="meld-hint__label">${pts >= 30 ? '낼 수 있어요!' : pts + ' / 30점'}</span></div>`;
  }
  const added = new Set(work.board.flat()); turnStartBoardSet.forEach(id => added.delete(id));
  return `<div class="meld-hint" data-can="1"><span class="meld-hint__label">이번 턴 ${added.size}장 냄 · 자유롭게 배치 후 [내기]</span></div>`;
}
function renderGame() {
  const mine = isMyTurn();
  const editingLive = !mine && liveBoard && Number(G.turn) !== Number(mySeat);
  const viewBoard = mine ? work.board : (editingLive ? liveBoard : G.board);
  const viewHands = mine ? work.hands : G.hands;
  const seats = Object.keys(G.players).map(Number).sort((a, b) => a - b);
  const oppoSeats = seats.filter(s => s !== mySeat);
  const oppoHtml = oppoSeats.map(s => {
    const cnt = (G.hands[s] || []).length;
    const t = tierForScore((G.scores || {})[s] || 0);
    return `<li class="oppo ${Number(G.turn) === s ? 'is-turn' : ''} ${cnt === 1 ? 'is-1tile' : ''} ${amSpectator ? 'is-peekable' : ''}" ${amSpectator ? `data-act="peek" data-seat="${s}"` : ''}>
      <span class="oppo__name tier-name" style="--tc:${t.color}">${decoEmblemHTML(G.players[s])}${esc(G.names[s])}</span><span class="oppo__count">${cnt}</span></li>`;
  }).join('');
  const turnName = G.names[Number(G.turn)] || ('좌석' + G.turn);
  let dock;
  if (amSpectator) {
    dock = `<div class="spectate-dock">👁 관전 중${editingLive ? ` — ${esc(turnName)} 정리 중…` : ''} · 상대를 눌러 손패 보기</div>`;
  } else {
    dock = `<footer class="dock">
      <div class="rack" data-rack>${rackTilesHTML(viewHands)}</div>
      <nav class="action-bar">
        <button class="btn btn--ghost" data-act="sort" data-key="num">숫자↕</button>
        <button class="btn btn--ghost" data-act="sort" data-key="color">색↕</button>
        <button class="btn btn--ghost btn--icon" data-act="undo" ${mine ? '' : 'disabled'}>↶</button>
        <button class="btn btn--ghost btn--icon" data-act="reset" ${mine ? '' : 'disabled'}>⟲</button>
      </nav>
      <nav class="action-bar action-bar--primary">
        <button class="btn btn--primary btn--submit" data-act="submit" ${mine ? '' : 'disabled'}>내기</button>
        <button class="btn btn--draw" data-act="draw" ${mine ? '' : 'disabled'}>뽑기</button>
      </nav>
    </footer>`;
  }
  setScreen('game');
  app().innerHTML = `
    <section class="screen screen--game">
      <header class="topbar">
        <div class="turn-pill ${mine ? 'is-mine' : ''}">${mine ? '내 차례' : esc(turnName) + ' 차례'}${editingLive ? ' ✏️' : ''}</div>
        <div class="timer" data-role="timer" data-state="normal">
          <svg class="timer__ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="none" stroke="var(--line)" stroke-width="3"/><circle class="timer__fill" cx="18" cy="18" r="16" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-dasharray="100.5" stroke-dashoffset="0"/></svg>
          <span class="timer__num" data-role="timerNum">–</span>
        </div>
        <span class="room-tag">방${ROOM_ID}·🂠${G.pool.length}</span>
        <ul class="oppo-strip">${oppoHtml}</ul>
      </header>
      <div id="hintHost">${meldHintHTML()}</div>
      <main class="board">${boardHTML(viewBoard)}</main>
      ${dock}
    </section>`;
  updateTimerUI();
  oppoSeats.concat(mySeat ? [mySeat] : []).forEach(s => {   // 1장 진입 순간 1회만(매 갱신 반복발화/진동 방지)
    const isOne = (G.hands[s] || []).length === 1;
    if (isOne && !oneTileSeen.has(s)) { oneTileSeen.add(s); flashBanner('1장!'); }
    else if (!isOne) oneTileSeen.delete(s);
  });
}
// 내 턴 편집 시 보드/랙/힌트만 갱신 + 실시간 중계
function renderPlay() {
  const b = document.querySelector('.board'); if (b) b.innerHTML = boardHTML(work.board);
  const r = document.querySelector('.dock .rack'); if (r) r.innerHTML = rackTilesHTML(work.hands);
  const h = document.getElementById('hintHost'); if (h) h.innerHTML = meldHintHTML();
  rkBroadcastWork();
}
// 다른 사람이 보는 라이브 보드만 갱신(내 턴 아닐 때 수신)
function rkRenderLive() {
  if (isMyTurn()) return;
  const b = document.querySelector('.board'); if (b) b.innerHTML = boardHTML(liveBoard || G.board);
}
function renderRackOnly() { const r = document.querySelector('.dock .rack'); if (r) r.innerHTML = rackTilesHTML(work.hands); }
function reflowSet(ids) {
  if (ids.length < 2) return ids.slice();
  const tiles = ids.map(id => TILES[id]);
  const reals = tiles.filter(t => !t.joker);
  const jokerIds = ids.filter(id => TILES[id].joker);
  if (reals.length > 0 && reals.every(t => t.num === reals[0].num)) return ids.slice();
  if (reals.length > 0 && reals.every(t => t.color === reals[0].color)) {
    const sorted = reals.slice().sort((a, b) => a.num - b.num);
    const out = []; let jk = jokerIds.slice(); let cur = sorted[0].num; let ri = 0;
    while (ri < sorted.length) {
      if (sorted[ri].num === cur) { out.push(sorted[ri].id); ri++; cur++; }
      else if (sorted[ri].num < cur) { return ids.slice(); }
      else if (jk.length) { out.push(jk.shift()); cur++; }
      else return ids.slice();
    }
    while (jk.length) out.push(jk.shift());
    return out;
  }
  return ids.slice();
}
function removeFromWork(id) {
  for (const m of work.board) { const i = m.indexOf(id); if (i >= 0) { m.splice(i, 1); return; } }
  const r = work.hands[mySeat]; const i = r.indexOf(id); if (i >= 0) r.splice(i, 1);
}
/* --- 드래그 조작 (실제 모바일 루미큐브식: 끌어 놓으면 자동 정렬·스냅, 탭=자동배치) --- */
function pushUndo() { undoStack.push({ board: deepClone(work.board), hands: deepClone(work.hands), order: rackOrder.slice() }); if (undoStack.length > 50) undoStack.shift(); }
function cleanupBoard() { work.board = work.board.map(reflowSet).filter(s => s.length > 0); }
// 자동배치용: 이 타일이 세트에 '이어붙을' 수 있나(2장짜리 미완성도 허용 → 탭으로 런/그룹 쌓기 가능)
function rkFits(set, id) {
  const t = TILES[id]; if (t.joker) return set.length < 4;
  const reals = set.map(x => TILES[x]).filter(x => !x.joker);
  if (reals.length === 0) return true;
  if (reals.every(r => r.num === reals[0].num)) {           // 그룹: 같은 숫자, 색 안 겹침
    if (t.num === reals[0].num && !reals.some(r => r.color === t.color) && set.length < 4) return true;
  }
  if (reals.every(r => r.color === reals[0].color) && t.color === reals[0].color) {  // 런: 같은 색, 끝에 이어짐
    const nums = reals.map(r => r.num), mn = Math.min(...nums), mx = Math.max(...nums);
    if ((t.num === mn - 1 || t.num === mx + 1) && t.num >= 1 && t.num <= 13) return true;
  }
  return false;
}

function rkPointerDown(e) {
  if (SCREEN !== 'game' || amSpectator || dragging) return;   // 진행 중 드래그 있으면 멀티터치 무시
  if (e.button != null && e.button !== 0) return;
  const tileEl = e.target.closest('.tile-hit'); if (!tileEl) return;
  const cont = tileEl.closest('.rack, .board-set'); if (!cont) return;
  const fromRack = cont.classList.contains('rack');
  if (!isMyTurn() && !fromRack) return;       // 내 턴 아니면 손패 재정렬만 허용
  document.querySelectorAll('.drag-ghost').forEach(g => g.remove());   // 잔재 고스트 정리
  dragging = { id: tileEl.dataset.tile, fromRack, x: e.clientX, y: e.clientY, moved: false, ghost: null, el: tileEl, pid: e.pointerId };
  window.addEventListener('pointermove', rkPointerMove, { passive: false });
  window.addEventListener('pointerup', rkPointerUp);
  window.addEventListener('pointercancel', rkPointerUp);
}
function rkPointerMove(e) {
  if (!dragging || (e.pointerId != null && e.pointerId !== dragging.pid)) return;
  if (!dragging.moved) {
    if (Math.hypot(e.clientX - dragging.x, e.clientY - dragging.y) < 7) return;
    dragging.moved = true;
    const g = document.createElement('div'); g.className = 'drag-ghost'; g.innerHTML = tileMarkup(dragging.id);
    document.body.appendChild(g); dragging.ghost = g;
    if (dragging.el) dragging.el.classList.add('is-dragging');
  }
  e.preventDefault();
  dragging.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  rkHighlight(e.clientX, e.clientY);
}
function rkPointerUp(e) {
  if (!dragging || (e.pointerId != null && e.pointerId !== dragging.pid)) return;
  window.removeEventListener('pointermove', rkPointerMove);
  window.removeEventListener('pointerup', rkPointerUp);
  window.removeEventListener('pointercancel', rkPointerUp);
  const d = dragging; dragging = null;
  if (!d) return;
  if (d.ghost) d.ghost.remove();
  if (d.el) d.el.classList.remove('is-dragging');
  rkClearHi();
  if (!d.moved) { rkTapPlace(d); return; }    // 이동 없으면 탭으로 처리
  rkApplyMove(d, rkDropTarget(e.clientX, e.clientY), e.clientX);
}
let _rkHi = null;
function rkHighlight(x, y) {
  const el = document.elementFromPoint(x, y);
  const t = el ? el.closest('.board-set, .new-set-zone, .rack') : null;
  if (t !== _rkHi) { if (_rkHi) _rkHi.classList.remove('drop-hi'); _rkHi = t; if (_rkHi) _rkHi.classList.add('drop-hi'); }
}
function rkClearHi() { if (_rkHi) { _rkHi.classList.remove('drop-hi'); _rkHi = null; } }
function rkDropTarget(x, y) {
  const el = document.elementFromPoint(x, y); if (!el) return { kind: 'none' };
  const set = el.closest('.board-set'); if (set) return { kind: 'set', idx: Number(set.dataset.setIdx) };
  if (el.closest('.new-set-zone')) return { kind: 'newset' };
  if (el.closest('.rack')) return { kind: 'rack', el: el.closest('.rack') };
  if (el.closest('.board')) return { kind: 'newset' };   // 보드 빈 영역 = 새 세트
  return { kind: 'none' };
}
function reorderRack(id, dropX, rackEl) {
  syncRackOrder();
  const order = rackOrder.filter(x => x !== id);
  let idx = order.length;
  if (rackEl) {
    for (const tile of rackEl.querySelectorAll('.tile-hit')) {
      if (tile.dataset.tile === id) continue;
      const r = tile.getBoundingClientRect();
      if (dropX < r.left + r.width / 2) { const oi = order.indexOf(tile.dataset.tile); if (oi >= 0) { idx = oi; break; } }
    }
  }
  order.splice(idx, 0, id); rackOrder = order;
}
function rkApplyMove(d, tgt, dropX) {
  if (tgt.kind === 'none') { renderPlay(); return; }
  if (tgt.kind === 'rack') {
    if (d.fromRack) { reorderRack(d.id, dropX, tgt.el); if (isMyTurn()) renderPlay(); else renderRackOnly(); return; }   // 손패 재정렬(내 턴 아니면 보드 안 건드림)
    if (!isMyTurn()) return;
    if (turnStartBoardSet.has(d.id)) { toast('보드에 원래 있던 타일은 가져올 수 없어요'); return; }
    pushUndo(); removeFromWork(d.id); work.hands[mySeat].push(d.id); cleanupBoard(); reorderRack(d.id, dropX, tgt.el); renderPlay(); return;
  }
  if (!isMyTurn()) return;
  pushUndo(); removeFromWork(d.id);
  if (tgt.kind === 'newset') work.board.push([d.id]);
  else { const idx = tgt.idx; if (idx == null || !work.board[idx]) work.board.push([d.id]); else work.board[idx].push(d.id); }
  cleanupBoard(); renderPlay();
}
function rkTapPlace(d) {                       // 탭(이동 없이) = 자동 배치/회수
  if (!isMyTurn()) return;
  if (d.fromRack) {
    pushUndo(); removeFromWork(d.id);
    let placed = false;
    for (const set of work.board) { if (rkFits(set, d.id)) { set.push(d.id); placed = true; break; } }
    if (!placed) work.board.push([d.id]);
    cleanupBoard(); renderPlay();
  } else {
    if (turnStartBoardSet.has(d.id)) { toast('보드에 원래 있던 타일은 가져올 수 없어요'); return; }
    pushUndo(); removeFromWork(d.id); work.hands[mySeat].push(d.id); cleanupBoard(); renderPlay();
  }
}
function doUndo() { const u = undoStack.pop(); if (u) { work.board = u.board; work.hands = u.hands; rackOrder = u.order; renderPlay(); } }
function doReset() { work.board = deepClone(turnStart.board); work.hands = deepClone(G.hands); work.hands[mySeat] = turnStart.rack.slice(); undoStack = []; renderPlay(); }
function doSort(key) {   // 수동 정렬(버튼 누를 때만). 평소엔 내 순서 그대로 유지.
  localStorage.setItem('rk_sort', key);
  const hand = (work ? work.hands[mySeat] : (G.hands[mySeat] || [])) || [];
  const arr = hand.slice();
  arr.sort((a, b) => { const ta = TILES[a], tb = TILES[b]; if (ta.joker) return 1; if (tb.joker) return -1;
    return key === 'num' ? (ta.num - tb.num) || (COLORS.indexOf(ta.color) - COLORS.indexOf(tb.color)) : (COLORS.indexOf(ta.color) - COLORS.indexOf(tb.color)) || (ta.num - tb.num); });
  rackOrder = arr; renderPlay();
}
/* --- 실시간 중계: 내 편집을 남에게 broadcast / 남의 편집을 라이브 표시 --- */
function rkBroadcastWork() {
  if (!rkBc || !isMyTurn()) return;
  const now = performance.now(); if (now - _rkBcT < 130) return; _rkBcT = now;
  rkBc.send({ t: 'rkwork', seat: mySeat, board: work.board });
}
function rkOnBroadcast(msg) {
  if (!msg || msg.t !== 'rkwork' || SCREEN !== 'game' || isMyTurn()) return;
  if (Number(msg.seat) !== Number(G.turn)) return;
  liveBoard = msg.board; rkRenderLive();
}
async function onSubmit() {
  if (busy) return;
  const cur = work.board.map(reflowSet).filter(s => s.length > 0);
  const res = validateTurn(G, mySeat, turnStart.board, cur, turnStart.rack, work.hands[mySeat]);
  if (!res.ok) { toast(res.msg); return; }
  const s = deepClone(G);
  s.board = cur; s.hands[mySeat] = syncRackOrder(work.hands[mySeat]).slice();
  if (!s.initialMeld[mySeat]) s.initialMeld[mySeat] = true;
  s.passStreak = 0;
  const emptied = s.hands[mySeat].length === 0;
  if (!emptied) s.turn = nextSeat(s, mySeat);
  await commit(s);
}
async function onDraw() {
  if (busy) return;
  const s = deepClone(G);
  if (s.pool.length > 0) { s.hands[mySeat].push(s.pool.shift()); s.passStreak = 0; }
  else { s.passStreak = (s.passStreak || 0) + 1; }
  s.hands[mySeat] = syncRackOrder(s.hands[mySeat]).slice();
  s.turn = nextSeat(s, mySeat);
  await commit(s);
}
async function commit(state) {
  busy = true;
  const v = ROOM.version;
  const r = await pushState(ROOM_ID, state, v);
  busy = false;
  if (!r.ok) { toast('보드가 변경됐어요. 다시 시도하세요.'); await refreshRoom(); return; }
  work = null;
  if (isOver(state)) await finishGame(ROOM_ID, TOKEN, 'rummikub');
  await refreshRoom();
}
// 종료 정산 재시도(결과화면 '집계 중' 영구정지 방지)
async function settleRummikub() {
  for (let i = 0; i < 5; i++) {
    const r = await finishGame(ROOM_ID, TOKEN, 'rummikub');
    if (r && r.ok) { await refreshRoom(); return; }
    const room = await fetchRoom(ROOM_ID);
    if (room && room.status === 'finished') { await refreshRoom(); return; }
    await new Promise(res => setTimeout(res, 700));
  }
  await refreshRoom();
}
async function autoTimeout(forSeat) {
  if (busy) return; busy = true;
  // 본인 차례 시간초과 — 준비된 배치가 규칙상 유효하면 자동 제출(버튼만 안 누른 경우 구제)
  if (Number(forSeat) === Number(mySeat) && work && turnStart) {
    const cur = work.board.map(reflowSet).filter(b => b.length > 0);
    const chk = validateTurn(G, mySeat, turnStart.board, cur, turnStart.rack, work.hands[mySeat]);
    if (chk.ok) {
      const s2 = deepClone(G);
      s2.board = cur; s2.hands[mySeat] = syncRackOrder(work.hands[mySeat]).slice();
      if (!s2.initialMeld[mySeat]) s2.initialMeld[mySeat] = true;
      s2.passStreak = 0;
      if (s2.hands[mySeat].length !== 0) s2.turn = nextSeat(s2, mySeat);
      const r2 = await pushState(ROOM_ID, s2, ROOM.version); busy = false;
      if (r2.ok) { work = null; if (isOver(s2)) await finishGame(ROOM_ID, TOKEN, 'rummikub'); }
      await refreshRoom();
      return;
    }
  } else if (liveBoard && Number(G.turn) === Number(forSeat)) {
    // 끊긴 현재 플레이어의 준비배치(중계 수신본)가 규칙상 유효하면 대리 자동제출
    const cur = liveBoard.map(reflowSet).filter(b => b.length > 0);
    const startSet = new Set((G.board || []).flat());
    const added = [...new Set(cur.flat())].filter(id => !startSet.has(id));
    const startRack = (G.hands[forSeat] || []).slice();
    const remaining = startRack.filter(id => !added.includes(id));
    if (validateTurn(G, forSeat, G.board, cur, startRack, remaining).ok) {
      const s = deepClone(G);
      s.board = cur; s.hands[forSeat] = remaining;
      if (!s.initialMeld[forSeat]) s.initialMeld[forSeat] = true;
      s.passStreak = 0;
      if (remaining.length !== 0) s.turn = nextSeat(s, forSeat);
      const r2 = await pushState(ROOM_ID, s, ROOM.version); busy = false;
      if (r2.ok) { if (isOver(s)) await finishGame(ROOM_ID, TOKEN, 'rummikub'); }
      await refreshRoom();
      return;
    }
  }
  const s = deepClone(G);
  if (Number(s.turn) !== Number(forSeat)) { busy = false; return; }
  if (s.pool.length > 0) { s.hands[forSeat].push(s.pool.shift()); s.passStreak = 0; }
  else { s.passStreak = (s.passStreak || 0) + 1; }
  const over = isOver(s);
  if (!over) s.turn = nextSeat(s, forSeat);
  const v = ROOM.version;
  const r = await pushState(ROOM_ID, s, v);
  busy = false;
  if (r.ok) { work = null; if (over) await finishGame(ROOM_ID, TOKEN, 'rummikub'); await refreshRoom(); }
}
function startTimer() { if (serverTimeStale()) syncServerTime(); if (timerIv) return; timerIv = setInterval(tick, 250); }
function stopTimer() { if (timerIv) { clearInterval(timerIv); timerIv = null; } lastAutoKey = null; }
function tick() {
  if (!ROOM || ROOM.status !== 'playing' || ROOM.game !== 'rummikub' || !ROOM.turn_started_at || !G) return;
  if (serverTimeStale()) syncServerTime();                 // 클럭 오래되면 자가 재동기(타이머 ~1RTT 내 보정)
  const startMs = new Date(ROOM.turn_started_at).getTime();
  const lim = ROOM.turn_seconds || 30;
  const rem = Math.min(lim, lim - (serverNow() - startMs) / 1000);   // 표시는 lim 초과 금지(클럭스큐 방어)
  updateTimerUI(rem, lim);
  const key = ROOM.version + '|' + G.turn;
  if (rem <= 0 && isMyTurn() && lastAutoKey !== key) { lastAutoKey = key; autoTimeout(mySeat); }
  else if (rem < -4 && !isMyTurn() && lastAutoKey !== key && timeoutActorId() === ME.id) { lastAutoKey = key; autoTimeout(Number(G.turn)); }
}
function updateTimerUI(rem, lim) {
  const numEl = $('[data-role="timerNum"]'), tEl = $('[data-role="timer"]'), fill = $('.timer__fill');
  if (!numEl || !tEl) return;
  if (rem == null) { if (ROOM && ROOM.turn_started_at) { lim = ROOM.turn_seconds || 30; rem = Math.min(lim, lim - (serverNow() - new Date(ROOM.turn_started_at).getTime()) / 1000); } else { numEl.textContent = '–'; return; } }
  const r = Math.max(0, rem);
  numEl.textContent = Math.ceil(r);
  const state = r > 10 ? 'normal' : r > 5 ? 'warn' : 'danger';
  if (fill) { const C = 100.5; fill.style.strokeDashoffset = (C * (1 - r / lim)).toFixed(1);
    fill.style.stroke = state === 'danger' ? 'var(--danger)' : state === 'warn' ? 'var(--warn)' : 'var(--accent)'; }
  tEl.dataset.state = state;
  if (state === 'danger' && !lastDanger) { lastDanger = true; if (navigator.vibrate) navigator.vibrate(60); }
  if (state !== 'danger') lastDanger = false;
}
function openPeek(seat) {
  const hand = (G.hands[seat] || []);
  openSheet(`<h3 class="sheet__title">${esc(G.names[seat])} 님의 손패 (${hand.length}장)</h3>
    <div class="sheet__tiles rack">${hand.map(id => tileMarkup(id, false)).join('')}</div>
    <button class="btn btn--ghost btn--lg" data-act="closeSheet">닫기</button>`);
}

/* ============================ 결과 (4게임 공용) ====================== */
function streakChangeHTML(prev, now) {
  prev = prev || 0; now = now || 0;
  if (now > prev) return `🔥${prev}→${now}`;
  if (now < prev) return now === 0 ? `🔥${prev}→꺼짐` : `🔥${prev}→${now}`;
  return now > 0 ? `🔥${now} 유지` : '—';
}
function renderResult() {
  G = ROOM.state;
  const results = (G && G.results) || {};
  const game = (G && G.game) || ROOM.game || 'rummikub';
  const rows = Object.keys(results).map(seat => ({ seat: Number(seat), ...results[seat] }));
  rows.sort((a, b) => (a.rank != null ? a.rank : (a.won ? 0 : 1)) - (b.rank != null ? b.rank : (b.won ? 0 : 1)) || (b.delta - a.delta) || (a.seat - b.seat));
  const amHost = ROOM.host_id === ME.id;
  const anyWin = rows.some(r => r.won);
  setScreen('result');
  app().innerHTML = `
    <section class="screen screen--result scrollable">
      <h2 class="result__title">🏁 ${GAME_NAME[game] || ''} 종료</h2>
      <ol class="rank-list">
        ${rows.map(r => {
          const tprev = tierForScore(r.prevScore || 0), tnew = tierForScore(r.newScore || 0);
          const chg = tnew.level > tprev.level ? '<span class="tier-up">▲승급</span>' : tnew.level < tprev.level ? '<span class="tier-down">▼강등</span>' : '';
          const place = r.rank != null ? `${r.rank}위` : (r.won ? '승' : '패');
          let tag = '';
          if (game === 'hunt') tag = r.role === 'seeker' ? ` <span class="role-tag">🕵️술래 ${r.found != null ? r.found + '색출' : ''}</span>` : ` <span class="role-tag">🙂${r.survived ? '생존' : '색출됨'}</span>`;
          else if (game === 'mafia') { const rn = { mafia: '🔪 마피아', police: '🚓 경찰', doctor: '🚑 의사', citizen: '🙂 시민' }[r.role] || ''; tag = ` <span class="role-tag">${rn} · ${r.won ? '승리' : '패배'}</span>`; }
          if (r.quit) tag += ' <span class="role-tag">🚪중퇴</span>';
          const rec = (r.wins != null) ? `${r.wins}승 ${r.losses}패` : '';
          return `<li class="rank-row ${r.won ? 'is-winner' : ''}">
            <span class="rank-row__place">${place}</span>
            <div class="rr">
              <div class="rr__l1"><span class="rr__name">${G.players ? decoEmblemHTML(G.players[r.seat]) : ''}${nameHTML(G.names[r.seat], r.newScore)}${r.won ? ' 🏆' : ''}${tag}</span>
                <span class="rank-row__delta ${r.delta >= 0 ? 'delta--up' : 'delta--down'}">${r.delta >= 0 ? '+' : ''}${r.delta}${r.bonus > 0 ? ` <small>🔥+${r.bonus}</small>` : ''}</span></div>
              <div class="rr__l2"><span class="rr__sc">${r.prevScore || 0} → <b>${r.newScore || 0}</b></span> ${tierBadgeHTML(game, r.newScore)} ${chg}</div>
              <div class="rr__l3 muted">${GAME_SHORT[game] || ''} ${rec} · 연승 ${streakChangeHTML(r.prevStreak, r.streak)}</div>
            </div>
          </li>`;
        }).join('')}
      </ol>
      <div class="room__actions">
        <div class="muted center"><b data-role="resultCountdown">14</b>초 후 자동으로 홈으로 나갑니다</div>
        <button class="btn btn--primary btn--lg" data-act="leaveNow">지금 홈으로</button>
      </div>
    </section>`;
  if (anyWin) {
    const w = document.createElement('div'); w.className = 'win-burst';
    const cols = ['var(--accent)', 'var(--ok)', 'var(--warn)', 'var(--joker)'];
    w.innerHTML = '<span class="win-emoji">🎉</span>' +
      Array.from({ length: 12 }, (_, i) => `<i class="confetti" style="left:calc(50% + ${(i * 9) - 50}px); background:${cols[i % cols.length]}; animation-delay:${(i % 5) * 40}ms"></i>`).join('');
    document.body.appendChild(w); setTimeout(() => w.remove(), 1500);
  }
  armResultLeave();
  apiMe(TOKEN).then(handleMeRefresh);
}

/* 게임 종료 → 결과 잠깐 보여준 뒤 전원 자동으로 방에서 나가 홈으로(잔상/폐쇄 방지) */
function armResultLeave() {
  if (resultLeaveIv) return;   // 이미 카운트다운 중이면 리셋하지 않음(멤버 이탈마다 되돌림 방지)
  resultLeaveAt = Date.now() + 14000;
  resultLeaveIv = setInterval(() => {
    const el = document.querySelector('[data-role="resultCountdown"]');
    const rem = Math.max(0, Math.ceil((resultLeaveAt - Date.now()) / 1000));
    if (el) el.textContent = rem;
    if (rem <= 0) doResultAutoLeave();
  }, 300);
}
function disarmResultLeave() { if (resultLeaveIv) { clearInterval(resultLeaveIv); resultLeaveIv = null; } }
async function doResultAutoLeave() {
  disarmResultLeave();
  try { localStorage.removeItem('rk_last_room'); } catch (e) {}
  if (ROOM_ID == null) { goHome(); return; }
  const rid = ROOM_ID;
  try { await leaveRoomRpc(rid, ME); } catch (e) {}
  goHome();
}

/* ============================ 랭킹 (게임별) ========================== */
async function showRank(game) {
  RANK_GAME = game || 'rummikub'; setScreen('rank');
  const tab = (g, label) => `<button class="chip ${RANK_GAME === g ? 'is-active' : ''}" data-act="rankGame" data-game="${g}">${label}</button>`;
  const dn = (name, score, title, effect) => (typeof decoNameHTML === 'function') ? decoNameHTML(name, score, title, effect) : nameHTML(name, score);
  const medal = i => i < 3 ? ['🥇', '🥈', '🥉'][i] : (i + 1);
  let rowsHTML = '', myLine = '';
  if (RANK_GAME === 'total') {
    rowsHTML = (typeof totalRankHTML === 'function') ? await totalRankHTML() : '';
  } else {
    const list = await apiLeaderboard(RANK_GAME);
    const myIdx = list.findIndex(u => u.id === ME.id);
    if (myIdx >= 0) {
      const pct = Math.max(1, Math.round(((myIdx + 1) / list.length) * 100));
      myLine = `<div class="rank-me">📍 내 순위 <b>#${myIdx + 1}</b> · 상위 <b>${pct}%</b></div>`;
    }
    rowsHTML = list.map((u, i) => `<li class="board-rank__row ${u.id === ME.id ? 'is-me' : ''}">
          <span class="pos ${i < 3 ? 'pos--top' : ''}">${medal(i)}</span>
          <span>${dn(u.real_name, u.score, u.title, u.effect)}<small class="muted"> ${tierForScore(u.score).fullName}${u.streak >= 1 ? ' · 🔥' + u.streak : ''}</small></span>
          <span>${u.wins}승${u.losses}패</span>
          <span>${scoreTierHTML(RANK_GAME, u.score)}</span></li>`).join('') || '<li class="muted center" style="padding:20px">아직 기록이 없어요</li>';
  }
  app().innerHTML = `
    <section class="screen screen--rank">
      <header class="room__top"><button class="btn btn--ghost" data-act="backHome">← 홈</button><b style="margin-left:6px">🏆 랭킹</b><span class="spacer"></span></header>
      <nav class="game-select game-select--wrap">${tab('total', '🌐 통합')}${tab('rummikub', '루미큐브')}${tab('davinci', '다빈치 코드')}${tab('splendor', '스플랜더')}${tab('uno', '우노')}${tab('mafia', '마피아')}${tab('race', '운빨 대시')}${tab('hunt', '나도 사람이야')}</nav>
      ${myLine}
      <ol class="board-rank grow scrollable">${rowsHTML}</ol>
    </section>`;
}
function showTiers() {
  setScreen('rank');
  const score = (ME.display && ME.display.game && ME.games[ME.display.game]) ? ME.games[ME.display.game].score : 0;
  app().innerHTML = `
    <section class="screen">
      <header class="room__top"><button class="btn btn--ghost" data-act="backHome">← 홈</button><b style="margin-left:6px">🏅 티어</b><span class="spacer"></span></header>
      <div class="grow scrollable">${tierLadderHTML(ME.display && ME.display.game ? ME.display.game : 'rummikub')}</div>
    </section>`;
}
function showDeco() {
  setScreen('deco');
  app().innerHTML = `
    <section class="screen">
      <header class="room__top"><button class="btn btn--ghost" data-act="backHome">← 홈</button><b style="margin-left:6px">🎀 꾸미기</b><span class="spacer"></span></header>
      <div class="grow scrollable">${decoBody()}</div>
    </section>`;
}

/* ============================ 개발자 모드 ============================ */
const GNAME = g => (typeof GAME_NAME !== 'undefined' && GAME_NAME[g]) || (typeof GAME_SHORT !== 'undefined' && GAME_SHORT[g]) || g;
const DEV_GAMES = ['rummikub', 'davinci', 'splendor', 'uno', 'race', 'hunt', 'mafia'];
function showDev() {
  setScreen('rank');
  let body;
  if (!DEV_UNLOCKED) {
    body = `<div class="dev-pane">
      <p class="muted">관리자 비밀번호를 입력하세요.</p>
      <input class="input" id="dev_pw" type="password" placeholder="비밀번호" autocomplete="off" />
      <div class="auth__err" id="dev_err"></div>
      <button class="btn btn--primary btn--lg" data-act="devUnlock">확인</button>
    </div>`;
  } else {
    const tab = (k, l) => `<button class="chip ${DEV_TAB === k ? 'is-active' : ''}" data-act="devTab" data-tab="${k}">${l}</button>`;
    const tabs = `<div class="dev-tabs">${tab('rooms', '방 초기화')}${tab('users', '유저 스탯')}${tab('logs', '게임 로그')}${tab('notice', '공지')}</div>`;
    let pane = DEV_TAB === 'users' ? devUsersPane() : DEV_TAB === 'logs' ? devLogsPane() : DEV_TAB === 'notice' ? devNoticePane() : devRoomsPane();
    body = tabs + `<div class="dev-pane">${pane}</div>`;
  }
  app().innerHTML = `
    <section class="screen">
      <header class="room__top"><button class="btn btn--ghost" data-act="backHome">← 홈</button><b style="margin-left:6px">🛠 개발자 모드</b><span class="spacer"></span></header>
      <div class="grow scrollable">${body}</div>
    </section>`;
  if (DEV_UNLOCKED) { if (DEV_TAB === 'users') loadDevUsers(); else if (DEV_TAB === 'logs') loadDevLogs(); else if (DEV_TAB === 'notice') loadDevNotice(); }
}
function doDevUnlock() {
  const v = ($('#dev_pw') && $('#dev_pw').value) || '';
  const err = $('#dev_err');
  if (v === DEV_PW) { DEV_UNLOCKED = true; showDev(); }
  else if (err) { err.textContent = '비밀번호가 틀렸어요.'; }
}
/* --- 방 초기화 --- */
function devRoomsPane() {
  const chips = [];
  for (let n = 1; n <= 10; n++) chips.push(`<button class="chip ${DEV_SEL.has(n) ? 'is-active' : ''}" data-act="devToggle" data-room="${n}">방 ${n}${n <= 5 ? ' · 보드' : ' · 미니'}</button>`);
  return `<p class="muted">초기화할 방을 고르세요(여러 개 가능). 선택한 방의 <b>모든 인원을 홈으로</b> 보내고 게임을 강제 종료해 <b>빈 대기방</b>으로 만듭니다.</p>
    <p class="muted" style="font-size:12px">점수·연승·전적·티어는 <b>변하지 않습니다</b>.</p>
    <div class="dev-rooms">${chips.join('')}</div>
    <button class="btn btn--primary btn--lg" data-act="devReset" ${DEV_SEL.size ? '' : 'disabled'}>초기화 (${DEV_SEL.size}개)</button>`;
}
async function doDevReset() {
  await netCall(async () => {
    if (!DEV_SEL.size) return;
    const rooms = [...DEV_SEL].sort((a, b) => a - b);
    const n = await adminResetRooms(rooms);
    if (n == null) { toast('초기화 실패(관리자 계정 필요)'); return; }
    toast(rooms.length + '개 방 초기화 완료', true);
    DEV_SEL.clear(); showDev();
  });
}
/* --- 유저 스탯 --- */
function devUsersPane() {
  return `<div class="dev-row"><input class="input" id="devUserQ" placeholder="아이디/이름 검색" value="${esc(DEV_USER_Q)}"><button class="btn btn--ghost" data-act="devUserSearch">검색</button></div>
    <div id="devUsers" class="muted">불러오는 중…</div>`;
}
async function loadDevUsers() {
  const list = await adminUsers(DEV_USER_Q); const el = $('#devUsers'); if (!el) return;
  if (!list) { el.innerHTML = '<span class="muted">권한 없음(관리자 계정으로 로그인) 또는 오류</span>'; return; }
  DEV_USERS = list;
  if (!list.length) { el.innerHTML = '<span class="muted">유저 없음</span>'; return; }
  el.innerHTML = list.map(u => {
    const g = u.games || {}; const sum = Object.keys(g).map(k => `${GNAME(k)} ${g[k].score}`).join(' · ') || '기록 없음';
    return `<div class="dev-user"><div class="dev-user__i"><b>${esc(u.real_name)}</b> <span class="muted">@${esc(u.username)}</span>${u.is_admin ? ' 👑' : ''}<br><span class="muted" style="font-size:12px">${esc(sum)}</span></div>
      <button class="btn btn--ghost" data-act="devEditUser" data-uid="${u.id}">수정</button></div>`;
  }).join('');
}
function devEditUser(uid) {
  const u = (DEV_USERS || []).find(x => x.id === uid); if (!u) return;
  const rows = DEV_GAMES.map(g => `<div class="dev-row"><span class="dev-lab">${GNAME(g)}</span><input class="input" id="dsc_${g}" type="number" value="${(u.games && u.games[g]) ? u.games[g].score : 0}"><button class="btn btn--ghost" data-act="devSaveScore" data-uid="${uid}" data-game="${g}">저장</button></div>`).join('');
  openSheet(`<h3 class="sheet__title">${esc(u.real_name)} 수정</h3>
    <div class="dev-row"><span class="dev-lab">이름</span><input class="input" id="dnm" value="${esc(u.real_name)}"><button class="btn btn--primary" data-act="devSaveName" data-uid="${uid}">저장</button></div>
    <p class="muted" style="font-size:12px;margin:8px 0 2px">게임별 점수(0~15000)</p>${rows}
    <button class="btn btn--ghost btn--lg" data-act="closeSheet">닫기</button>`);
}
async function devSaveName(uid) {
  const v = ($('#dnm') && $('#dnm').value) || ''; const r = await adminSetName(uid, v);
  if (r && r.ok) { toast('이름 변경됨', true); loadDevUsers(); } else toast((r && r.error) ? '실패: ' + r.error : '실패');
}
async function devSaveScore(uid, game) {
  const v = Number(($('#dsc_' + game) && $('#dsc_' + game).value) || 0); const r = await adminSetScore(uid, game, v);
  if (r && r.ok) { toast(`${GNAME(game)} ${r.score}점`, true); loadDevUsers(); } else toast((r && r.error) ? '실패: ' + r.error : '실패');
}
/* --- 게임 로그 --- */
function devLogsPane() {
  const chip = (g, l) => `<button class="chip ${DEV_LOG_GAME === g ? 'is-active' : ''}" data-act="devLogGame" data-game="${g}">${l}</button>`;
  return `<div class="dev-tabs">${chip('', '전체')}${DEV_GAMES.map(g => chip(g, GNAME(g))).join('')}</div><div id="devLogs" class="muted">불러오는 중…</div>`;
}
async function loadDevLogs() {
  const list = await adminLogs(DEV_LOG_GAME || null, 80); const el = $('#devLogs'); if (!el) return;
  if (!list) { el.innerHTML = '<span class="muted">권한 없음 또는 오류</span>'; return; }
  if (!list.length) { el.innerHTML = '<span class="muted">로그 없음</span>'; return; }
  el.innerHTML = list.map(m => {
    const res = m.results || {}, nm = m.names || {};
    const parts = Object.keys(res).sort((a, b) => (res[a].rank || 9) - (res[b].rank || 9)).map(s => {
      const r = res[s], d = r.delta; return `${esc(nm[s] || ('좌석' + s))} ${d > 0 ? '+' + d : d}${r.won ? '🏆' : ''}`;
    }).join(', ');
    const t = new Date(m.at); const ts = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    return `<div class="dev-log"><span class="muted" style="font-size:12px">${ts} · ${GNAME(m.game)} ${m.n || ''}인</span><br>${parts}</div>`;
  }).join('');
}
/* --- 공지 --- */
function devNoticePane() {
  return `<p class="muted">공지 내용 + 노출 시간(분)을 정하면, 그 시간 동안 접속하는 모든 유저에게 공지창이 한 번 뜹니다.</p>
    <textarea class="input" id="devNoticeTxt" rows="4" placeholder="공지 내용"></textarea>
    <div class="dev-row"><span class="dev-lab">노출 시간(분)</span><input class="input" id="devNoticeMin" type="number" value="60" min="1"></div>
    <div id="devNoticeStat" class="muted" style="font-size:12px">상태 확인 중…</div>
    <button class="btn btn--primary btn--lg" data-act="devSaveNotice">공지 저장</button>
    <button class="btn btn--ghost btn--lg" data-act="devClearNotice">공지 내리기</button>`;
}
async function loadDevNotice() {
  const a = await getAnnouncement(); const el = $('#devNoticeStat'); if (!el) return;
  if (a && a.content) { el.innerHTML = `🟢 공지 노출 중 (만료: ${new Date(a.expires_at).toLocaleString()})`; const t = $('#devNoticeTxt'); if (t && !t.value) t.value = a.content; }
  else el.textContent = '⚪ 현재 노출 중인 공지 없음';
}
async function devSaveNotice() {
  const c = ($('#devNoticeTxt') && $('#devNoticeTxt').value) || ''; const m = Number(($('#devNoticeMin') && $('#devNoticeMin').value) || 60);
  if (!c.trim()) { toast('내용을 입력하세요'); return; }
  const r = await setAnnouncement(c, m);
  if (r && r.ok) { toast('공지 저장됨', true); loadDevNotice(); } else toast((r && r.error) ? '실패: ' + r.error : '실패');
}
async function devClearNotice() {
  const r = await setAnnouncement('', 0);
  if (r && r.ok) { toast('공지 내림', true); const t = $('#devNoticeTxt'); if (t) t.value = ''; loadDevNotice(); } else toast('실패');
}
/* --- 공지 팝업(전체 유저, 세션 1회) --- */
async function showAnnouncementIfAny() {
  if (_noticeShown) return;
  const a = await getAnnouncement();
  if (a && a.content) { _noticeShown = true; openSheet(`<h3 class="sheet__title">📢 공지</h3><p style="white-space:pre-wrap;line-height:1.6;padding:4px 6px">${esc(a.content)}</p><button class="btn btn--primary btn--lg" data-act="closeSheet">확인</button>`); }
}

/* ============================ 게임 규칙 ============================== */
const RULES_TEXT = {
  rummikub: `<ul>
    <li>타일: 1~13 숫자 × 4색 × 2벌 + 조커 2장. 각자 <b>14장</b>으로 시작.</li>
    <li>세트 2종 — <b>그룹</b>(같은 숫자, 서로 다른 색 3~4장) / <b>런</b>(같은 색, 연속 숫자 3장 이상). 조커는 빈 자리를 대신해요.</li>
    <li><b>첫 등록</b>은 새로 내려놓는 세트 합이 <b>30점 이상</b>이어야 해요. 등록 전에는 보드의 기존 세트를 건드릴 수 없어요.</li>
    <li>내 차례: 손패를 탭해 고르고 보드/＋새 세트에 탭해 놓기. 자유 재배치 후 <b>[내기]</b>. 낼 게 없으면 <b>[뽑기]</b>.</li>
    <li>제한시간 초과 시 자동 뽑기(준비된 배치가 유효하면 자동 제출돼요).</li>
    <li>먼저 손패를 모두 비우면 승리. 남은 손패가 적을수록 점수 유리. (2~4인)</li>
  </ul>`,
  davinci: `<ul>
    <li>타일: 검정 0~11 + 흰색 0~11 + <b>조커 2장</b>(검/흰, 표시 '–') = 총 26장. 손패는 <b>작은 수가 왼쪽</b>으로 정렬해 둬요. 숫자는 나만 보이고, 색(검/흰)은 모두에게 보여요.</li>
    <li>내 차례: ① 산더미가 남았으면 <b>반드시 1장 뽑고</b> ② 그 타일을 내 줄의 <b>정렬상 맞는 자리(＋)</b>에 끼워요 — 같은 숫자가 있으면 <b>앞/뒤 어디든</b>, <b>조커는 어디든</b> 놓을 수 있어요.</li>
    <li>③ 상대의 가린 타일 하나를 골라 <b>숫자(또는 조커)</b>를 추리해요. (색은 보이니 숫자만 맞히면 돼요.)</li>
    <li><b>맞으면</b> 공개되고, 계속 추리하거나 <b>멈춤</b>(이번에 끼운 타일을 가린 채 확정, 턴 종료) 선택.</li>
    <li><b>틀리면</b> 이번에 끼운 타일이 공개되고 턴이 끝나요(산더미가 비어 못 뽑았으면 내 가린 타일 1장 공개).</li>
    <li>내 타일이 전부 공개되면 탈락. <b>마지막 1명이 승리</b>. 타이머 없음. (2~8인)</li>
  </ul>`,
  race: `<ul>
    <li>모두 동시에 출발해 <b>먼저 결승선</b>에 닿으면 1등. (2~8인)</li>
    <li><b>갈림길</b>은 어디가 진짜 길인지 보이지 않아요. 막다른 길이면 조금 가다 막혀서 <b>되돌아와야</b> 해요(시간 손실).</li>
    <li><b>지름길 도박</b>: 짧지만 50% 확률로 막힌 길 vs 길지만 100% 뚫린 길 중 선택.</li>
    <li>중간중간 <b>작은 미로</b> 구간도 있어요.</li>
    <li>조작: 왼쪽 아래 조이스틱 이동 + 오른쪽 아래 <b>대시</b>(짧게 가속). 죽음·탈락은 없고 늦어질 뿐.</li>
  </ul>`,
  hunt: `<ul>
    <li>한 명이 <b>술래</b>, 나머지는 <b>숨은이</b>. 맵엔 똑같이 생긴 <b>AI 군중</b>이 잔뜩 돌아다녀요. (2~8인)</li>
    <li><b>숨은이</b>: 군중처럼 자연스럽게 움직여 들키지 않고 <b>제한시간까지 생존</b>하면 승리. (오른쪽 버튼=감정표현)</li>
    <li><b>술래</b>: 군중 속 진짜 사람을 찾아 <b>제거</b>. 단 <b>AI를 잘못 제거하면 패널티</b>(쿨다운↑). 시간 내 <b>전원 색출</b>하면 승리.</li>
    <li>조작: 왼쪽 아래 조이스틱 이동 + 오른쪽 아래 액션버튼.</li>
  </ul>`,
  splendor: `<ul>
    <li>보석 토큰 5색(다이아·사파이어·에메랄드·루비·오닉스) + <b>골드(만능)</b>. 색당 토큰은 인원수별로 <b>2인 4개 · 3인 5개 · 4인 7개</b>, 골드는 항상 5개. (2~4인)</li>
    <li>개발카드 <b>3단계(아래=1단계 저렴 ~ 위=3단계 고득점)</b>가 각 4장씩 공개돼요. 귀족 타일은 <b>인원+1</b>장 깔리고 각 <b>3점</b>.</li>
    <li>내 차례엔 <b>딱 한 가지</b>만: ① <b>서로 다른 색 3개</b> 가져오기 ② <b>같은 색 2개</b> 가져오기(그 색이 은행에 <b>4개 이상</b>일 때만) ③ 카드 <b>예약</b>(골드 1개 받음, 최대 3장) ④ 카드 <b>구매</b>.</li>
    <li>구매한 카드는 <b>영구 보너스</b>가 돼요 — 그 색 비용을 매번 1씩 깎아줘요. <b>골드</b>는 모자란 색을 대신 낼 수 있어요.</li>
    <li>턴이 끝날 때 토큰이 <b>10개를 넘으면</b> 초과분을 은행에 반납해요.</li>
    <li>내 카드 보너스가 어떤 귀족의 요구 색 개수를 채우면 그 <b>귀족이 자동으로 방문</b>(+3점).</li>
    <li><b>15점</b>에 먼저 도달하면 그 <b>라운드를 끝까지</b> 진행한 뒤 <b>최다 점수</b>가 승리. 동점이면 <b>구매한 카드가 적은</b> 쪽이 이겨요.</li>
  </ul>`,
  uno: `<ul>
    <li>108장: 4색(빨/노/초/파) × {0 한 장, 1~9 두 장, Skip·Reverse·DrawTwo 두 장} + Wild 4장 + Wild Draw Four 4장. 각자 <b>7장</b>으로 시작. (2~4인)</li>
    <li>맨 위 카드와 <b>색</b>·<b>숫자</b>·<b>기호</b> 중 하나가 맞는 카드, 또는 <b>Wild</b>를 내요. 와일드는 <b>색을 골라요</b>.</li>
    <li><b>Wild Draw Four</b>는 손에 <b>현재 색과 맞는 카드가 하나도 없을 때만</b> 낼 수 있어요.</li>
    <li>낼 카드가 없거나 안 내면 <b>1장 뽑기</b>. 뽑은 카드가 낼 수 있으면 <b>그 카드만</b> 즉시 낼 수 있고, 아니면 턴이 넘어가요.</li>
    <li><b>Skip</b>=다음 사람 스킵 · <b>Reverse</b>=방향 반전(2인=스킵) · <b>Draw Two</b>=다음이 2장 뽑고 스킵 · <b>Wild Draw Four</b>=다음이 4장 뽑고 스킵.</li>
    <li>손이 <b>1장</b>이 되면 <b>UNO 선언</b>! 선언 안 하면 상대가 <b>잡기</b>로 +2장 벌칙(다음 사람이 행동하기 전까지).</li>
    <li>먼저 손을 비우면 1등. 나머지는 <b>남은 손패 점수</b>가 적을수록 상위(숫자=숫자값, 기호=20, 와일드=50).</li>
  </ul>`,
  mafia: `<ul>
    <li>역할: <b>마피아 1</b> · <b>경찰 1</b> · <b>의사 1</b> · 나머지 <b>시민</b>. 내 역할은 나만 봐요(서버가 비밀 보관). (4~12인, 4명↑ 시작)</li>
    <li><b>밤</b>: 마피아는 한 명을 제거, 의사는 한 명을 살리고(자신 가능), 경찰은 한 명을 조사해 마피아 여부를 알아내요. 시민은 잠들어 기다려요.</li>
    <li>마피아와 의사가 <b>같은 사람</b>을 고르면 그 사람은 살아나요(사망자 없음).</li>
    <li><b>낮</b>: 누가 죽었는지 공개돼요. 다 함께 토론한 뒤 <b>투표</b>로 한 명을 처형해요(동률이면 처형 없음). 처형된 사람의 정체가 공개돼요.</li>
    <li><b>승리</b>: 마피아를 모두 처형하면 <b>시민 승</b>. 마피아 수가 시민 수 이상이 되면 <b>마피아 승</b>.</li>
    <li>시스템이 사회자 역할을 해요. 제한시간이 지나면 자동으로 다음 단계로 넘어가요.</li>
  </ul>`,
};
function rulesBody(game) {
  game = game || 'rummikub';
  const chip = k => `<button class="chip ${game === k ? 'is-active' : ''}" data-act="rulesGame" data-game="${k}">${GAME_LOGO[k]} ${GAME_SHORT[k]}</button>`;
  return `<div class="rules">
    <div class="game-select rules__pick">${['rummikub', 'davinci', 'splendor', 'uno', 'mafia', 'race', 'hunt'].map(chip).join('')}</div>
    <h3 class="rules__title" style="--tc:${tierForScore(0).color}">${GAME_LOGO[game]} ${GAME_NAME[game]}</h3>
    <div class="rules__body">${RULES_TEXT[game]}</div>
  </div>`;
}
function showRules(game) {
  RULES_GAME = game || RULES_GAME || 'rummikub'; setScreen('rank');
  app().innerHTML = `
    <section class="screen">
      <header class="room__top"><button class="btn btn--ghost" data-act="backHome">← 홈</button><b style="margin-left:6px">📖 게임 규칙</b><span class="spacer"></span></header>
      <div class="grow scrollable">${rulesBody(RULES_GAME)}</div>
    </section>`;
}

window.addEventListener('DOMContentLoaded', boot);
