/* =========================================================================
   mini-core.js — 미니게임 공통 엔진 (캔버스 + rAF + 가상컨트롤 + 넷코드)
   게임별 로직(race.js / hunt.js)은 window.MiniGames[kind] 로 등록한다.

   ───────── 게임 모듈 계약 (race.js / hunt.js 가 구현) ─────────
   MiniGames.race = MiniGames.hunt = {
     label,                       // 표시명
     init(M),                     // state(seed,players,names,scores,phase,...)로 결정론 월드 생성. M.local 세팅.
     step(M, dt),                 // 고정스텝(ms). M.input 으로 내 엔티티 전진·충돌·이벤트.
     draw(M),                     // M.ctx 에 카메라·코스·엔티티 그리기(매 프레임).
     hud(M),                      // HUD html 문자열(throttle 표시).
     netPayload(M),               // 내 상태 broadcast payload(보통 {x,y,...}) 또는 null. NET_MS 마다.
     onPeer(M, seat, msg),        // peer broadcast 수신.
     actionLabel(M),              // 우하단 액션버튼 라벨(옵션).
     hostTick(M, dt),             // 호스트 전용: 종료조건/타이머. 끝나면 M.endGame() 호출.
     finishPatch(M),              // 호스트 전용: 종료 직전 state 에 머지할 권위필드
                                  //   race → {ranks:{seat:rank}} , hunt → {alive,roles,it,caughtMid}
   }

   ───────── M (미니 컨텍스트) 가 게임에 제공 ─────────
   M.state, M.room, M.roomId, M.me, M.mySeat, M.amSpectator, M.isHost, M.seats[], M.n, M.game
   M.input {dx,dy,action,actionHeld}    // action 은 엣지(읽고 false 처리)
   M.canvas, M.ctx, M.W, M.H, M.dpr
   M.simT()      // 페이즈 시작 후 ms (서버 시각 동기)
   M.peers       // {seat:{buf:[{t,p}], last}}
   M.peerAt(seat)// 보간된 peer payload({x,y,...}) 또는 null
   M.rng(seed)   // mulberry32 결정론 PRNG factory
   M.send(p)     // 즉시 broadcast
   M.appendFinish(item)  // state.finishOrder 에 CAS append (race)
   M.pushPatch(patch)    // 호스트 권위 state 머지 CAS (status 유지)
   M.endGame()           // 호스트: finishPatch 머지 후 finish RPC 호출 → 결과화면
   M.lowPower, M.flash(t), M.vibrate(ms)
   ========================================================================= */

