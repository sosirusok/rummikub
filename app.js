/* =========================================================================
   app.js — 화면 라우팅 / 인증 / 로비 / 대기실 / 게임(탭 조작) / 결과 / 랭킹
   ========================================================================= */

const $ = s => document.querySelector(s);
const app = () => $('#app');
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function setScreen(name){ app().dataset.screen = name; SCREEN = name; }

/* ---- 티어/연승 표시 헬퍼 ---- */
function nameHTML(name, score){ const t = tierForScore(score || 0); return `<span class="tier-name" style="--tc:${t.color}">${esc(name)}</span>`; }
function scoreTierHTML(score){ const t = tierForScore(score || 0); return `<span class="score-tier" style="--tc:${t.color}"><span class="tg">${t.logo}</span><b>${score || 0}</b><span class="tg">${t.logo}</span></span>`; }
function tierBadgeHTML(score){ const t = tierForScore(score || 0); return `<span class="tier-badge" style="--tc:${t.color}">${t.logo} ${t.fullName}</span>`; }
function streakHTML(streak){ return streak >= 1 ? `<span class="streak">🔥 ${streak}연승</span>` : ''; }

/* ----------------------------- 상태 ----------------------------------- */
let SCREEN = 'login';
let TOKEN = localStorage.getItem('rk_token') || null;
let ME = null;                 // {id, username, real_name, score, wins, losses}

let ROOM_ID = null, ROOM = null, MEMBERS = [];
let lobbyCh = null, roomDbCh = null, presenceCh = null;
let presentIds = [];

let G = null;                  // game state
let mySeat = null, amSpectator = false;
let work = null, turnStart = null, turnStartBoardSet = new Set();
let selection = { source: null, ids: [] };
let undoStack = [];
let busy = false;
let prevTurn = null;
let timerIv = null, lastAutoKey = null, lastDanger = false;
let lbCache = {};              // user_id -> {score,wins,losses,streak,real_name} (랭킹 캐시)
let WB_OPTS = { lives: 3, dueum: false };   // 말잇폭 방장 옵션(로컬)

/* ----------------------------- 부팅 ----------------------------------- */
async function boot(){
  if(!configReady()){ app().innerHTML = `<div class="screen center" style="justify-content:center"><h2>설정 필요</h2><p class="muted">config.js / supabase_setup.sql 을 확인하세요.</p></div>`; return; }
  initSupabase();
  syncServerTime();
  app().addEventListener('click', onClick);
  if(TOKEN){ ME = await apiMe(TOKEN); }
  if(ME) goLobby(); else showLogin();
}

/* ----------------------------- 클릭 위임 ------------------------------- */
function onClick(e){
  const actEl = e.target.closest('[data-act]');
  if(actEl){ handleAct(actEl.dataset.act, actEl, e); return; }
  const tapEl = e.target.closest('[data-tap]');
  if(tapEl && SCREEN==='game' && !amSpectator) handleTap(tapEl);
}

function handleAct(act, el){
  switch(act){
    case 'authTab': switchAuthTab(el.dataset.tab); break;
    case 'authSubmit': doAuth(); break;
    case 'logout': doLogout(); break;
    case 'goRank': showRank(); break;
    case 'goTiers': showTiers(); break;
    case 'backLobby': goLobby(); break;
    case 'enterRoom': enterRoomFlow(Number(el.dataset.room)); break;
    case 'sit': doSit(Number(el.dataset.seat)); break;
    case 'spectate': doSpectate(); break;
    case 'unseat': netCall(()=>unseat(ROOM_ID, ME)); break;
    case 'setTime': doSetTime(Number(el.dataset.sec)); break;
    case 'setGame': netCall(()=>setRoomGame(ROOM_ID, el.dataset.game)); break;
    case 'setLives': WB_OPTS.lives = Number(el.dataset.lives); renderWaiting(); break;
    case 'setDueum': WB_OPTS.dueum = !WB_OPTS.dueum; renderWaiting(); break;
    case 'submitWord': onSubmitWord(); break;
    case 'start': doStart(); break;
    case 'leave': doLeave(); break;
    case 'again': netCall(()=>resetRoomToWaiting(ROOM_ID)); break;
    case 'submit': onSubmit(); break;
    case 'draw': onDraw(); break;
    case 'undo': doUndo(); break;
    case 'reset': doReset(); break;
    case 'sort': doSort(el.dataset.key); break;
    case 'tidy': doSort(localStorage.getItem('rk_sort')||'num'); break;
    case 'hint': toggleHint(); break;
    case 'peek': openPeek(Number(el.dataset.seat)); break;
    case 'closeSheet': closePeek(); break;
  }
}
async function netCall(fn){ if(busy) return; busy=true; try{ await fn(); }finally{ busy=false; } }

/* ============================ 로그인 ================================== */
let authTab = 'login';
function showLogin(){
  cleanupAll();
  setScreen('login');
  app().innerHTML = `
    <section class="screen screen--login">
      <div class="auth">
        <div class="auth__logo">🀄 루미큐브<small>친구들과 실시간 대결</small></div>
        <div class="auth__tabs">
          <button class="btn ${authTab==='login'?'is-active':''}" data-act="authTab" data-tab="login">로그인</button>
          <button class="btn ${authTab==='signup'?'is-active':''}" data-act="authTab" data-tab="signup">회원가입</button>
        </div>
        <div class="auth__form">
          <input class="input" id="f_user" placeholder="아이디 (2~20자)" autocomplete="username" />
          <input class="input" id="f_pw" type="password" placeholder="비밀번호 (4자 이상)" autocomplete="current-password" />
          ${authTab==='signup'?`<input class="input" id="f_name" placeholder="본명 (한글)" />`:''}
          <div class="auth__err" id="f_err"></div>
          <button class="btn btn--primary btn--lg" data-act="authSubmit">${authTab==='login'?'로그인':'회원가입 후 시작'}</button>
        </div>
      </div>
    </section>`;
}
function switchAuthTab(tab){ authTab = tab; const e=$('#f_err'); showLogin(); }
async function doAuth(){
  const u = ($('#f_user').value||'').trim();
  const p = $('#f_pw').value||'';
  const nm = $('#f_name') ? ($('#f_name').value||'').trim() : '';
  const err = $('#f_err');
  if(!u || !p || (authTab==='signup' && !nm)){ err.textContent='모든 칸을 채워주세요.'; return; }
  if(authTab==='signup' && !/^[가-힣]{1,10}$/.test(nm)){ err.textContent='본명은 한글로 1~10자 입력하세요.'; return; }
  err.textContent = '처리 중…';
  const res = authTab==='login' ? await apiLogin(u,p) : await apiSignup(u,p,nm);
  if(res.error){ err.textContent = res.error; return; }
  ME = res.profile; TOKEN = res.profile.token; localStorage.setItem('rk_token', TOKEN);
  goLobby();
}
function doLogout(){ localStorage.removeItem('rk_token'); TOKEN=null; ME=null; cleanupAll(); showLogin(); }

