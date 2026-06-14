/* =========================================================================
   davinci.js — "다빈치 코드" 풍 추리 보드게임 (2~8인, 턴제 DOM)
   - 루미큐브처럼 rooms.state + 버전 CAS(pushState) 로 진행. 타이머 없음.
   - 캔버스/미니코어 미사용. setScreen('davinci') 한 화면을 매 수마다 재렌더.
   - 결정론 무작위: state.seed 기반 mulberry32 셔플(시작 클라가 1회 딜).
     ⚠ JS 내장 Math.random 금지.

   규칙 요약
   - 타일 24장: 검정 0~11, 흰색 0~11. 같은 숫자면 검정<흰색 으로 오름차순 정렬해 보유.
   - 시작 보유 nStart = n<=4?4 : n<=6?3 : 2. 나머지는 산더미(pool).
   - 턴: ①산더미에서 1장 뽑아 숨김 보유(drawn) ②상대 가린 타일 1개의
     위치+숫자(색 포함)를 추리해 지목.
       맞으면 → 그 타일 공개(up=true). 계속 추리할지/멈출지 선택.
         멈추면 뽑은 타일을 가린 채(up=false) 손에 정렬 편입하고 턴 종료.
       틀리면 → 내가 뽑은 타일이 공개(up=true)되어 손에 편입되고 턴 종료.
   - 내 타일 전부 공개되면 탈락. 마지막 생존자 1명이 우승.

   ⚠ 친구 신뢰 한계: 가린 숫자(v,c)도 rooms.state 에 들어있어 화면 차원에서만
     비공개 처리한다(루미큐브 손패와 동일 한계). 치트 클라는 막지 못함.

   app.js 가 기대하는 인터페이스(전역): davinciInitialState / davinciEnter /
     davinciOnRoom / davinciAct / davinciStop
   의존: net.js(pushState/fetchRoom/finishGame/serverNow),
         ui-core(app/esc/setScreen/toast/openSheet/closeSheet),
         tiers(nameHTML/tierForScore/GAME_NAME).
   ========================================================================= */

const DV = {
  on: false, room: null, roomId: null, state: null,
  me: null, mySeat: null, amSpectator: false, version: 0,
  busy: false,
  pick: null,   // 추리 대상 선택중: {seat, idx}
};