const MINI = {
  on: false, raf: 0, last: 0, acc: 0, _simBase: 0,
  game: null, mod: null, room: null, roomId: null, state: null,
  me: null, mySeat: null, amSpectator: false, isHost: false, seats: [], n: 0,
  input: { dx: 0, dy: 0, action: false, actionHeld: false },
  canvas: null, ctx: null, W: 0, H: 0, dpr: 1,
  peers: {}, local: null, bc: null, _netT: 0, _hudT: 0, _hudHTML: '',
  lowPower: false, _frames: [], _ended: false, _ctl: null, _ro: null, _keys: null, _writeQ: null,
};
const MINI_STEP = 1000 / 30;
const MINI_NET_MS = 100;
const MINI_INTERP_MS = 110;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------------- 진입/종료 ------------------------------ */
function miniStart(room, me, mySeat, amSpectator) {
  miniStop();
  MINI.on = true; MINI._ended = false; MINI._writeQ = null; MINI._endRetryAt = 0;   // 새 게임: 이전 쓰기 큐/재시도 게이트 초기화
  MINI.room = room; MINI.roomId = room.id; MINI.state = room.state || {};
  MINI.game = room.game; MINI.mod = (window.MiniGames || {})[room.game];
  MINI.me = me; MINI.mySeat = mySeat; MINI.amSpectator = amSpectator;
  MINI.isHost = room.host_id === me.id;
  MINI.seats = Object.keys(MINI.state.players || {}).map(Number).sort((a, b) => a - b);
  MINI.n = MINI.seats.length;
  MINI.peers = {}; MINI.input = { dx: 0, dy: 0, action: false, actionHeld: false };
  MINI._simBase = new Date(room.turn_started_at || Date.now()).getTime();

  if (!MINI.mod) { app().innerHTML = `<section class="screen center" style="justify-content:center"><h2>${esc(GAME_NAME[room.game] || '미니게임')}</h2><p class="muted">게임 모듈을 불러오지 못했어요.</p></section>`; return; }

  setScreen('mini');
  app().innerHTML = `
    <section class="screen screen--mini">
      <button class="btn btn--ghost mini-leave" data-act="leave" style="position:absolute;top:max(8px,env(safe-area-inset-top));left:8px;z-index:9">← 나가기</button>
      <div class="mini-hud" id="miniHud"></div>
      <canvas id="miniCanvas"></canvas>
      <div class="mini-overlay" id="miniOverlay"></div>
      ${amSpectator ? `<div class="mini-spectate">👁 관전 중</div>` : `
      <div class="vctl vctl--pad" id="vpad"><div class="vctl__base"></div><div class="vctl__knob"></div></div>
      <div class="vctl vctl--act" id="vact"><span id="vactLabel">●</span></div>`}
    </section>`;
  MINI.canvas = document.getElementById('miniCanvas');
  MINI.ctx = MINI.canvas ? MINI.canvas.getContext('2d') : null;
  if (!MINI.ctx) {   // 캔버스/2D 컨텍스트 미지원 기기 → 검은화면 대신 안내(나가기 가능)
    app().innerHTML = `<section class="screen center" style="justify-content:center;text-align:center;padding:24px">`
      + `<h2>${esc(GAME_NAME[MINI.game] || '미니게임')}</h2>`
      + `<p class="muted">이 기기/브라우저에서 화면을 그릴 수 없어요. 크롬 등 다른 브라우저로 접속해 주세요.</p>`
      + `<button class="btn btn--primary" data-act="leave">← 나가기</button></section>`;
    return;
  }
  fitCanvas();
  // ⚠ 아래 셋업이 하나라도 throw 하면 rAF 루프가 안 돌아 '검은화면'이 됐었음 → 전부 가드 + 루프 보장.
  // ResizeObserver 미지원 기기(구형 사파리 등) 대비: 실패 시 window resize 폴백.
  try { MINI._ro = new ResizeObserver(fitCanvas); MINI._ro.observe(MINI.canvas); }
  catch (e) { MINI._ro = null; MINI._resizeFb = function () { fitCanvas(); }; window.addEventListener('resize', MINI._resizeFb); window.addEventListener('orientationchange', MINI._resizeFb); }
  if (!amSpectator) { try { setupControls(); } catch (e) { console.error('mini controls', e); } }
  try { setupKeys(); } catch (e) { console.error('mini keys', e); }
  try { MINI.bc = joinBroadcast(MINI.roomId, onPeerMsg); } catch (e) { console.error('mini bc', e); MINI.bc = null; }
  MINI.local = null;
  try { MINI.mod.init(MINI); } catch (e) { console.error('mini init', e); }
  if (!amSpectator) { try { const lbl = document.getElementById('vactLabel'); if (lbl && MINI.mod.actionLabel) lbl.textContent = MINI.mod.actionLabel(MINI); } catch (e) {} }
  MINI.last = performance.now(); MINI.acc = 0; MINI._netT = 0; MINI._hudT = 0; MINI._frames = [];
  MINI.raf = requestAnimationFrame(miniLoop);
  // 레이아웃이 늦게 잡히는 기기: 초기 0크기로 캔버스가 비는 것 방지(지연 재적합)
  setTimeout(fitCanvas, 120); setTimeout(fitCanvas, 450);
}