/* ============================ 로비 ==================================== */
function cleanupLobby(){ if(lobbyCh){ leaveChannel(lobbyCh); lobbyCh=null; } }
function cleanupRoom(){ stopTimer(); if(roomDbCh){ leaveChannel(roomDbCh); roomDbCh=null; } if(presenceCh){ leaveChannel(presenceCh); presenceCh=null; } presentIds=[]; ROOM=null; G=null; work=null; }
function cleanupAll(){ cleanupLobby(); cleanupRoom(); ROOM_ID=null; }

async function goLobby(){
  cleanupRoom(); ROOM_ID=null;
  setScreen('lobby');
  if(!lobbyCh) lobbyCh = subscribeLobby(()=>scheduleLobbyRefresh());
  await refreshLobby();
  apiMe(TOKEN).then(p=>{ if(p){ ME=p; } });
}
async function refreshLobby(){
  if(SCREEN!=='lobby') return;
  const [rooms, members] = await Promise.all([fetchRooms(), fetchAllMembers()]);
  const seatCount = {};
  members.forEach(m=>{ if(m.seat!=null && m.role==='player'){ seatCount[m.room_id]=(seatCount[m.room_id]||0)+1; } });
  app().innerHTML = `
    <section class="screen screen--lobby">
      <header class="lobby__top">
        <span class="lobby__hello">${nameHTML(ME.real_name, ME.score)}<small>${tierBadgeHTML(ME.score)} · ${ME.score}점 · ${ME.wins}승${ME.losses}패${ME.streak >= 1 ? ' · 🔥' + ME.streak : ''}</small></span>
        <span class="spacer"></span>
        <button class="btn btn--ghost" data-act="goTiers">티어</button>
        <button class="btn btn--ghost" data-act="goRank">랭킹</button>
        <button class="btn btn--ghost" data-act="logout">로그아웃</button>
      </header>
      <ul class="room-grid scrollable grow">
        ${rooms.map(r=>{
          const c = seatCount[r.id]||0;
          const playing = r.status!=='waiting';
          const gname = r.game==='wordbomb'?'💣 말잇폭':'🀄 루미큐브';
          return `<li class="room-card ${playing?'is-playing':''}" data-act="enterRoom" data-room="${r.id}">
            <span class="room-card__id">방 ${r.id} <small class="muted">${gname}</small></span>
            <span class="room-card__count ${c>=4?'is-full':''}">${c}/4</span>
            <span class="room-card__state">${playing?'게임중':'대기중'}</span>
          </li>`;
        }).join('')}
      </ul>
      <p class="muted center" style="padding:10px">친구들과 같은 방에 모이면 방장이 시작해요.</p>
    </section>`;
}

/* ============================ 대기실/게임 입장 ========================= */
async function enterRoomFlow(roomId){
  if(ROOM_ID===roomId || busy) return;
  busy = true;
  try{
    cleanupLobby(); cleanupRoom();
    ROOM_ID = roomId;
    await enterRoom(roomId, ME);
    await refreshLbCache();
    roomDbCh = subscribeRoom(roomId, ()=>scheduleRoomRefresh());
    presenceCh = joinPresence(roomId, ME, { seat:null, role:'player', name:ME.real_name }, onPresence);
    await refreshRoom();
  } finally { busy = false; }
}
let _lbAt = 0;
async function refreshLbCache(force){
  if(!force && Date.now() - _lbAt < 2500 && Object.keys(lbCache).length) return;   // TTL: 과도한 호출 방지
  _lbAt = Date.now();
  const list = await apiLeaderboard();
  lbCache = {};
  list.forEach(u => lbCache[u.id] = { score:u.score, wins:u.wins, losses:u.losses, streak:u.streak, real_name:u.real_name });
}
// 실시간 이벤트 버스트 합치기(렉 방지)
let _roomT = null, _lobbyT = null;
function scheduleRoomRefresh(){ clearTimeout(_roomT); _roomT = setTimeout(() => refreshRoom(), 120); }
function scheduleLobbyRefresh(){ clearTimeout(_lobbyT); _lobbyT = setTimeout(() => refreshLobby(), 150); }
function trackPresence(){ if(presenceCh){ const m = MEMBERS.find(x=>x.user_id===ME.id)||{}; try{ presenceCh.track({ seat:m.seat??null, role:m.role||'player', name:ME.real_name }); }catch(e){} } }

async function refreshRoom(){
  if(ROOM_ID==null) return;
  ROOM = await fetchRoom(ROOM_ID);
  MEMBERS = await fetchMembers(ROOM_ID);
  if(!ROOM){ goLobby(); return; }
  if(ROOM.status==='waiting'){ stopTimer(); await refreshLbCache(); renderWaiting(); }
  else if(ROOM.status==='playing'){ enterGameView(); }
  else if(ROOM.status==='finished'){ stopTimer(); renderResult(); }
}