/* ----------------------------- 결정론 PRNG ---------------------------- */
// mini-core 와 동일 계열(mulberry32). 시드 셔플 전용.
function dvRng(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 정렬 규칙: 숫자 오름차순, 같은 숫자면 검정(b) < 흰색(w)
function dvCmp(a, b) { return (a.v - b.v) || ((a.c === 'b' ? 0 : 1) - (b.c === 'b' ? 0 : 1)); }
function dvSortHand(hand) { return hand.slice().sort(dvCmp); }

/* ----------------------------- 시작 state ---------------------------- */
// app.js 의 doStart 가 호출: davinciInitialState(seated, scoresMap)
//   seated: [{seat, user_id, name}, ...] (좌석 오름차순),
//   scoresMap: {seat: score}
function davinciInitialState(seated, scoresMap) {
  const seats = seated.map(m => m.seat);
  const n = seats.length;
  const seed = ((serverNow() & 0x7fffffff) ^ (n * 2654435761) ^ 0x0d) >>> 0;

  // 24장 덱 생성 후 시드 셔플(Fisher–Yates)
  const deck = []; let idc = 0;
  for (let v = 0; v <= 11; v++) { deck.push({ v, c: 'b', id: 't' + (idc++) }); deck.push({ v, c: 'w', id: 't' + (idc++) }); }
  const rng = dvRng(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }

  const nStart = n <= 4 ? 4 : n <= 6 ? 3 : 2;
  const hands = {}, players = {}, names = {}, scores = {}, eliminated = {};
  seated.forEach(m => {
    players[m.seat] = m.user_id;
    names[m.seat] = m.name;
    scores[m.seat] = (scoresMap && scoresMap[m.seat]) || 0;
    eliminated[m.seat] = false;
    const hand = [];
    for (let k = 0; k < nStart; k++) hand.push({ ...deck.shift(), up: false });
    hands[m.seat] = dvSortHand(hand);   // 정렬 보유
  });
  const pool = deck.map(t => ({ v: t.v, c: t.c, id: t.id }));   // 나머지 산더미(up 없음)

  return {
    game: 'davinci', seed, players, names, scores, n,
    turn: seats[0],            // 좌석 오름차순 첫 좌석부터
    hands, pool,
    drawn: null,               // 이번 턴 뽑은 타일 {v,c} (지목 전 임시 보유)
    eliminated,
    elimOrder: [],             // 탈락 순서(먼저→나중). 순위 산정용.
    ranks: null, results: null,
    log: [],
  };
}

/* ----------------------------- 진입/렌더 ----------------------------- */
function davinciEnter(room, me, mySeat, amSpectator) {
  DV.on = true;
  DV.room = room; DV.roomId = room.id; DV.state = room.state || {};
  DV.version = room.version;
  DV.me = me; DV.mySeat = mySeat; DV.amSpectator = amSpectator;
  DV.pick = null;
  setScreen('davinci');
  dvRender();
  // 게임 종료 판정(생존 1명) — 어느 클라든 발견하면 정산 시도(멱등)
  dvMaybeFinish();
}

function davinciOnRoom(room) {
  if (!DV.on || room.id !== DV.roomId) return;
  // version 가드: 더 최신만 반영(되감기 방지)
  if (room.version != null && room.version < DV.version) return;
  DV.room = room; DV.state = room.state || {};
  DV.version = room.version;
  // 진행 중 상대 수가 들어오면 내 선택 시트는 닫는다(상태 변동)
  if (DV.pick) { DV.pick = null; closeSheet(); }
  dvRender();
  dvMaybeFinish();
}

function davinciStop() {
  DV.on = false; DV.pick = null;
  DV.room = DV.state = null; DV.roomId = null;
}

/* ----------------------------- 헬퍼 ---------------------------------- */
function dvSeats(s) { return Object.keys(s.players || {}).map(Number).sort((a, b) => a - b); }
function dvAlive(s, seat) { return !((s.eliminated || {})[seat]); }
function dvAliveSeats(s) { return dvSeats(s).filter(seat => dvAlive(s, seat)); }
function dvIsMyTurn() {
  const s = DV.state;
  return s && DV.mySeat != null && Number(s.turn) === Number(DV.mySeat) && dvAlive(s, DV.mySeat) && !s.ranks;
}
// 다음 생존 좌석(현재 좌석 다음부터 순환)
function dvNextSeat(s, from) {
  const seats = dvSeats(s);
  const i = seats.indexOf(Number(from));
  for (let k = 1; k <= seats.length; k++) {
    const cand = seats[(i + k) % seats.length];
    if (dvAlive(s, cand)) return cand;
  }
  return from;
}
function dvTileFace(t) {
  // 검정 타일=어두운 칩, 흰색 타일=밝은 칩. data-act 없는 표시용.
  const cls = t.c === 'b' ? 'dvt--black' : 'dvt--white';
  return `<span class="dvt ${cls} ${t.up ? 'is-up' : ''}">${t.up || t.mine ? t.v : '?'}</span>`;
}

/* ----------------------------- 렌더 ---------------------------------- */
function dvRender() {
  const s = DV.state; if (!s) return;
  if (s.ranks) { return; }   // 종료는 app.js 결과화면이 처리(refreshRoom)
  const seats = dvSeats(s);
  const myTurn = dvIsMyTurn();
  const curName = s.names[Number(s.turn)] || ('좌석' + s.turn);

  // 상대 패널(나/관전 제외 모두) — 가린 타일은 탭해서 지목
  const oppoSeats = seats.filter(seat => seat !== DV.mySeat);
  const oppoHTML = oppoSeats.map(seat => {
    const dead = !dvAlive(s, seat);
    const hand = s.hands[seat] || [];
    const t = tierForScore((s.scores || {})[seat] || 0);
    const tilesHTML = hand.map((tile, idx) => {
      // 화면 비공개: 남의 가린 타일은 숫자 숨김. 공개된 것만 숫자.
      const shown = { v: tile.v, c: tile.c, up: tile.up, mine: false };
      const tappable = myTurn && !dead && !tile.up;   // 내 차례에 가린 타일만 지목
      const selCls = (DV.pick && DV.pick.seat === seat && DV.pick.id === tile.id) ? 'is-pick' : '';
      return `<span class="dv-slot ${selCls}" ${tappable ? `data-act="dv_pick" data-seat="${seat}" data-id="${tile.id}"` : ''}>${dvTileFace(shown)}</span>`;
    }).join('');
    return `<li class="dv-oppo ${Number(s.turn) === seat ? 'is-turn' : ''} ${dead ? 'is-dead' : ''}">
      <div class="dv-oppo__head">
        <span class="dv-oppo__name tier-name" style="--tc:${t.color}">${esc(s.names[seat])}</span>
        ${dead ? '<span class="dv-dead">탈락</span>' : `<span class="dv-oppo__cnt">${hand.length}장</span>`}
      </div>
      <div class="dv-hand">${tilesHTML}</div>
    </li>`;
  }).join('');

  // 내 손패(숫자 보임). 관전자는 내 손패 없음.
  let mineHTML = '';
  if (!DV.amSpectator && DV.mySeat != null) {
    const myHand = s.hands[DV.mySeat] || [];
    const myDead = !dvAlive(s, DV.mySeat);
    mineHTML = `<div class="dv-mine ${myDead ? 'is-dead' : ''}">
      <div class="dv-mine__label">${myDead ? '내 패 (탈락)' : '내 패 (나만 숫자 보임)'}</div>
      <div class="dv-hand dv-hand--mine">${myHand.map(tile => dvTileFace({ v: tile.v, c: tile.c, up: tile.up, mine: true })).join('')}</div>
    </div>`;
  }

  // 액션 영역
  let action = '';
  if (DV.amSpectator) {
    action = `<div class="dv-note">👁 관전 중 — ${esc(curName)} 님의 차례</div>`;
  } else if (!dvAlive(s, DV.mySeat)) {
    action = `<div class="dv-note">탈락했어요. 다른 사람들의 승부를 지켜보세요.</div>`;
  } else if (myTurn) {
    if (s.drawn == null && s.pool.length > 0) {
      // ① 뽑기 단계
      action = `<div class="dv-actbar">
        <div class="dv-step">① 산더미에서 1장 뽑기</div>
        <button class="btn btn--primary btn--lg" data-act="dv_draw">🂠 뽑기 (남은 ${s.pool.length}장)</button>
      </div>`;
    } else {
      // ② 지목 단계 (산더미 비었으면 뽑기 없이 바로 지목)
      const drawnHTML = s.drawn ? `<span class="dv-drawn">뽑은 타일: ${dvTileFace({ v: s.drawn.v, c: s.drawn.c, up: true, mine: true })}</span>`
        : `<span class="dv-drawn muted">산더미가 비어 바로 지목해요</span>`;
      const canStop = !!s.lastHit;   // 직전 지목이 적중했을 때만 멈추기 가능
      action = `<div class="dv-actbar">
        <div class="dv-step">② 상대의 가린 타일을 골라 추리하세요${drawnHTML}</div>
        ${canStop ? `<button class="btn btn--ghost btn--lg" data-act="dv_stop">멈추고 손에 넣기</button>` : ''}
        <div class="dv-pickhint ${DV.pick ? 'is-armed' : 'muted'}">${DV.pick ? '선택됨 → 숫자/색을 고르세요' : '위에서 ? 타일을 탭하세요'}</div>
      </div>`;
    }
  } else {
    action = `<div class="dv-note">${esc(curName)} 님의 차례를 기다리는 중…</div>`;
  }

  // 최근 로그(최대 4줄)
  const logHTML = (s.log || []).slice(-4).reverse().map(l => `<li>${esc(l)}</li>`).join('');

  app().innerHTML = `
    <section class="screen screen--davinci">
      <header class="topbar">
        <div class="turn-pill ${myTurn ? 'is-mine' : ''}">${myTurn ? '내 차례' : esc(curName) + ' 차례'}</div>
        <span class="room-tag">방${DV.roomId}·🂠${s.pool.length}</span>
        <span class="dv-alive">생존 ${dvAliveSeats(s).length}/${s.n}</span>
        <button class="btn btn--ghost" data-act="leave" style="margin-left:6px">나가기</button>
      </header>
      <ul class="dv-oppos grow scrollable">${oppoHTML}</ul>
      ${logHTML ? `<ul class="dv-log">${logHTML}</ul>` : ''}
      ${mineHTML}
      <footer class="dv-foot">${action}</footer>
    </section>`;
}

/* ----------------------------- 추리 시트 ----------------------------- */
// 대상 슬롯 선택 후, 숫자(0~11)+색(검/흰) 고르는 바텀시트
function dvOpenGuessSheet() {
  const nums = [];
  for (let v = 0; v <= 11; v++) nums.push(`<button class="dv-num" data-act="dv_guess" data-v="${v}" data-c="b">${v}</button>`);
  const numsW = [];
  for (let v = 0; v <= 11; v++) numsW.push(`<button class="dv-num dv-num--w" data-act="dv_guess" data-v="${v}" data-c="w">${v}</button>`);
  openSheet(`
    <h3 class="sheet__title">이 타일의 숫자와 색을 추리하세요</h3>
    <div class="dv-guess-grp"><div class="dv-guess-lab">⚫ 검정</div><div class="dv-num-grid">${nums.join('')}</div></div>
    <div class="dv-guess-grp"><div class="dv-guess-lab">⚪ 흰색</div><div class="dv-num-grid">${numsW.join('')}</div></div>
    <button class="btn btn--ghost btn--lg" data-act="dv_cancel">취소</button>
  `, () => { /* 시트 닫힘 시 선택 유지(다시 탭 가능) */ });
}

/* ----------------------------- 액션 라우팅 --------------------------- */
// app.js handleAct 가 "dv_" 접두 액션을 davinciAct(act, el) 로 전달.
async function davinciAct(act, el) {
  if (!DV.on) return;
  switch (act) {
    case 'dv_draw': return dvDraw();
    case 'dv_pick': {
      DV.pick = { seat: Number(el.dataset.seat), id: el.dataset.id };
      dvRender();
      dvOpenGuessSheet();
      return;
    }
    case 'dv_cancel': DV.pick = null; closeSheet(); dvRender(); return;
    case 'dv_guess': return dvGuess(Number(el.dataset.v), el.dataset.c);
    case 'dv_stop': return dvStop();
  }
}

/* ----------------------------- 수(手) 처리 --------------------------- */
// 공통 CAS 커밋: deepClone→변형(mutator)→pushState. 실패 시 refetch 후 재시도.
async function dvCommit(mutator) {
  if (DV.busy) return false;
  DV.busy = true;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const base = dvDeep(DV.state);
      const ns = mutator(base);
      if (!ns) { return false; }   // mutator 가 무효 판정
      const r = await pushState(DV.roomId, ns, DV.version);
      if (r.ok) { DV.room = r.room; DV.state = r.room.state; DV.version = r.room.version; return true; }
      // 충돌: 최신 방 다시 읽고 재시도
      const room = await fetchRoom(DV.roomId);
      if (!room || room.status !== 'playing') { DV.room = room; if (room) { DV.state = room.state; DV.version = room.version; } return false; }
      DV.room = room; DV.state = room.state || {}; DV.version = room.version;
    }
    toast('상태가 자주 바뀌었어요. 다시 시도하세요.');
    return false;
  } finally { DV.busy = false; }
}
// deepClone (구조적 복제; net/engine 의 deepClone 의존 안 하려고 자급)
function dvDeep(o) { return JSON.parse(JSON.stringify(o)); }