// realtime 권위 state 갱신 (페이즈/시드/결과 변경)
function miniOnRoom(room) {
  if (!MINI.on || room.id !== MINI.roomId) return;
  MINI.room = room; MINI.state = room.state || {};
  MINI.isHost = room.host_id === MINI.me.id;
  if (room.status === 'finished') MINI._ended = true;   // 결과 도착 → 지각 endGame 발사 차단
  if (room.turn_started_at) MINI._simBase = new Date(room.turn_started_at).getTime();
}

function miniStop() {
  MINI.on = false;
  if (MINI.raf) cancelAnimationFrame(MINI.raf), MINI.raf = 0;
  if (MINI.bc) leaveChannel(MINI.bc.ch), MINI.bc = null;
  if (MINI._ro) { try { MINI._ro.disconnect(); } catch (e) {} MINI._ro = null; }
  if (MINI._resizeFb) { window.removeEventListener('resize', MINI._resizeFb); window.removeEventListener('orientationchange', MINI._resizeFb); MINI._resizeFb = null; }
  if (MINI._keys) { window.removeEventListener('keydown', MINI._keys.d); window.removeEventListener('keyup', MINI._keys.u); MINI._keys = null; }
  MINI.peers = {}; MINI.local = null;
}

/* ----------------------------- 캔버스 -------------------------------- */
function fitCanvas() {
  const c = MINI.canvas; if (!c) return;
  const r = c.getBoundingClientRect();
  MINI.W = Math.max(1, Math.round(r.width)); MINI.H = Math.max(1, Math.round(r.height));
  MINI.dpr = Math.min(MINI.lowPower ? 1 : 1.5, window.devicePixelRatio || 1);
  c.width = Math.round(MINI.W * MINI.dpr); c.height = Math.round(MINI.H * MINI.dpr);
}

/* ----------------------------- 루프 ---------------------------------- */
function miniLoop(ts) {
  if (!MINI.on) return;
  let dt = ts - MINI.last; MINI.last = ts;
  if (dt > 60) dt = 60;                       // 탭복귀/스파이크 클램프
  // 저사양 감지
  MINI._frames.push(dt); if (MINI._frames.length > 40) MINI._frames.shift();
  if (MINI._frames.length === 40) {
    const avg = MINI._frames.reduce((a, b) => a + b, 0) / 40;
    const lp = avg > 24; if (lp !== MINI.lowPower) { MINI.lowPower = lp; fitCanvas(); }
  }
  MINI.acc += dt;
  let guard = 6;
  while (MINI.acc >= MINI_STEP && guard-- > 0) {
    try {
      if (!MINI.amSpectator && MINI.mod.step) MINI.mod.step(MINI, MINI_STEP);
      // 종료조건은 모든 클라가 검사(호스트 이탈해도 게임 안 끝나는 문제 방지; finish RPC·CAS 멱등)
      if (MINI.mod.hostTick && !MINI._ended && performance.now() >= (MINI._endRetryAt || 0)) MINI.mod.hostTick(MINI, MINI_STEP);
    } catch (e) { console.error('mini step', e); }
    MINI.input.action = false;                // 엣지 소비
    MINI.acc -= MINI_STEP;
  }
  // 네트워크 송신(throttle)
  MINI._netT += dt;
  if (MINI._netT >= MINI_NET_MS) {
    MINI._netT = 0;
    if (!MINI.amSpectator && MINI.mod.netPayload && MINI.bc) {
      try { const p = MINI.mod.netPayload(MINI); if (p) MINI.bc.send({ seat: MINI.mySeat, t: MINI.simT(), ...p }); }
      catch (e) { console.error('mini net', e); }   // 송신 실패해도 루프(rAF 재예약)는 계속
    }
  }
  // 그리기
  const ctx = MINI.ctx;
  ctx.setTransform(MINI.dpr, 0, 0, MINI.dpr, 0, 0);
  ctx.clearRect(0, 0, MINI.W, MINI.H);
  try { if (MINI.mod.draw) MINI.mod.draw(MINI); } catch (e) { console.error('mini draw', e); }
  // HUD(throttle)
  MINI._hudT += dt;
  if (MINI._hudT >= 150 && MINI.mod.hud) {
    MINI._hudT = 0;
    const h = MINI.mod.hud(MINI);
    if (h !== MINI._hudHTML) { MINI._hudHTML = h; const el = document.getElementById('miniHud'); if (el) el.innerHTML = h; }
  }
  MINI.raf = requestAnimationFrame(miniLoop);
}