/* presence 동기화: janitor 가 떠난 멤버 정리 + 호스트 승격 */
async function onPresence(state){
  presentIds = Object.keys(state||{});
  trackPresence();
  // 청소(떠난 멤버 삭제·방장 승격)는 대기실에서만. 게임 중엔 멤버를 건드리지 않음(좌석/점수 꼬임 방지).
  if(!ROOM || ROOM.status!=='waiting' || !MEMBERS.length) return;
  const seated = MEMBERS.filter(m=>m.seat!=null).sort((a,b)=>a.seat-b.seat);
  const earliest = MEMBERS.slice().sort((a,b)=> new Date(a.joined_at)-new Date(b.joined_at));
  const janitor = (seated.find(m=>presentIds.includes(m.user_id)) || earliest.find(m=>presentIds.includes(m.user_id)));
  if(!janitor || janitor.user_id!==ME.id) return;     // 한 명만 청소
  const absent = MEMBERS.filter(m=>!presentIds.includes(m.user_id));
  for(const m of absent){ await deleteMember(ROOM_ID, m.user_id); }
  if(ROOM.host_id && !presentIds.includes(ROOM.host_id)){
    const next = earliest.find(m=>presentIds.includes(m.user_id));
    if(next) await promoteHost(ROOM_ID, ROOM.host_id, next.user_id);
  }
  if(absent.length) refreshRoom();
}
// 타임아웃 대리자: 현재 차례가 아닌, 접속 중 최저좌석 플레이어 1명만 (herd 방지)
function timeoutActorId(){
  if(!G || !G.players) return null;
  const curUid = G.players[G.turn];
  const seated = MEMBERS.filter(m=>m.seat!=null && presentIds.includes(m.user_id) && m.user_id!==curUid)
                        .sort((a,b)=>a.seat-b.seat);
  return seated.length ? seated[0].user_id : null;
}

/* ----------------------------- 대기실 렌더 ---------------------------- */
function renderWaiting(){
  const amHost = ROOM.host_id===ME.id;
  const seatMap = {}; MEMBERS.forEach(m=>{ if(m.seat!=null) seatMap[m.seat]=m; });
  const iAmSpectator = (MEMBERS.find(m=>m.user_id===ME.id)||{}).role==='spectator';
  const mySeatNow = (MEMBERS.find(m=>m.user_id===ME.id)||{}).seat;
  const seatedCount = MEMBERS.filter(m=>m.seat!=null).length;
  const stat = uid => lbCache[uid] || {};
  setScreen('room');
  app().innerHTML = `
    <section class="screen screen--room">
      <header class="room__top"><b>방 ${ROOM_ID}</b><span class="muted">${ROOM.game==='wordbomb'?'💣 말잇폭':'🀄 루미큐브'} · ${seatedCount}/4</span><span class="spacer"></span>
        <button class="btn btn--ghost" data-act="leave">나가기</button></header>
      <ul class="seat-list grow scrollable">
        ${[1,2,3,4].map(n=>{
          const m = seatMap[n];
          if(m){
            const st = stat(m.user_id);
            const isMe = m.user_id===ME.id;
            const sc = st.score ?? m.score ?? 0, wn = st.wins ?? m.wins ?? 0, ls = st.losses ?? m.losses ?? 0, sk = st.streak ?? m.streak ?? 0;
            return `<li class="seat is-occupied ${isMe?'is-me':''}" data-seat="${n}">
              <span class="seat__no">${n}번</span>
              <span class="seat__main">
                <span class="seat__name">${nameHTML(m.name, sc)}${isMe?' <small>(나)</small>':''}${ROOM.host_id===m.user_id?' <span class="seat__badge">방장</span>':''}</span>
                <span class="seat__record">${wn}승 ${ls}패 · ${tierBadgeHTML(sc)}</span>
                <span class="seat__scoreline">${scoreTierHTML(sc)} ${streakHTML(sk)}</span>
              </span>
            </li>`;
          }
          const canSit = !mySeatNow && !iAmSpectator;
          return `<li class="seat is-empty" ${canSit?`data-act="sit" data-seat="${n}"`:''}>＋ ${n}번 자리 ${canSit?'앉기':''}</li>`;
        }).join('')}
      </ul>
      ${amHost ? `
        <div class="host-controls">
          <div class="opt-label">게임</div>
          <div class="time-select">
            <button class="chip ${ROOM.game!=='wordbomb'?'is-active':''}" data-act="setGame" data-game="rummikub">🀄 루미큐브</button>
            <button class="chip ${ROOM.game==='wordbomb'?'is-active':''}" data-act="setGame" data-game="wordbomb">💣 말잇폭</button>
          </div>
          <div class="opt-label">${ROOM.game==='wordbomb'?'폭탄 심지(초)':'턴 제한시간(초)'}</div>
          <div class="time-select">
            ${[15,30,60].map(s=>`<button class="chip ${ROOM.turn_seconds===s?'is-active':''}" data-act="setTime" data-sec="${s}">${s}초</button>`).join('')}
          </div>
          ${ROOM.game==='wordbomb' ? `
            <div class="opt-label">시작 목숨</div>
            <div class="time-select">${[3,5,7].map(l=>`<button class="chip ${WB_OPTS.lives===l?'is-active':''}" data-act="setLives" data-lives="${l}">❤${l}</button>`).join('')}</div>
            <div class="time-select"><button class="chip ${WB_OPTS.dueum?'is-active':''}" data-act="setDueum">두음법칙 ${WB_OPTS.dueum?'허용':'금지'}</button></div>` : ''}
          <button class="btn btn--primary btn--lg" data-act="start" ${seatedCount>=2&&seatedCount<=4?'':'disabled'}>게임 시작 (2~4명)</button>
        </div>`
       : `<div class="wait-note">방장이 시작하기를 기다리는 중…<br><b>${ROOM.game==='wordbomb'?'💣 말잇폭':'🀄 루미큐브'}</b> · ${ROOM.turn_seconds}초</div>`}
      <div class="room__actions">
        ${mySeatNow ? `<button class="btn btn--ghost" data-act="unseat">자리 비우기</button>`:''}
        ${!iAmSpectator ? `<button class="btn btn--ghost" data-act="spectate">관전하기</button>`:`<div class="muted center">👁 관전 중</div>`}
      </div>
    </section>`;
}
async function doSit(seat){
  await netCall(async ()=>{
    const r = await takeSeat(ROOM_ID, ME, seat);
    if(!r.ok){ toast('이미 찬 자리예요'); }
    await refreshRoom(); trackPresence();
  });
}
async function doSpectate(){ await netCall(async()=>{ await spectate(ROOM_ID, ME); await refreshRoom(); trackPresence(); }); }
async function doSetTime(sec){ await netCall(()=>setTurnSeconds(ROOM_ID, sec)); }
async function doLeave(){ await netCall(()=>leaveRoom(ROOM_ID, ME)); goLobby(); }
async function doStart(){
  await netCall(async ()=>{
    const seated = MEMBERS.filter(m=>m.seat!=null).sort((a,b)=>a.seat-b.seat);
    if(seated.length<2 || seated.length>4){ toast('2~4명이 앉아야 시작'); return; }
    const seatNums = seated.map(m=>m.seat);
    const players={}, names={}, scores={};
    seated.forEach(m=>{ players[m.seat]=m.user_id; names[m.seat]=m.name; scores[m.seat]=(lbCache[m.user_id]&&lbCache[m.user_id].score) ?? m.score ?? 0; });
    let st;
    if(ROOM.game==='wordbomb'){
      st = buildWordState(seatNums, players, names, scores, { fuse: ROOM.turn_seconds, dueum: WB_OPTS.dueum, allowSingle:false, startLives: WB_OPTS.lives });
    } else {
      st = dealNewGame(seatNums);
      st.players=players; st.names=names; st.scores=scores; st.n=seated.length; st.passStreak=0; st.results=null;
    }
    await startGame(ROOM_ID, st);
  });
}