function dvLog(s, msg) { (s.log = s.log || []).push(msg); if (s.log.length > 20) s.log.shift(); }

// ① 산더미에서 1장 뽑기 (숨김 보유: state.drawn)
async function dvDraw() {
  if (!dvIsMyTurn()) return;
  const ok = await dvCommit(s => {
    if (Number(s.turn) !== Number(DV.mySeat)) return null;
    if (s.drawn != null) return null;
    if (!s.pool || s.pool.length === 0) return null;
    s.drawn = s.pool.shift();
    return s;
  });
  if (ok) dvRender();
}

// ② 지목: 선택한 상대 타일의 (v,c) 추리
async function dvGuess(v, c) {
  if (!dvIsMyTurn() || !DV.pick) { closeSheet(); return; }
  const pick = DV.pick;
  DV.pick = null; closeSheet();

  const ok = await dvCommit(s => {
    if (Number(s.turn) !== Number(DV.mySeat)) return null;
    const target = (s.hands[pick.seat] || []).find(t => t.id === pick.id);   // 안정적 id 로 지목(정렬·CAS 변동에도 동일 타일)
    if (!target || target.up) return null;            // 이미 공개됐거나 사라짐 → 무효
    if (!dvAlive(s, pick.seat)) return null;

    const myName = s.names[DV.mySeat], opName = s.names[pick.seat];
    const colLab = c === 'b' ? '검정' : '흰색';
    const hit = (target.v === v && target.c === c);
    if (hit) {
      target.up = true;                                // 적중 → 공개
      s.lastHit = true;                                // 계속/멈춤 선택 가능
      dvLog(s, `🎯 ${myName} → ${opName}의 ${colLab} ${v} 적중!`);
      // 상대가 전부 공개되면 탈락 처리
      if ((s.hands[pick.seat] || []).every(t => t.up)) {
        s.eliminated[pick.seat] = true;
        (s.elimOrder = s.elimOrder || []).push(pick.seat);
        dvLog(s, `💥 ${opName} 탈락!`);
      }
      // 적중해도 더 추리할 수 있으므로 turn 유지(멈추기/추가지목은 다음 액션)
    } else {
      // 빗나감 → 내가 뽑은 타일 공개되어 손에 편입(턴 종료). 산더미 비면 내 가린 타일 1장을 대신 공개.
      s.lastHit = false;
      if (s.drawn != null) {
        const got = { v: s.drawn.v, c: s.drawn.c, id: s.drawn.id, up: true };
        s.hands[DV.mySeat].push(got);
        s.hands[DV.mySeat] = dvSortHand(s.hands[DV.mySeat]);
        s.drawn = null;
      } else {
        const hid = s.hands[DV.mySeat].filter(t => !t.up);   // 산더미 소진: 가장 왼쪽 가린 타일 공개(결정론)
        if (hid.length) hid[0].up = true;
      }
      if (s.hands[DV.mySeat].every(t => t.up)) { s.eliminated[DV.mySeat] = true; (s.elimOrder = s.elimOrder || []).push(DV.mySeat); dvLog(s, `💥 ${myName} 탈락!`); }
      dvLog(s, `❌ ${myName} → ${opName}의 ${colLab} ${v} 빗나감`);
      dvEndTurn(s);
    }
    return s;
  });
  if (ok) { dvRender(); dvMaybeFinish(); }
}