MINI.simT = function () { return serverNow() - MINI._simBase; };
MINI.now = serverNow;
MINI.rng = mulberry32;
MINI.send = function (p) { if (MINI.bc) MINI.bc.send(p); };
MINI.flash = function (t) { flashBanner(t); };
MINI.vibrate = function (ms) { if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} };

/* ----------------------------- peer 보간 ----------------------------- */
function onPeerMsg(msg) {
  if (!msg || msg.seat == null || msg.seat === MINI.mySeat) return;
  const s = msg.seat;
  let e = MINI.peers[s]; if (!e) e = MINI.peers[s] = { buf: [], last: null };
  e.buf.push({ t: msg.t, p: msg }); if (e.buf.length > 4) e.buf.shift();
  e.last = msg;
  if (MINI.mod && MINI.mod.onPeer) { try { MINI.mod.onPeer(MINI, s, msg); } catch (err) {} }
}
MINI.peerAt = function (seat, atT) {
  const e = MINI.peers[seat]; if (!e || !e.buf.length) return null;
  const target = (atT != null ? atT : MINI.simT()) - MINI_INTERP_MS;
  const b = e.buf;
  if (b.length === 1 || target <= b[0].t) return b[0].p;
  for (let i = 0; i < b.length - 1; i++) {
    if (target >= b[i].t && target <= b[i + 1].t) {
      const a = b[i].p, c = b[i + 1].p, span = (b[i + 1].t - b[i].t) || 1;
      const k = Math.max(0, Math.min(1, (target - b[i].t) / span));
      const out = Object.assign({}, c);
      if (a.x != null && c.x != null) out.x = a.x + (c.x - a.x) * k;
      if (a.y != null && c.y != null) out.y = a.y + (c.y - a.y) * k;
      return out;
    }
  }
  return b[b.length - 1].p;
};

/* ----------------------------- 컨트롤 -------------------------------- */
function setupControls() {
  const pad = document.getElementById('vpad'); const knob = pad ? pad.querySelector('.vctl__knob') : null;
  const act = document.getElementById('vact');
  if (pad && knob) {
    let id = null, cx = 0, cy = 0;
    const R = () => Math.min(46, pad.getBoundingClientRect().width * 0.42);
    const move = (e) => {
      const r = R(); let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy) || 1;
      const cl = Math.min(d, r), nx = dx / d, ny = dy / d;
      knob.style.transform = `translate(calc(-50% + ${nx * cl}px), calc(-50% + ${ny * cl}px))`;
      const mag = Math.min(1, d / r), dead = 0.18;
      MINI.input.dx = mag > dead ? nx * mag : 0; MINI.input.dy = mag > dead ? ny * mag : 0;
    };
    pad.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; try { pad.setPointerCapture(id); } catch (x) {} move(e); e.preventDefault(); });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    const end = (e) => { if (e.pointerId === id) { id = null; MINI.input.dx = MINI.input.dy = 0; knob.style.transform = 'translate(-50%,-50%)'; } };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  }
  if (act) {
    act.addEventListener('pointerdown', (e) => { MINI.input.action = true; MINI.input.actionHeld = true; act.classList.add('is-down'); e.preventDefault(); });
    const end = () => { MINI.input.actionHeld = false; act.classList.remove('is-down'); };
    act.addEventListener('pointerup', end); act.addEventListener('pointercancel', end);
  }
}
function setupKeys() {
  const down = new Set();
  const apply = () => {
    let dx = (down.has('d') || down.has('arrowright') ? 1 : 0) - (down.has('a') || down.has('arrowleft') ? 1 : 0);
    let dy = (down.has('s') || down.has('arrowdown') ? 1 : 0) - (down.has('w') || down.has('arrowup') ? 1 : 0);
    const m = Math.hypot(dx, dy) || 1; MINI.input.dx = dx / m * (dx || dy ? 1 : 0); MINI.input.dy = dy / m * (dx || dy ? 1 : 0);
  };
  const d = (e) => { const k = e.key.toLowerCase(); if (k === ' ') { MINI.input.action = true; MINI.input.actionHeld = true; return; } if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) { down.add(k); apply(); } };
  const u = (e) => { const k = e.key.toLowerCase(); if (k === ' ') { MINI.input.actionHeld = false; return; } if (down.has(k)) { down.delete(k); apply(); } };
  window.addEventListener('keydown', d); window.addEventListener('keyup', u);
  MINI._keys = { d, u };
}