/* ============================ 게임 =================================== */
function isMyTurn(){ return ROOM && ROOM.status==='playing' && mySeat && Number(G.turn)===Number(mySeat); }
function cloneWork(s){ return { board: deepClone(s.board), hands: deepClone(s.hands) }; }
function seatOfUser(s, uid){ const p=s.players||{}; for(const k in p){ if(p[k]===uid) return Number(k); } return null; }
function isOver(s){ return Object.keys(s.hands).some(k=>s.hands[k].length===0) || (s.passStreak||0) >= s.n; }

function enterGameView(){
  G = ROOM.state;
  if(G && G.game==='wordbomb'){ enterWordView(); return; }   // 말잇폭 분기
  mySeat = seatOfUser(G, ME.id);
  amSpectator = (mySeat==null);
  if(ROOM.status==='playing' && isOver(G)){       // 게임 끝 — 조작 막고 집계 대기
    stopTimer();
    if(mySeat!=null) finishGame(ROOM_ID, TOKEN);   // 멱등(서버가 status=finished 로 전환)
    setScreen('game');
    app().innerHTML = `<section class="screen center" style="justify-content:center;gap:8px"><h2>🏁 게임 종료</h2><p class="muted">결과 집계 중…</p></section>`;
    return;
  }
  if(isMyTurn()){
    if(!work || prevTurn!==Number(G.turn)){ initWork(); }
  } else { work = cloneWork(G); }
  prevTurn = Number(G.turn);
  renderGame();
  startTimer();
}
function initWork(){
  work = cloneWork(G);
  turnStart = { board: deepClone(G.board), rack: G.hands[mySeat].slice() };
  turnStartBoardSet = new Set(G.board.flat());
  selection = { source:null, ids:[] }; undoStack = [];
}

