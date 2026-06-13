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

function curGame() { return ROOM ? ROOM.game : null; }
function capOf(game) { return game === 'rummikub' ? 4 : 8; }   // 루미=4인, 나머지=8인
function statsOf(uid) { return lbCache[uid] || {}; }

/* ----------------------------- 부팅 ----------------------------------- */
async function boot() {
  if (!configReady()) { app().innerHTML = `<div class="screen center" style="justify-content:center"><h2>설정 필요</h2><p class="muted">config.js / supabase_setup.sql 을 확인하세요.</p></div>`; return; }
  initSupabase();
  syncServerTime();
  bindAppInput(handleAct, () => {}, () => false);
  app().addEventListener('pointerdown', rkPointerDown);   // 루미큐브 타일 드래그
  if (TOKEN) { ME = await apiMe(TOKEN); if (ME) TOKEN = ME.token; }
  if (ME) goHome(); else showLogin();
}

/* ----------------------------- 액션 위임 ------------------------------- */
function handleAct(act, el) {
  if (act.indexOf('dv_') === 0) { davinciAct(act, el); return; }   // 다빈치 코드 액션 위임
  switch (act) {
    case 'authTab': switchAuthTab(el.dataset.tab); break;
    case 'authSubmit': doAuth(); break;
    case 'logout': doLogout(); break;
    case 'goBoard': goLobby('board'); break;
    case 'goMini': goLobby('mini'); break;
    case 'backHome': goHome(); break;
    case 'goRank': showRank(RANK_GAME); break;
    case 'goTiers': showTiers(); break;
    case 'goRules': showRules(RULES_GAME); break;
    case 'rulesGame': RULES_GAME = el.dataset.game; if (SCREEN === 'room') renderWaiting(); else showRules(RULES_GAME); break;
    case 'rankGame': RANK_GAME = el.dataset.game; showRank(RANK_GAME); break;
    case 'enterRoom': enterRoomFlow(Number(el.dataset.room)); break;
    case 'waitTab': WAIT_TAB = el.dataset.tab; renderWaiting(); break;
    case 'setDisplay': doSetDisplay(el.dataset.dg || null); break;
    case 'sit': doSit(Number(el.dataset.seat)); break;
    case 'spectate': doSpectate(); break;
    case 'unseat': netCall(() => unseat(ROOM_ID, ME)); break;
    case 'setTime': doSetTime(Number(el.dataset.sec)); break;
    case 'setGame': doSetGame(el.dataset.game); break;
    case 'start': doStart(); break;
    case 'leave': doLeave(); break;
    case 'again': netCall(() => resetRoomToWaiting(ROOM_ID)); break;
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
  if (!u || !p || (authTab === 'signup' && !nm)) { err.textContent = '모든 칸을 채워주세요.'; return; }
  if (authTab === 'signup' && !/^[가-힣]{1,10}$/.test(nm)) { err.textContent = '본명은 한글로 1~10자 입력하세요.'; return; }
  err.textContent = '처리 중…';
  const res = authTab === 'login' ? await apiLogin(u, p) : await apiSignup(u, p, nm);
  if (res.error) { err.textContent = res.error; return; }
  ME = res.profile; TOKEN = ME.token; localStorage.setItem('rk_token', TOKEN);
  goHome();
}
function doLogout() { localStorage.removeItem('rk_token'); TOKEN = null; ME = null; cleanupAll(); showLogin(); }

/* ============================ 홈 ====================================== */
function headerHTML() {
  const dg = ME.display && ME.display.game ? ME.display.game : null;
  const dscore = ME.display ? ME.display.score : 0;
  return `<span class="lobby__hello">${nameHTML(ME.real_name, dg ? dscore : null)}
    <small>${dg ? decoChipHTML(dg, dscore) : '<span class="muted">티어 숨김</span>'}</small></span>`;
}
function goHome() {
  cleanupRoom(); cleanupLobby(); ROOM_ID = null; setScreen('home');
  app().innerHTML = `
    <section class="screen screen--home">
      <header class="lobby__top">
        ${headerHTML()}<span class="spacer"></span>
        <button class="btn btn--ghost" data-act="goRules">규칙</button>
        <button class="btn btn--ghost" data-act="goTiers">티어</button>
        <button class="btn btn--ghost" data-act="goRank">랭킹</button>
        <button class="btn btn--ghost" data-act="logout">로그아웃</button>
      </header>
      <div class="home-cards grow">
        <button class="home-card home-card--rk" data-act="goBoard">
          <span class="home-card__emoji">🎲</span><span class="home-card__title">보드게임</span>
          <span class="home-card__sub">방 1~5 · 루미큐브 / 다빈치 코드</span></button>
        <button class="home-card home-card--mini" data-act="goMini">
          <span class="home-card__emoji">🎮</span><span class="home-card__title">미니게임</span>
          <span class="home-card__sub">방 6~10 · 운빨 대시 / 나도 사람이야</span></button>
      </div>
      <p class="muted center" style="padding:10px 14px">로그인 후 게임을 고르세요. 티어·전적·꾸미기는 게임별로 따로 쌓여요.</p>
    </section>`;
  apiMe(TOKEN).then(p => { if (p) { ME = p; TOKEN = p.token; if (SCREEN === 'home') { const h = document.querySelector('.screen--home .lobby__hello'); if (h) h.outerHTML = headerHTML(); } } });
}

/* ============================ 로비 ==================================== */
function cleanupLobby() { if (lobbyCh) { leaveChannel(lobbyCh); lobbyCh = null; } }
function cleanupRoom() {
  stopTimer(); miniStop(); davinciStop();
  if (roomDbCh) { leaveChannel(roomDbCh); roomDbCh = null; }
  if (presenceCh) { leaveChannel(presenceCh); presenceCh = null; }
  if (hbIv) { clearInterval(hbIv); hbIv = null; }
  if (rkBc) { leaveChannel(rkBc.ch); rkBc = null; }
  presentIds = []; ROOM = null; G = null; work = null; liveBoard = null; lastRoomSig = '';
}
function cleanupAll() { cleanupLobby(); cleanupRoom(); ROOM_ID = null; }

async function goLobby(mode) {
  MODE = mode; cleanupRoom(); ROOM_ID = null; setScreen('lobby');
  if (!lobbyCh) lobbyCh = subscribeLobby(() => scheduleLobbyRefresh());
  await refreshLobby();
  apiMe(TOKEN).then(p => { if (p) { ME = p; TOKEN = p.token; } });
}
let _reapAt = 0;
async function refreshLobby() {
  if (SCREEN !== 'lobby') return;
  const lo = MODE === 'mini' ? 6 : 1, hi = MODE === 'mini' ? 10 : 5;
  const [rooms, members] = await Promise.all([fetchRooms(), fetchAllMembers()]);
  const seatCount = {};
  members.forEach(m => { if (m.seat != null && m.role === 'player') seatCount[m.room_id] = (seatCount[m.room_id] || 0) + 1; });
  // 보이는 방들 유령정리(throttle)
  if (Date.now() - _reapAt > 4000) {
    _reapAt = Date.now();
    rooms.filter(r => r.id >= lo && r.id <= hi).forEach(r => { reapStale(r.id); });
  }
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
          const cap = r.game ? capOf(r.game) : 8;
          const gname = r.game ? GAME_NAME[r.game] : '게임 선택 전';
          return `<li class="room-card ${playing ? 'is-playing' : ''}" data-act="enterRoom" data-room="${r.id}">
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
    await enterRoom(roomId, ME, room0 ? room0.game : null);
    mySnapGame = (room0 && room0.game) || null;
    await refreshLbCache(true);
    roomDbCh = subscribeRoom(roomId, () => scheduleRoomRefresh());
    presenceCh = joinPresence(roomId, ME, { name: ME.real_name }, onPresence);
    hbIv = setInterval(() => heartbeat(ME.token, roomId), 4000);
    WAIT_TAB = 'seat';
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
  ROOM = await fetchRoom(ROOM_ID);
  MEMBERS = await fetchMembers(ROOM_ID);
  if (!ROOM) { goLobby(MODE); return; }
  // 내 표시 스냅샷이 방 게임과 어긋나면 갱신(미니 방장이 게임 고른 경우)
  const g = curGame();
  if (g && g !== mySnapGame && MEMBERS.some(m => m.user_id === ME.id)) { mySnapGame = g; updateMemberSnapshot(ROOM_ID, ME, g); }

  if (ROOM.status === 'waiting') {
    stopTimer(); miniStop(); davinciStop();
    await refreshLbCache();
    renderWaiting();
  } else if (ROOM.status === 'playing') {
    if (ROOM.game === 'rummikub') enterGameView();
    else if (ROOM.game === 'davinci') enterDavinciView();
    else enterMiniView();
  } else if (ROOM.status === 'finished') {
    stopTimer(); miniStop(); davinciStop();
    renderResult();
  }
}

/* presence: 떠난 멤버 즉시정리 보조 + 방장 승격 (대기 중에만) */
async function onPresence(state) {
  presentIds = Object.keys(state || {});
  if (!ROOM || ROOM.status !== 'waiting' || !MEMBERS.length) return;
  const earliest = MEMBERS.slice().sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at));
  const janitor = earliest.find(m => presentIds.includes(m.user_id));
  if (!janitor || janitor.user_id !== ME.id) return;
  const absent = MEMBERS.filter(m => !presentIds.includes(m.user_id));
  for (const m of absent) await deleteMember(ROOM_ID, m.user_id);
  if (ROOM.host_id && !presentIds.includes(ROOM.host_id)) {
    const next = earliest.find(m => presentIds.includes(m.user_id));
    if (next) await promoteHost(ROOM_ID, ROOM.host_id, next.user_id);
  }
  if (absent.length) refreshRoom();
}
// 타임아웃 대리자: 접속 중 최저좌석(현재 차례 제외) 1명
function timeoutActorId() {
  if (!G || !G.players) return null;
  const curUid = G.players[G.turn];
  const seated = MEMBERS.filter(m => m.seat != null && presentIds.includes(m.user_id) && m.user_id !== curUid).sort((a, b) => a.seat - b.seat);
  return seated.length ? seated[0].user_id : null;
}

/* ----------------------------- 대기실(탭) ----------------------------- */
function renderWaiting() {
  const amHost = ROOM.host_id === ME.id;
  const g = curGame();
  const cap = g ? capOf(g) : 8;
  setScreen('room');
  const tabBtn = (k, label) => `<button class="tab ${WAIT_TAB === k ? 'is-active' : ''}" data-act="waitTab" data-tab="${k}">${label}</button>`;
  app().innerHTML = `
    <section class="screen screen--room">
      <header class="room__top">
        <button class="btn btn--ghost" data-act="leave">← 나가기</button>
        <b style="margin-left:6px">방 ${ROOM_ID}</b>
        <span class="muted"> · ${g ? GAME_NAME[g] : '게임 선택 전'}</span>
        <span class="spacer"></span>
        <span class="muted">${MEMBERS.filter(m => m.seat != null).length}/${cap}</span>
      </header>
      <nav class="tabbar">${tabBtn('seat', '좌석')}${tabBtn('tier', '티어표')}${tabBtn('deco', '꾸미기')}${tabBtn('rules', '규칙')}</nav>
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
      const sc = st.score ?? m.score ?? 0, wn = st.wins ?? m.wins ?? 0, ls = st.losses ?? m.losses ?? 0, sk = st.streak ?? m.streak ?? 0;
      const isMe = m.user_id === ME.id;
      const nameColor = m.display_game ? m.display_score : null;   // 이름색 = 꾸미기 표시게임
      seats.push(`<li class="seat is-occupied ${isMe ? 'is-me' : ''}" data-seat="${n}">
        <span class="seat__no">${n}</span>
        <span class="seat__main">
          <span class="seat__name">${nameHTML(m.name, nameColor)}${isMe ? ' <small>(나)</small>' : ''}${ROOM.host_id === m.user_id ? ' <span class="seat__badge">방장</span>' : ''}${m.display_game ? ' ' + decoChipHTML(m.display_game, m.display_score) : ''}</span>
          <span class="seat__record">${wn}승 ${ls}패 · ${tierBadgeHTML(sc)} ${streakHTML(sk)}</span>
        </span></li>`);
    } else {
      const canSit = !mySeatNow && !iAmSpectator;
      seats.push(`<li class="seat is-empty" ${canSit ? `data-act="sit" data-seat="${n}"` : ''}>＋ ${n}번 ${canSit ? '앉기' : ''}</li>`);
    }
  }
  let host = '';
  if (amHost) {
    const picks = MODE === 'mini'
      ? [['race', '🏁 운빨 대시'], ['hunt', '🕵️ 나도 사람이야']]
      : [['rummikub', '🀄 루미큐브'], ['davinci', '🔢 다빈치 코드']];
    const gamePick = `<div class="game-select">${picks.map(([k, lab]) =>
      `<button class="chip ${ROOM.game === k ? 'is-active' : ''}" data-act="setGame" data-game="${k}">${lab}</button>`).join('')}</div>`;
    const timeSel = ROOM.game === 'rummikub'   // 타이머 선택은 루미큐브만
      ? `<div class="time-select">${[15, 30, 60].map(s => `<button class="chip ${ROOM.turn_seconds === s ? 'is-active' : ''}" data-act="setTime" data-sec="${s}">${s}초</button>`).join('')}</div>`
      : '';
    const canStart = !!ROOM.game && seated >= 2 && seated <= cap;
    host = `<div class="host-controls">
        ${gamePick}${timeSel}
        <button class="btn btn--primary btn--lg" data-act="start" ${canStart ? '' : 'disabled'}>${ROOM.game ? `게임 시작 (2~${cap}명)` : '게임을 먼저 고르세요'}</button>
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
      <span>${label}</span>${val ? decoChipHTML(val, score) : '<span class="muted">아무것도 안 보임</span>'}</button>`;
  };
  const preview = cur ? `${nameHTML(ME.real_name, ME.display.score)} ${decoChipHTML(cur, ME.display.score)}` : `${nameHTML(ME.real_name, null)} <span class="muted">(숨김)</span>`;
  return `<div class="deco">
    <p class="muted">점수 아래·이름 옆에 보일 티어를 고르세요. 이름 색도 이 티어색이 돼요.</p>
    <div class="deco-preview">미리보기: ${preview}</div>
    ${opt('', '숨김')}${opt('rummikub', '루미큐브')}${opt('davinci', '다빈치 코드')}${opt('race', '운빨 대시')}${opt('hunt', '나도 사람이야')}
  </div>`;
}
function tierLadderHTML(g) {
  const score = (g && ME.games && ME.games[g]) ? ME.games[g].score : 0;
  const cur = tierForScore(score);
  return `<div class="tier-list-wrap">
    <div class="center" style="padding:8px">${g ? GAME_NAME[g] : '내'} 티어: ${tierBadgeHTML(score)} <span class="muted">(${score}점)</span></div>
    <ul class="tier-list">
      ${TIER_LADDER.slice().reverse().map(t => {
        const full = t.division ? `${t.name} ${ROMAN[t.division]}` : t.name;
        return `<li class="tier-row ${t.level === cur.level ? 'is-cur' : ''}" style="--tc:${t.color}"><span class="tg">${t.logo}</span><span class="tier-row__name">${full}</span><span class="tier-row__cut">${t.min}점 +</span></li>`;
      }).join('')}
    </ul>
    <div class="muted center" style="padding:10px;font-size:12px;line-height:1.6">
      점수는 <b>얼마나 크게 이겼/졌는지</b>로 변동. 고티어일수록 적게 오르고 많이 내려가요(1등/승리는 항상 +).<br>
      연승 보너스: 다이아 이하 2연승부터. 게임마다 티어가 따로 쌓여요.
    </div></div>`;
}
async function doSit(seat) {
  await netCall(async () => {
    const r = await takeSeat(ROOM_ID, ME, seat);
    if (!r.ok) {
      if (r.reason === 'taken') { toast('이미 찬 자리예요'); await reapStale(ROOM_ID); }
      else if (r.reason === 'not_waiting') toast('이미 게임이 시작됐어요');
      else toast('자리 선택 실패, 다시 시도하세요');
    }
    await refreshRoom();
  });
}
async function doSpectate() { await netCall(async () => { await spectate(ROOM_ID, ME); await refreshRoom(); }); }
async function doSetTime(sec) { await netCall(() => setTurnSeconds(ROOM_ID, sec)); }
async function doSetGame(game) { await netCall(async () => { await setRoomGame(ROOM_ID, game); await refreshRoom(); }); }
async function doLeave() { await netCall(() => leaveRoom(ROOM_ID, ME)); goLobby(MODE); }
async function doSetDisplay(game) {
  await netCall(async () => {
    const r = await apiSetDisplay(TOKEN, game || null);
    if (r.error) { toast(r.error); return; }
    ME.display = r.display; ME.display_game = r.display.game;
    if (ROOM_ID != null) await updateMemberSnapshot(ROOM_ID, ME, curGame() || 'rummikub');
    if (SCREEN === 'room') renderWaiting(); else if (SCREEN === 'home') goHome();
  });
}
async function doStart() {
  await netCall(async () => {
    const game = ROOM.game;
    if (!game) { toast('게임을 먼저 고르세요'); return; }
    const seated = MEMBERS.filter(m => m.seat != null).sort((a, b) => a.seat - b.seat);
    const cap = capOf(game);
    if (seated.length < 2 || seated.length > cap) { toast(`2~${cap}명이 앉아야 시작`); return; }
    const seatNums = seated.map(m => m.seat);
    const scoresMap = {}; seated.forEach(m => { scoresMap[m.seat] = (lbCache[m.user_id] && lbCache[m.user_id].score) ?? m.score ?? 0; });
    let st;
    if (game === 'rummikub') {
      st = dealNewGame(seatNums);
      st.game = 'rummikub'; st.players = {}; st.names = {}; st.scores = {};
      seated.forEach(m => { st.players[m.seat] = m.user_id; st.names[m.seat] = m.name; st.scores[m.seat] = scoresMap[m.seat]; });
      st.n = seated.length; st.passStreak = 0; st.results = null;
    } else if (game === 'davinci') {
      st = davinciInitialState(seated.map(m => ({ seat: m.seat, user_id: m.user_id, name: m.name })), scoresMap);
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
    await startGame(ROOM_ID, st);
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
      <span class="oppo__name tier-name" style="--tc:${t.color}">${t.logo}${esc(G.names[s])}</span><span class="oppo__count">${cnt}</span></li>`;
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
          <svg class="timer__ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="none" stroke="#2a3140" stroke-width="3"/><circle class="timer__fill" cx="18" cy="18" r="16" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-dasharray="100.5" stroke-dashoffset="0"/></svg>
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
  oppoSeats.concat(mySeat ? [mySeat] : []).forEach(s => { if ((G.hands[s] || []).length === 1) flashBanner('1장!'); });
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
function startTimer() { if (timerIv) return; timerIv = setInterval(tick, 250); }
function stopTimer() { if (timerIv) { clearInterval(timerIv); timerIv = null; } lastAutoKey = null; }
function tick() {
  if (!ROOM || ROOM.status !== 'playing' || ROOM.game !== 'rummikub' || !ROOM.turn_started_at || !G) return;
  const startMs = new Date(ROOM.turn_started_at).getTime();
  const lim = ROOM.turn_seconds || 30;
  const rem = lim - (serverNow() - startMs) / 1000;
  updateTimerUI(rem, lim);
  const key = ROOM.version + '|' + G.turn;
  if (rem <= 0 && isMyTurn() && lastAutoKey !== key) { lastAutoKey = key; autoTimeout(mySeat); }
  else if (rem < -4 && !isMyTurn() && lastAutoKey !== key && timeoutActorId() === ME.id) { lastAutoKey = key; autoTimeout(Number(G.turn)); }
}
function updateTimerUI(rem, lim) {
  const numEl = $('[data-role="timerNum"]'), tEl = $('[data-role="timer"]'), fill = $('.timer__fill');
  if (!numEl || !tEl) return;
  if (rem == null) { if (ROOM && ROOM.turn_started_at) { rem = (ROOM.turn_seconds || 30) - (serverNow() - new Date(ROOM.turn_started_at).getTime()) / 1000; lim = ROOM.turn_seconds || 30; } else { numEl.textContent = '–'; return; } }
  const r = Math.max(0, rem);
  numEl.textContent = Math.ceil(r);
  if (fill) { const C = 100.5; fill.style.strokeDashoffset = (C * (1 - r / lim)).toFixed(1); }
  const state = r > 10 ? 'normal' : r > 5 ? 'warn' : 'danger';
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
  const game = G.game || ROOM.game || 'rummikub';
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
          const rec = (r.wins != null) ? `${r.wins}승 ${r.losses}패` : '';
          return `<li class="rank-row ${r.won ? 'is-winner' : ''}">
            <span class="rank-row__place">${place}</span>
            <div class="rr">
              <div class="rr__l1"><span class="rr__name">${nameHTML(G.names[r.seat], r.newScore)}${r.won ? ' 🏆' : ''}${tag}</span>
                <span class="rank-row__delta ${r.delta >= 0 ? 'delta--up' : 'delta--down'}">${r.delta >= 0 ? '+' : ''}${r.delta}${r.bonus > 0 ? ` <small>🔥+${r.bonus}</small>` : ''}</span></div>
              <div class="rr__l2"><span class="rr__sc">${r.prevScore || 0} → <b>${r.newScore || 0}</b></span> ${tierBadgeHTML(r.newScore)} ${chg}</div>
              <div class="rr__l3 muted">${GAME_SHORT[game] || ''} ${rec} · 연승 ${streakChangeHTML(r.prevStreak, r.streak)}</div>
            </div>
          </li>`;
        }).join('')}
      </ol>
      <div class="room__actions">
        ${amHost ? `<button class="btn btn--primary btn--lg" data-act="again">다시 하기</button>` : `<div class="muted center">방장이 '다시 하기'를 누르면 새 게임이 시작돼요</div>`}
        <button class="btn btn--ghost btn--lg" data-act="leave">로비로 나가기</button>
      </div>
    </section>`;
  if (anyWin) { const w = document.createElement('div'); w.className = 'win-burst'; w.textContent = '🎉'; document.body.appendChild(w); setTimeout(() => w.remove(), 1500); }
  apiMe(TOKEN).then(p => { if (p) { ME = p; TOKEN = p.token; } });
}

/* ============================ 랭킹 (게임별) ========================== */
async function showRank(game) {
  RANK_GAME = game || 'rummikub'; setScreen('rank');
  const list = await apiLeaderboard(RANK_GAME);
  const tab = (g, label) => `<button class="chip ${RANK_GAME === g ? 'is-active' : ''}" data-act="rankGame" data-game="${g}">${label}</button>`;
  app().innerHTML = `
    <section class="screen screen--rank">
      <header class="room__top"><button class="btn btn--ghost" data-act="backHome">← 홈</button><b style="margin-left:6px">🏆 랭킹</b><span class="spacer"></span></header>
      <nav class="game-select">${tab('rummikub', '루미큐브')}${tab('davinci', '다빈치 코드')}${tab('race', '운빨 대시')}${tab('hunt', '나도 사람이야')}</nav>
      <ol class="board-rank grow scrollable">
        ${list.map((u, i) => `<li class="board-rank__row ${u.id === ME.id ? 'is-me' : ''}">
          <span class="pos">${i + 1}</span>
          <span>${nameHTML(u.real_name, u.score)}<small class="muted"> ${tierForScore(u.score).fullName}${u.streak >= 1 ? ' · 🔥' + u.streak : ''}</small></span>
          <span>${u.wins}승${u.losses}패</span>
          <span>${scoreTierHTML(u.score)}</span></li>`).join('') || '<li class="muted center" style="padding:20px">아직 기록이 없어요</li>'}
      </ol>
    </section>`;
}
function showTiers() {
  setScreen('rank');
  const score = (ME.display && ME.display.game && ME.games[ME.display.game]) ? ME.games[ME.display.game].score : 0;
  app().innerHTML = `
    <section class="screen">
      <header class="room__top"><button class="btn btn--ghost" data-act="backHome">← 홈</button><b style="margin-left:6px">🏅 티어</b><span class="spacer"></span></header>
      <div class="grow scrollable">${tierLadderHTML(ME.display && ME.display.game ? ME.display.game : null)}</div>
    </section>`;
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
    <li>타일: 검정 0~11 + 흰색 0~11 (총 24장). 내 타일은 <b>작은 수가 왼쪽</b>, 같은 숫자면 <b>검정이 흰색보다 왼쪽</b>으로 정렬돼요. 숫자는 나만 보여요.</li>
    <li>내 차례: ① 산더미에서 1장 뽑고(숨김) ② 상대의 가려진 타일 하나를 골라 <b>숫자+색</b>을 추리.</li>
    <li><b>맞으면</b> 그 타일이 공개되고, 계속 추리하거나 멈출 수 있어요(멈추면 뽑은 타일을 가린 채 손에 넣고 턴 종료).</li>
    <li><b>틀리면</b> 내가 뽑은 타일이 공개되어 손에 들어가고 턴이 끝나요.</li>
    <li>내 타일이 전부 공개되면 탈락. <b>마지막까지 살아남는 1명이 승리</b>. 타이머 없음. (2~8인)</li>
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
};
function rulesBody(game) {
  game = game || 'rummikub';
  const chip = k => `<button class="chip ${game === k ? 'is-active' : ''}" data-act="rulesGame" data-game="${k}">${GAME_LOGO[k]} ${GAME_SHORT[k]}</button>`;
  return `<div class="rules">
    <div class="game-select rules__pick">${['rummikub', 'davinci', 'race', 'hunt'].map(chip).join('')}</div>
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