/* ----------------------------- 호스트 권위 --------------------------- */
async function _pushStateRetryRaw(patch, mergeArray) {
  for (let i = 0; i < 6; i++) {
    let ns = Object.assign({}, MINI.state);
    if (mergeArray) {
      const arr = (MINI.state[mergeArray.key] || []).slice();
      arr.push(mergeArray.item); ns[mergeArray.key] = arr;
    }
    if (patch) ns = Object.assign(ns, patch);
    const r = await pushState(MINI.roomId, ns, MINI.room.version);
    if (r.ok) { MINI.room = r.room; MINI.state = r.room.state; return true; }
    const room = await fetchRoom(MINI.roomId);
    if (!room || room.status !== 'playing') return false;
    MINI.room = room; MINI.state = room.state || {};
  }
  return false;
}
// 직렬화: 동시 pushPatch/appendFinish/endGame 가 같은 version 으로 CAS 충돌해 patch 가 유실되던 것 차단.
// 큐로 한 번에 하나씩 실행 → 각 호출이 직전 결과를 본 뒤 진행(순서·결과 보존).
function _pushStateRetry(patch, mergeArray) {
  const run = () => _pushStateRetryRaw(patch, mergeArray);
  const p = (MINI._writeQ || Promise.resolve()).then(run, run);   // 직전이 실패해도 다음은 실행
  MINI._writeQ = p.catch(() => {});                               // 큐 꼬리는 항상 resolved(미처리 거부 방지)
  return p;                                                       // 호출자는 실제 결과(boolean/throw) 수신
}
MINI.appendFinish = function (item) { return _pushStateRetry(null, { key: 'finishOrder', item }); };
MINI.pushPatch = function (patch) { return _pushStateRetry(patch, null); };
MINI.endGame = async function () {
  if (MINI._ended) return; MINI._ended = true;
  try {
    const patch = MINI.mod.finishPatch ? MINI.mod.finishPatch(MINI) : {};
    await _pushStateRetry(patch, null);                 // 권위필드(ranks/alive 등) 먼저 기록
    await finishGame(MINI.roomId, MINI.me.token, MINI.game);  // RPC 가 검증·정산·status=finished
  } catch (e) { console.error('endGame', e); MINI._ended = false; MINI._endRetryAt = performance.now() + 2000; }   // 단조 시계 게이트(시계 점프 무영향)
};

/* ----------------------------- 그리기 헬퍼 --------------------------- */
// 좌석 색(8인) — 캐릭터 단색
const SEAT_COLORS = ['#4f9dff','#ff5d5d','#43d18b','#f6c544','#b07cff','#ff8c42','#3ad0d6','#ff6fae'];
function seatColor(seat) { return SEAT_COLORS[((seat || 1) - 1) % SEAT_COLORS.length]; }