/* --- 타일/세트 렌더 --- */
function tileMarkup(id, sel){
  const t = TILES[id];
  const cls = t.joker ? 'tile--joker' : 'tile--'+t.color;
  const face = t.joker ? '★' : t.num;
  return `<span class="tile-hit ${sel?'is-selected':''}" data-tap="tile" data-tile="${id}"><span class="tile ${cls}">${face}</span></span>`;
}
function setClass(ids){
  if(ids.length===0) return '';
  if(ids.length<3) return 'is-incomplete';
  return isValidMeld(ids) ? 'is-valid' : 'is-invalid';
}
function selSel(kind, idx, id){ return selection.source && selection.source.kind===kind && (kind==='rack' || selection.source.idx===idx) && selection.ids.includes(id); }
function boardHTML(board){
  return board.map((set,i)=>`<div class="board-set ${setClass(set)}" data-tap="set" data-set-idx="${i}">${set.map(id=>tileMarkup(id, selSel('set',i,id))).join('')}</div>`).join('')
    + `<div class="new-set-zone" data-tap="newset">＋ 새 세트</div>`;
}
function rackTilesHTML(hands){ return (hands[mySeat]||[]).map(id=>tileMarkup(id, selSel('rack',-1,id))).join(''); }
function meldHintHTML(){
  if(!isMyTurn()) return '';
  if(!(mySeat && G.initialMeld[mySeat])){
    const pts = previewNewPoints(G, mySeat, turnStart.board, work.board) || 0;
    return `<div class="meld-hint" data-can="${pts>=30?1:0}"><div class="meld-hint__bar"><i style="--p:${Math.min(1,pts/30)}"></i></div><span class="meld-hint__label">${pts>=30?'낼 수 있어요!':pts+' / 30점'}</span></div>`;
  }
  const added = new Set(work.board.flat()); turnStartBoardSet.forEach(id=>added.delete(id));
  return `<div class="meld-hint" data-can="1"><span class="meld-hint__label">이번 턴 ${added.size}장 냄 · 자유롭게 배치 후 [내기]</span></div>`;
}
function renderGame(){
  const view = isMyTurn() ? work : { board: G.board, hands: G.hands };
  const seats = Object.keys(G.players).map(Number).sort((a,b)=>a-b);
  const oppoSeats = seats.filter(s=>s!==mySeat);
  const oppoHtml = oppoSeats.map(s=>{
    const cnt = (G.hands[s]||[]).length;
    const t = tierForScore((G.scores||{})[s]||0);
    return `<li class="oppo ${Number(G.turn)===s?'is-turn':''} ${cnt===1?'is-1tile':''} ${amSpectator?'is-peekable':''}" ${amSpectator?`data-act="peek" data-seat="${s}"`:''}>
      <span class="oppo__name tier-name" style="--tc:${t.color}">${t.logo}${esc(G.names[s])}</span><span class="oppo__count">${cnt}</span></li>`;
  }).join('');
  const turnName = G.names[Number(G.turn)] || ('좌석'+G.turn);
  let dock;
  if(amSpectator){
    dock = `<div class="spectate-dock">👁 관전 중 — 위의 상대를 눌러 손패를 볼 수 있어요</div>`;
  } else {
    const mine = isMyTurn();
    dock = `<footer class="dock">
      <div class="rack" data-tap="rack">${rackTilesHTML(view.hands)}</div>
      <nav class="action-bar">
        <button class="btn btn--ghost" data-act="sort" data-key="num">숫자정렬</button>
        <button class="btn btn--ghost" data-act="sort" data-key="color">색정렬</button>
        <button class="btn btn--ghost btn--icon" data-act="undo" ${mine?'':'disabled'}>↶</button>
        <button class="btn btn--ghost btn--icon" data-act="reset" ${mine?'':'disabled'}>⟲</button>
      </nav>
      <nav class="action-bar action-bar--primary">
        <button class="btn btn--primary btn--submit" data-act="submit" ${mine?'':'disabled'}>내기</button>
        <button class="btn btn--draw" data-act="draw" ${mine?'':'disabled'}>뽑기</button>
      </nav>
    </footer>`;
  }
  setScreen('game');
  app().innerHTML = `
    <section class="screen screen--game">
      <header class="topbar">
        <div class="turn-pill ${isMyTurn()?'is-mine':''}">${isMyTurn()?'내 차례':esc(turnName)+' 차례'}</div>
        <div class="timer" data-role="timer" data-state="normal">
          <svg class="timer__ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="none" stroke="#2a3140" stroke-width="3"/><circle class="timer__fill" cx="18" cy="18" r="16" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-dasharray="100.5" stroke-dashoffset="0"/></svg>
          <span class="timer__num" data-role="timerNum">–</span>
        </div>
        <span class="room-tag">방${ROOM_ID}·🂠${G.pool.length}</span>
        <ul class="oppo-strip">${oppoHtml}</ul>
      </header>
      <div id="hintHost">${meldHintHTML()}</div>
      <main class="board" data-tap="boardroot">${boardHTML(view.board)}</main>
      ${dock}
      <div class="sheet" id="peekSheet"></div>
    </section>`;
  updateTimerUI();
  oppoSeats.concat(mySeat?[mySeat]:[]).forEach(s=>{ if((G.hands[s]||[]).length===1) flashOneTile(); });
}
// 내 턴 편집 시 보드/랙/힌트만 갱신(상단바·타이머·상대 재렌더 안 함 → 가벼움)
function renderPlay(){
  const b = document.querySelector('.board'); if(b) b.innerHTML = boardHTML(work.board);
  const r = document.querySelector('.dock .rack'); if(r) r.innerHTML = rackTilesHTML(work.hands);
  const h = document.getElementById('hintHost'); if(h) h.innerHTML = meldHintHTML();
}

/* ============================ 말잇폭(word-bomb) ======================= */
function wbHearts(n){ return n > 0 ? '❤'.repeat(n) : '💀'; }
function enterWordView(){
  mySeat = seatOfUser(G, ME.id);
  amSpectator = (mySeat == null);
  if(ROOM.status === 'playing' && wbGameOver(G)){          // 게임 끝 → 집계
    stopTimer();
    if(mySeat != null){ if(G.finishScores) finishGeneric(ROOM_ID, TOKEN); else pushWordFinish(); }
    setScreen('game');
    app().innerHTML = `<section class="screen center" style="justify-content:center;gap:8px"><h2>🏁 게임 종료</h2><p class="muted">결과 집계 중…</p></section>`;
    return;
  }
  renderWordGame();
  startTimer();
}
function renderWordGame(){
  const seats = Object.keys(G.players).map(Number).sort((a,b)=>a-b);
  const req = wbReqChar(G);
  const myTurn = isMyTurn();
  const dead = mySeat && (G.lives[mySeat] <= 0);
  const oppoHtml = seats.filter(s=>s!==mySeat).map(s=>{
    const t = tierForScore((G.scores||{})[s]||0); const lv = G.lives[s];
    return `<li class="oppo ${Number(G.turn)===s?'is-turn':''} ${lv<=0?'is-dead':''}"><span class="oppo__name tier-name" style="--tc:${t.color}">${t.logo}${esc(G.names[s])}</span><span class="oppo__count">${wbHearts(lv)}</span></li>`;
  }).join('');
  const ev = G.lastEvent || {};
  const boom = ev.type==='boom' ? `<div class="wb-boom">💥 ${esc(G.names[ev.seat]||'')} 폭발!${ev.elim?' (탈락)':''}</div>` : '';
  let dock;
  if(amSpectator || dead){ dock = `<div class="spectate-dock">${dead?'💀 탈락 — 구경 중':'👁 관전 중'}</div>`; }
  else if(myTurn){
    dock = `<footer class="dock"><div class="wb-input">
      <input class="input" id="wbWord" placeholder="'${esc(req)}' (으)로 시작!" autocomplete="off" autocapitalize="off" autocorrect="off" />
      <button class="btn btn--primary" data-act="submitWord">던지기</button></div></footer>`;
  } else {
    dock = `<footer class="dock"><div class="wb-wait">💣 ${esc(G.names[Number(G.turn)])} 님이 폭탄을 들고 있어요…</div></footer>`;
  }
  setScreen('game');
  app().innerHTML = `
    <section class="screen screen--game">
      <header class="topbar">
        <div class="turn-pill ${myTurn?'is-mine':''}">${myTurn?'💣 내 차례!':esc(G.names[Number(G.turn)])+' 차례'}</div>
        <div class="timer" data-role="timer" data-state="normal">
          <svg class="timer__ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="none" stroke="#2a3140" stroke-width="3"/><circle class="timer__fill" cx="18" cy="18" r="16" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-dasharray="100.5" stroke-dashoffset="0"/></svg>
          <span class="timer__num" data-role="timerNum">–</span>
        </div>
        <span class="room-tag">방${ROOM_ID}·💣</span>
        <ul class="oppo-strip">${oppoHtml}</ul>
      </header>
      <main class="wb-stage">
        ${boom}
        <div class="wb-chain"><span class="wb-last">${esc(G.lastWord)}</span><span class="wb-arrow">→</span><span class="wb-req">${esc(req)}…</span></div>
        <div class="wb-meta">나온 단어 ${G.usedWords.length}개${mySeat?` · 내 목숨 <b class="wb-life">${wbHearts(G.lives[mySeat]||0)}</b>`:''}</div>
        <div class="wb-rule muted">${G.rules.dueum?'두음법칙 허용':'두음법칙 금지'} · 사전 없음(우기기 가능, 같은 단어 재사용 금지)</div>
      </main>
      ${dock}
    </section>`;
  updateTimerUI();
  const inp = document.getElementById('wbWord');
  if(inp){ try{ inp.focus(); }catch(e){} inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); onSubmitWord(); } }); }
}
async function onSubmitWord(){
  if(busy || !isMyTurn()) return;
  const inp = document.getElementById('wbWord'); if(!inp) return;
  const word = (inp.value||'').trim();
  const err = wbValidate(word, G);
  if(err){ toast(err); inp.select(); return; }
  const s = wbApplyPass(G, mySeat, word);
  busy = true; const v = ROOM.version; const r = await pushState(ROOM_ID, s, v); busy = false;
  if(!r.ok){ toast('동기화 충돌, 다시 시도하세요'); await refreshRoom(); return; }
  await refreshRoom();
}
async function wbTimeout(forSeat){
  if(busy) return; busy = true;
  if(Number(G.turn) !== Number(forSeat)){ busy = false; return; }
  let s = wbApplyExplode(G, forSeat);
  const over = wbGameOver(s);
  if(over) s.finishScores = wbFinishScores(s);
  const v = ROOM.version; const r = await pushState(ROOM_ID, s, v); busy = false;
  if(r.ok){ if(over) await finishGeneric(ROOM_ID, TOKEN); await refreshRoom(); }
}
async function pushWordFinish(){   // 종료 감지했는데 finishScores 없을 때 보강
  if(busy) return; busy = true;
  const s = deepClone(G); s.finishScores = wbFinishScores(s);
  const v = ROOM.version; const r = await pushState(ROOM_ID, s, v); busy = false;
  if(r.ok){ await finishGeneric(ROOM_ID, TOKEN); await refreshRoom(); }
}