// 멈추기: 직전 적중 후 선택. 뽑은 타일을 가린 채 손에 넣고 턴 종료.
async function dvStop() {
  if (!dvIsMyTurn()) return;
  const ok = await dvCommit(s => {
    if (Number(s.turn) !== Number(DV.mySeat)) return null;
    if (!s.lastHit) return null;                       // 적중 직후에만 멈춤 가능
    if (s.drawn != null) {
      const got = { v: s.drawn.v, c: s.drawn.c, id: s.drawn.id, up: false };   // 가린 채 보유
      s.hands[DV.mySeat].push(got);
      s.hands[DV.mySeat] = dvSortHand(s.hands[DV.mySeat]);
      s.drawn = null;
    }
    dvLog(s, `✋ ${s.names[DV.mySeat]} 멈춤`);
    dvEndTurn(s);
    return s;
  });
  if (ok) { dvRender(); dvMaybeFinish(); }
}

// 턴 종료 공통: lastHit 초기화 + 다음 생존자에게 차례
function dvEndTurn(s) {
  s.lastHit = false;
  s.drawn = null;
  // 생존 1명이면 차례 이동 의미 없음(정산은 dvMaybeFinish)
  if (dvAliveSeats(s).length > 1) s.turn = dvNextSeat(s, DV.mySeat);
}