/* --- 탭 조작 --- */
function reflowSet(ids){
  if(ids.length<2) return ids.slice();
  const tiles = ids.map(id=>TILES[id]);
  const reals = tiles.filter(t=>!t.joker);
  const jokerIds = ids.filter(id=>TILES[id].joker);
  // 그룹? 같은 숫자
  if(reals.length>0 && reals.every(t=>t.num===reals[0].num)) return ids.slice();
  // 런 시도: 같은 색
  if(reals.length>0 && reals.every(t=>t.color===reals[0].color)){
    const sorted = reals.slice().sort((a,b)=>a.num-b.num);
    const out = []; let jk = jokerIds.slice(); let cur = sorted[0].num; let ri = 0;
    while(ri < sorted.length){
      if(sorted[ri].num === cur){ out.push(sorted[ri].id); ri++; cur++; }
      else if(sorted[ri].num < cur){ return ids.slice(); } // 중복 → 그대로
      else if(jk.length){ out.push(jk.shift()); cur++; }
      else return ids.slice();
    }
    while(jk.length) out.push(jk.shift());
    return out;
  }
  return ids.slice();
}
function removeFromWork(id){
  for(const m of work.board){ const i=m.indexOf(id); if(i>=0){ m.splice(i,1); return; } }
  const r = work.hands[mySeat]; const i=r.indexOf(id); if(i>=0) r.splice(i,1);
}
function handleTap(el){
  if(!isMyTurn()) return;
  const kind = el.dataset.tap;
  if(kind==='tile'){
    const id = el.dataset.tile;
    const cont = el.closest('[data-tap="set"],[data-tap="rack"]');
    const srcKind = cont.dataset.tap;
    const srcIdx = srcKind==='set' ? Number(cont.dataset.setIdx) : -1;
    if(!selection.source || selection.source.kind!==srcKind || selection.source.idx!==srcIdx)
      selection = { source:{kind:srcKind, idx:srcIdx}, ids:[] };
    const i = selection.ids.indexOf(id);
    if(i>=0) selection.ids.splice(i,1); else selection.ids.push(id);
    renderPlay();
    return;
  }
  if(['set','newset','rack'].includes(kind)){
    if(selection.ids.length===0) return;
    moveSelectionTo(kind, el);
  }
}
function moveSelectionTo(kind, el){
  const ids = selection.ids.slice();
  if(kind==='rack' && ids.some(id=>turnStartBoardSet.has(id))){ toast('보드에 원래 있던 타일은 가져올 수 없어요'); return; }
  undoStack.push(deepClone(work));
  ids.forEach(removeFromWork);
  if(kind==='rack'){ work.hands[mySeat].push(...ids); }
  else {
    let idx;
    if(kind==='newset'){ work.board.push([]); idx = work.board.length-1; }
    else idx = Number(el.dataset.setIdx);
    if(!work.board[idx]) { work.board.push([]); idx = work.board.length-1; }
    work.board[idx].push(...ids);
  }
  work.board = work.board.map(reflowSet).filter(s=>s.length>0);
  selection = { source:null, ids:[] };
  renderPlay();
}
function doUndo(){ if(undoStack.length){ work = undoStack.pop(); selection={source:null,ids:[]}; renderPlay(); } }
function doReset(){ work.board = deepClone(turnStart.board); work.hands = deepClone(G.hands); work.hands[mySeat]=turnStart.rack.slice(); selection={source:null,ids:[]}; undoStack=[]; renderPlay(); }
function doSort(key){
  localStorage.setItem('rk_sort', key);
  const arr = work.hands[mySeat].slice();
  arr.sort((a,b)=>{ const ta=TILES[a],tb=TILES[b]; if(ta.joker)return 1; if(tb.joker)return -1;
    return key==='num' ? (ta.num-tb.num)||(COLORS.indexOf(ta.color)-COLORS.indexOf(tb.color))
                       : (COLORS.indexOf(ta.color)-COLORS.indexOf(tb.color))||(ta.num-tb.num); });
  work.hands[mySeat]=arr; renderPlay();
}
function toggleHint(){ /* 간이: 선택 타일 합류 가능한 세트 하이라이트 */
  if(!selection.ids.length){ toast('먼저 손패를 선택하세요'); return; }
  document.querySelectorAll('.board-set,.new-set-zone').forEach((node,i)=>{});
  // 하이라이트는 렌더 단순화를 위해 토스트로 안내
  const legal=[]; work.board.forEach((set,i)=>{ if(isValidMeld(reflowSet([...set,...selection.ids]))) legal.push((i+1)+'번 세트'); });
  if(isValidMeld(reflowSet(selection.ids))) legal.push('새 세트');
  toast(legal.length?('가능: '+legal.join(', ')):'합류 가능한 곳이 없어요', true);
}

/* --- 제출 / 뽑기 / 종료 --- */
async function onSubmit(){
  if(busy) return;
  const cur = work.board.map(reflowSet).filter(s=>s.length>0);
  const res = validateTurn(G, mySeat, turnStart.board, cur, turnStart.rack, work.hands[mySeat]);
  if(!res.ok){ toast(res.msg); return; }
  const s = deepClone(G);
  s.board = cur; s.hands[mySeat] = work.hands[mySeat].slice();
  if(!s.initialMeld[mySeat]) s.initialMeld[mySeat]=true;
  s.passStreak = 0;
  const emptied = s.hands[mySeat].length===0;
  if(!emptied) s.turn = nextSeat(s, mySeat);
  await commit(s);
}
async function onDraw(){
  if(busy) return;
  const s = deepClone(G);
  if(s.pool.length>0){ s.hands[mySeat].push(s.pool.shift()); s.passStreak=0; }
  else { s.passStreak = (s.passStreak||0)+1; }
  s.turn = nextSeat(s, mySeat);
  await commit(s);
}
async function commit(state){
  busy=true;
  const v = ROOM.version;                       // 대기 중 ROOM 이 바뀌어도 이 버전으로 CAS
  const r = await pushState(ROOM_ID, state, v);
  busy=false;
  if(!r.ok){ toast('보드가 변경됐어요. 다시 시도하세요.'); await refreshRoom(); return; }
  work=null;
  if(isOver(state)) await finishGame(ROOM_ID, TOKEN);
  await refreshRoom();                           // 신선한 ROOM(version 포함) 재취득
}
async function autoTimeout(forSeat){
  if(busy) return; busy=true;
  const s = deepClone(G);
  if(Number(s.turn)!==Number(forSeat)){ busy=false; return; }
  if(s.pool.length>0){ s.hands[forSeat].push(s.pool.shift()); s.passStreak=0; }
  else { s.passStreak=(s.passStreak||0)+1; }
  const over = isOver(s);
  if(!over) s.turn = nextSeat(s, forSeat);
  const v = ROOM.version;
  const r = await pushState(ROOM_ID, s, v);
  busy=false;
  if(r.ok){ work=null; if(over) await finishGame(ROOM_ID, TOKEN); await refreshRoom(); }
}

/* --- 타이머 --- */
function startTimer(){ if(timerIv) return; timerIv = setInterval(tick, 250); }
function stopTimer(){ if(timerIv){ clearInterval(timerIv); timerIv=null; } lastAutoKey=null; }
function tick(){
  if(!ROOM || ROOM.status!=='playing' || !ROOM.turn_started_at || !G) return;
  const startMs = new Date(ROOM.turn_started_at).getTime();
  const wb = (G.game==='wordbomb');
  const lim = wb ? (G.fuse||15) : (ROOM.turn_seconds||30);
  const rem = lim - (serverNow()-startMs)/1000;
  updateTimerUI(rem, lim);
  const act = wb ? wbTimeout : autoTimeout;
  const key = ROOM.version+'|'+G.turn;
  if(rem<=0 && isMyTurn() && lastAutoKey!==key){ lastAutoKey=key; act(mySeat); }            // 현재 플레이어 본인
  else if(rem < -4 && !isMyTurn() && lastAutoKey!==key && timeoutActorId()===ME.id){ lastAutoKey=key; act(Number(G.turn)); }  // 끊긴 현재 플레이어 대리(1명만)
}
function updateTimerUI(rem, lim){
  const numEl = $('[data-role="timerNum"]'), tEl=$('[data-role="timer"]'), fill=$('.timer__fill');
  if(!numEl||!tEl) return;
  if(rem==null){ if(ROOM&&ROOM.turn_started_at){ rem = (ROOM.turn_seconds||30)-(serverNow()-new Date(ROOM.turn_started_at).getTime())/1000; lim=ROOM.turn_seconds||30; } else { numEl.textContent='–'; return; } }
  const r = Math.max(0, rem);
  numEl.textContent = Math.ceil(r);
  if(fill){ const C=100.5; fill.style.strokeDashoffset = (C*(1 - r/lim)).toFixed(1); }
  const state = r>10?'normal':r>5?'warn':'danger';
  tEl.dataset.state = state;
  if(state==='danger' && !lastDanger){ lastDanger=true; if(navigator.vibrate) navigator.vibrate(60); }
  if(state!=='danger') lastDanger=false;
}