/* ----------------------------- 종료/정산 ----------------------------- */
// 생존 1명이면 ranks 채워 pushState 후 finishGame 호출(멱등).
// ranks: {seat:rank} — 생존=1위, 나머지는 탈락 역순(나중에 탈락할수록 상위).
async function dvMaybeFinish() {
  const s = DV.state; if (!s || DV.amSpectator) return;
  if (s.ranks) {                                       // 이미 ranks 있음 → 정산만(멱등)
    try { await finishGame(DV.roomId, DV.me.token, 'davinci'); } catch (e) {}
    return;
  }
  const alive = dvAliveSeats(s);
  if (alive.length > 1) return;                        // 아직 진행 중
  // 정산 주도: 가장 낮은 좌석의 생존자(또는 생존자 없으면 최저 좌석)가 1회 기록
  const seats = dvSeats(s);
  const leader = alive.length ? alive[0] : seats[0];
  if (Number(leader) !== Number(DV.mySeat)) return;    // 다른 사람이 기록하도록

  await dvCommit(base => {
    if (base.ranks) return null;                       // 경합: 이미 누가 채웠으면 패스
    const aliveNow = dvAliveSeats(base);
    if (aliveNow.length > 1) return null;              // 상태 변동
    // 생존자=1위, 탈락자들은 '나중에 탈락할수록 상위'(elimOrder 역순)로 서로 다른 순위 부여.
    const ranks = {};
    const allSeats = dvSeats(base);
    aliveNow.forEach(seat => { ranks[seat] = 1; });                 // 생존자=1위
    let r = aliveNow.length ? 2 : 1;
    const elim = (base.elimOrder || []).slice();                   // 먼저탈락 → 나중탈락
    for (let i = elim.length - 1; i >= 0; i--) { if (ranks[elim[i]] == null) ranks[elim[i]] = r++; }  // 나중 탈락일수록 상위
    allSeats.forEach(seat => { if (ranks[seat] == null) ranks[seat] = r++; });  // 안전망
    base.ranks = ranks;
    dvLog(base, `🏁 게임 종료`);
    return base;
  });
  try { await finishGame(DV.roomId, DV.me.token, 'davinci'); } catch (e) {}
}

/* ----------------------------- 전역 노출 ----------------------------- */
window.davinciInitialState = davinciInitialState;
window.davinciEnter = davinciEnter;
window.davinciOnRoom = davinciOnRoom;
window.davinciAct = davinciAct;
window.davinciStop = davinciStop;