/* --- 관전 펼치기 --- */
function openPeek(seat){
  const sheet = $('#peekSheet'); if(!sheet) return;
  const hand = (G.hands[seat]||[]);
  sheet.innerHTML = `<div class="sheet__grab"></div><h3 class="sheet__title">${esc(G.names[seat])} 님의 손패 (${hand.length}장)</h3>
    <div class="sheet__tiles rack">${hand.map(id=>tileMarkup(id,false)).join('')}</div>
    <button class="btn btn--ghost btn--lg" data-act="closeSheet">닫기</button>`;
  sheet.classList.add('is-open');
  let sc = document.getElementById('rk-scrim');
  if(!sc){ sc=document.createElement('div'); sc.id='rk-scrim'; sc.className='scrim'; sc.addEventListener('click', closePeek); document.body.appendChild(sc); }
}
function closePeek(){ const s=$('#peekSheet'); if(s) s.classList.remove('is-open'); const sc=document.getElementById('rk-scrim'); if(sc) sc.remove(); }

/* --- 토스트 / 1장 --- */
let toastT=null;
function toast(msg, ok){
  let t = document.querySelector('.toast'); if(!t){ t=document.createElement('div'); document.body.appendChild(t); }
  t.className = 'toast'+(ok?' toast--ok':''); t.textContent=msg;
  clearTimeout(toastT); toastT=setTimeout(()=>{ t.remove(); }, 2200);
}
let oneTileT=null;
function flashOneTile(){
  if(document.querySelector('.banner-1tile')) return;
  const b=document.createElement('div'); b.className='banner-1tile'; b.textContent='1장!'; document.body.appendChild(b);
  if(navigator.vibrate) navigator.vibrate(40);
  clearTimeout(oneTileT); oneTileT=setTimeout(()=>b.remove(), 1000);
}

/* ============================ 결과 =================================== */
function renderResult(){
  G = ROOM.state;
  const results = (G && G.results) || {};
  const rows = Object.keys(results).map(seat=>({ seat:Number(seat), ...results[seat] })).sort((a,b)=>a.rank-b.rank || a.seat-b.seat);
  const amHost = ROOM.host_id===ME.id;
  const winner = rows.find(r=>r.rank===1);
  setScreen('result');
  app().innerHTML = `
    <section class="screen screen--result scrollable">
      <h2 class="result__title">🏁 게임 종료</h2>
      <ol class="rank-list">
        ${rows.map(r=>{
          const tprev=tierForScore(r.prevScore||0), tnew=tierForScore(r.newScore||0);
          const chg = tnew.level>tprev.level?' <span class="tier-up">▲승급</span>':tnew.level<tprev.level?' <span class="tier-down">▼강등</span>':'';
          return `<li class="rank-row ${r.rank===1?'is-winner':''}">
          <span class="rank-row__place">${r.rank}위</span>
          <span class="rank-row__name">${nameHTML(G.names[r.seat], r.newScore)}${r.won?' 🏆':''}${r.streak>=1?' <span class="streak">🔥'+r.streak+'</span>':''}</span>
          <span class="rank-row__delta ${r.delta>=0?'delta--up':'delta--down'}">${r.delta>=0?'+':''}${r.delta}${r.bonus>0?'<small> 🔥+'+r.bonus+'</small>':''}</span>
          <span class="rank-row__new">${scoreTierHTML(r.newScore)}${chg}</span>
        </li>`;}).join('')}
      </ol>
      <div class="room__actions">
        ${amHost?`<button class="btn btn--primary btn--lg" data-act="again">다시 하기</button>`:`<div class="muted center">방장이 '다시 하기'를 누르면 새 게임이 시작돼요</div>`}
        <button class="btn btn--ghost btn--lg" data-act="leave">로비로 나가기</button>
      </div>
    </section>`;
  if(winner){ const w=document.createElement('div'); w.className='win-burst'; w.textContent='🎉'; document.body.appendChild(w); setTimeout(()=>w.remove(),1500); }
  apiMe(TOKEN).then(p=>{ if(p) ME=p; });
}

/* ============================ 랭킹 =================================== */
async function showRank(){
  setScreen('rank');
  const list = await apiLeaderboard();
  app().innerHTML = `
    <section class="screen screen--rank">
      <header class="room__top"><b>🏆 랭킹</b><span class="spacer"></span><button class="btn btn--ghost" data-act="backLobby">뒤로</button></header>
      <ol class="board-rank grow scrollable">
        ${list.map((u,i)=>`<li class="board-rank__row ${u.id===ME.id?'is-me':''}">
          <span class="pos">${i+1}</span>
          <span>${nameHTML(u.real_name,u.score)}<small class="muted"> ${tierForScore(u.score).fullName}${u.streak>=1?' · 🔥'+u.streak:''}</small></span>
          <span>${u.wins}승${u.losses}패</span>
          <span>${scoreTierHTML(u.score)}</span></li>`).join('')}
      </ol>
    </section>`;
}

/* ============================ 티어 안내 =============================== */
function showTiers(){
  setScreen('rank');
  const cur = tierForScore(ME.score);
  app().innerHTML = `
    <section class="screen">
      <header class="room__top"><b>🏅 티어</b><span class="spacer"></span><button class="btn btn--ghost" data-act="backLobby">뒤로</button></header>
      <div class="center" style="padding:8px">내 티어: ${tierBadgeHTML(ME.score)} <span class="muted">(${ME.score}점)</span></div>
      <ul class="tier-list scrollable grow">
        ${TIER_LADDER.slice().reverse().map(t=>{
          const full = t.division ? `${t.name} ${ROMAN[t.division]}` : t.name;
          return `<li class="tier-row ${t.level===cur.level?'is-cur':''}" style="--tc:${t.color}">
            <span class="tg">${t.logo}</span><span class="tier-row__name">${full}</span><span class="tier-row__cut">${t.min}점 +</span></li>`;
        }).join('')}
      </ul>
      <div class="muted center" style="padding:10px;font-size:12px;line-height:1.6">
        점수는 <b>얼마나 크게 이겼/졌는지</b>로 변동(극적인 승리=많이↑, 큰 패배=많이↓).<br>
        고티어일수록 적게 오르고 많이 내려가며, 중위권도 떨어질 수 있어요(1등은 항상 +).<br>
        연승 보너스: <b>다이아몬드 이하</b>에서 2연승부터 <b>연승수×10%</b> 추가. 연승 자체는 전 티어 표시.
      </div>
    </section>`;
}

window.addEventListener('DOMContentLoaded', boot);
