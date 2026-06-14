/* =========================================================================
   davinci.js — "다빈치 코드" 정식 룰 (2~8인, 턴제 DOM, 타이머 없음)
   - 타일 26장: 검정 0~11, 흰색 0~11(각 12장) + 조커 2장(검/흰, 표시 '–').
   - 보유는 "내가 정한 순서"(오름차순 유지, 같은 숫자는 흑/백 어느 쪽도 가능, 조커는 와일드).
   - 색은 칩으로 보이므로 지목은 "숫자(0~11) 또는 조커"만 맞히면 됨.

   턴 진행(정식 룰):
     ① 산더미가 남아 있으면 반드시 1장 뽑는다(숨김 보유 = drawn).
     ② 뽑은 타일을 내 줄의 "정렬상 유효한 위치" 중 하나에 직접 끼워 넣는다(앞/뒤 선택 가능).
        - 같은 숫자가 있으면 그 양옆 모두 유효 → 흑3을 흰3 앞/뒤 중 택. 조커는 어디든.
        - 끼운 타일 = 이번 턴 '새 타일(fresh)'. 가린 채 둔다.
     ③ 상대의 가린 타일 1개를 골라 숫자(또는 조커)를 추리.
        맞으면 → 공개. 계속 추리 / 멈춤 선택. 멈추면 fresh 가린 채 확정, 턴 종료.
        틀리면 → 내 fresh 가 공개되어(산더미 비어 못 뽑았으면 내 가린 타일 1장 공개) 턴 종료.
     - 내 타일이 전부 공개되면 탈락. 마지막 생존 1명 우승.
   ⚠ 친구 신뢰 한계: 가린 값도 rooms.state 에 있고 화면 차원에서만 비공개(치트 클라 불가).

   app.js 기대 전역: davinciInitialState/davinciEnter/davinciOnRoom/davinciAct/davinciStop
   의존: net(pushState/fetchRoom/finishGame/serverNow), ui-core(app/esc/setScreen/toast/openSheet/closeSheet),
         tiers(tierForScore). app.js 전역 MEMBERS(중퇴 판별).
   ========================================================================= */

const DV = {
  on: false, room: null, roomId: null, state: null,
  me: null, mySeat: null, amSpectator: false, version: 0,
  busy: false,
  pick: null,   // 추리 대상 선택중: {seat, id}
};

/* ----------------------------- 결정론 PRNG ---------------------------- */
function dvRng(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 숫자 정렬: 오름차순, 같은 숫자면 검정(b) < 흰색(w). (시작 손패 자동 정렬용)
function dvCmp(a, b) { return (a.v - b.v) || ((a.c === 'b' ? 0 : 1) - (b.c === 'b' ? 0 : 1)); }

/* ----------------------------- 시작 state ---------------------------- */
function davinciInitialState(seated, scoresMap) {
  const seats = seated.map(m => m.seat);
  const n = seats.length;
  const seed = ((serverNow() & 0x7fffffff) ^ (n * 2654435761) ^ 0x0d) >>> 0;

  // 26장 덱: 0~11 검/흰 + 조커 검/흰
  const deck = []; let idc = 0;
  for (let v = 0; v <= 11; v++) { deck.push({ v, c: 'b', id: 't' + (idc++) }); deck.push({ v, c: 'w', id: 't' + (idc++) }); }
  deck.push({ v: 0, c: 'b', id: 't' + (idc++), j: true });
  deck.push({ v: 0, c: 'w', id: 't' + (idc++), j: true });
  const rng = dvRng(seed);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }

  const nStart = n <= 4 ? 4 : n <= 6 ? 3 : 2;
  const hands = {}, players = {}, names = {}, scores = {}, eliminated = {};
  seated.forEach(m => {
    players[m.seat] = m.user_id; names[m.seat] = m.name;
    scores[m.seat] = (scoresMap && scoresMap[m.seat]) || 0; eliminated[m.seat] = false;
    const drawn = []; for (let k = 0; k < nStart; k++) drawn.push({ ...deck.shift(), up: false });
    // 시작 정렬: 숫자 오름차순(흑<백), 조커는 시드 무작위 유효위치에 삽입
    const nums = drawn.filter(t => !t.j).sort(dvCmp);
    const hand = nums.slice();
    drawn.filter(t => t.j).forEach(jk => { const idx = Math.floor(rng() * (hand.length + 1)); hand.splice(idx, 0, jk); });
    hands[m.seat] = hand;
  });
  const pool = deck.map(t => ({ v: t.v, c: t.c, id: t.id, j: !!t.j }));

  return {
    game: 'davinci', seed, players, names, scores, n,
    turn: seats[0],
    hands, pool,
    drawn: null,     // 뽑았으나 아직 배치 안 한 타일
    fresh: null,     // 이번 턴 끼운 타일 id(틀리면 이게 공개)
    lastHit: false,
    eliminated, elimOrder: [], ranks: null, results: null, log: [],
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
  dvSkipDeparted();
  dvMaybeFinish();
}
function davinciOnRoom(room) {
  if (!DV.on || room.id !== DV.roomId) return;
  if (room.version != null && room.version < DV.version) return;
  const advanced = room.version == null || room.version > DV.version;   // 실제 새 수가 들어왔을 때만
  DV.room = room; DV.state = room.state || {};
  DV.version = room.version;
  if (advanced && DV.pick) { DV.pick = null; closeSheet(); }   // 멤버행 변동만으론 추리 시트 유지
  dvRender();
  dvSkipDeparted();
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
function dvNextSeat(s, from) {
  const seats = dvSeats(s);
  const i = seats.indexOf(Number(from));
  for (let k = 1; k <= seats.length; k++) { const cand = seats[(i + k) % seats.length]; if (dvAlive(s, cand)) return cand; }
  return from;
}
// 타일 T 를 hand 에 끼울 수 있는 유효 위치 index 목록(0..hand.length)
function dvValidGaps(hand, tile) {
  const gaps = [];
  for (let i = 0; i <= hand.length; i++) {
    if (tile.j) { gaps.push(i); continue; }                 // 조커는 어디든
    const left = hand[i - 1], right = hand[i];
    const okL = !left || left.j || left.v <= tile.v;
    const okR = !right || right.j || right.v >= tile.v;
    if (okL && okR) gaps.push(i);
  }
  return gaps;
}
// 표시용 칩. reveal=true 면 값 공개(내 패), 아니면 ? (공개된 것은 항상 값)
function dvTileFace(t, reveal) {
  const cls = t.c === 'b' ? 'dvt--black' : 'dvt--white';
  const shown = reveal || t.up;
  const face = !shown ? '?' : (t.j ? '–' : t.v);
  return `<span class="dvt ${cls}${(shown && t.j) ? ' dvt--joker' : ''}${t.up ? ' is-up' : ''}">${face}</span>`;   // 가린 조커는 색 표시 안 함(비밀)
}

/* ----------------------------- 렌더 ---------------------------------- */
function dvRender() {
  const s = DV.state; if (!s) return;
  if (s.ranks) return;   // 종료는 app.js 결과화면 처리
  const seats = dvSeats(s);
  const myTurn = dvIsMyTurn();
  const curName = s.names[Number(s.turn)] || ('좌석' + s.turn);
  const poolEmpty = (s.pool || []).length === 0;
  const drawStep  = myTurn && s.drawn == null && s.fresh == null && !poolEmpty;
  const placeStep = myTurn && s.drawn != null;
  const guessStep = myTurn && s.drawn == null && (s.fresh != null || poolEmpty);

  // 상대 패널 — 가린 타일은 (지목 단계일 때만) 탭해서 지목
  const oppoSeats = seats.filter(seat => seat !== DV.mySeat);
  const oppoHTML = oppoSeats.map(seat => {
    const dead = !dvAlive(s, seat);
    const hand = s.hands[seat] || [];
    const t = tierForScore((s.scores || {})[seat] || 0);
    const tilesHTML = hand.map(tile => {
      const tappable = guessStep && !dead && !tile.up;
      const selCls = (DV.pick && DV.pick.seat === seat && DV.pick.id === tile.id) ? 'is-pick' : '';
      return `<span class="dv-slot ${selCls}" ${tappable ? `data-act="dv_pick" data-seat="${seat}" data-id="${tile.id}"` : ''}>${dvTileFace(tile, false)}</span>`;
    }).join('');
    return `<li class="dv-oppo ${Number(s.turn) === seat ? 'is-turn' : ''} ${dead ? 'is-dead' : ''}">
      <div class="dv-oppo__head">
        <span class="dv-oppo__name tier-name" style="--tc:${t.color}">${esc(s.names[seat])}</span>
        ${dead ? '<span class="dv-dead">탈락</span>' : `<span class="dv-oppo__cnt">${hand.length}장</span>`}
      </div>
      <div class="dv-hand">${tilesHTML}</div>
    </li>`;
  }).join('');

  // 내 패(값 보임). 배치 단계면 끼울 자리 버튼을 사이사이에.
  let mineHTML = '';
  if (!DV.amSpectator && DV.mySeat != null) {
    const myHand = s.hands[DV.mySeat] || [];
    const myDead = !dvAlive(s, DV.mySeat);
    let handInner;
    if (placeStep) {
      const gaps = dvValidGaps(myHand, s.drawn);
      let h = '';
      for (let i = 0; i <= myHand.length; i++) {
        h += gaps.includes(i)
          ? `<button class="dv-gap" data-act="dv_place" data-gap="${i}">＋</button>`
          : `<span class="dv-gap dv-gap--no"></span>`;
        if (i < myHand.length) h += `<span class="dv-slot ${myHand[i].id === s.fresh ? 'is-fresh' : ''}">${dvTileFace(myHand[i], true)}</span>`;
      }
      handInner = h;
    } else {
      handInner = myHand.map(tile => `<span class="dv-slot ${tile.id === s.fresh ? 'is-fresh' : ''}">${dvTileFace(tile, true)}</span>`).join('');
    }
    mineHTML = `<div class="dv-mine ${myDead ? 'is-dead' : ''}">
      <div class="dv-mine__label">${myDead ? '내 패 (탈락)' : '내 패 (나만 값 보임 · 가린 건 상대에겐 ?)'}</div>
      <div class="dv-hand dv-hand--mine">${handInner}</div>
    </div>`;
  }

  // 액션 영역
  let action = '';
  if (DV.amSpectator) {
    action = `<div class="dv-note">👁 관전 중 — ${esc(curName)} 님의 차례</div>`;
  } else if (!dvAlive(s, DV.mySeat)) {
    action = `<div class="dv-note">탈락했어요. 다른 사람들의 승부를 지켜보세요.</div>`;
  } else if (drawStep) {
    action = `<div class="dv-actbar">
      <div class="dv-step">① 산더미에서 1장 뽑기</div>
      <button class="btn btn--primary btn--lg" data-act="dv_draw">🂠 뽑기 (남은 ${s.pool.length}장)</button>
    </div>`;
  } else if (placeStep) {
    action = `<div class="dv-actbar">
      <div class="dv-step">② 뽑은 타일 <span class="dv-drawn">${dvTileFace({ v: s.drawn.v, c: s.drawn.c, j: s.drawn.j }, true)}</span> 을 내 패의 <b>＋</b> 위치 중 한 곳에 끼우세요</div>
      <div class="dv-pickhint muted">같은 숫자면 앞/뒤 모두 선택 가능, 조커는 어디든</div>
    </div>`;
  } else if (guessStep) {
    const canStop = !!s.lastHit;
    action = `<div class="dv-actbar">
      <div class="dv-step">③ 상대의 가린 타일을 골라 추리하세요${poolEmpty ? ' <span class="muted">(산더미 빔)</span>' : ''}</div>
      ${canStop ? `<button class="btn btn--ghost btn--lg" data-act="dv_stop">멈추고 확정(턴 종료)</button>` : ''}
      <div class="dv-pickhint ${DV.pick ? 'is-armed' : 'muted'}">${DV.pick ? '선택됨 → 숫자/조커를 고르세요' : '위에서 ? 타일을 탭하세요'}</div>
    </div>`;
  } else {
    action = `<div class="dv-note">${esc(curName)} 님의 차례를 기다리는 중…</div>`;
  }

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

/* ----------------------------- 추리 시트(숫자/조커, 색은 칩으로 보임) --------- */
function dvOpenGuessSheet() {
  const nums = [];
  for (let v = 0; v <= 11; v++) nums.push(`<button class="dv-num" data-act="dv_guess" data-v="${v}">${v}</button>`);
  openSheet(`
    <h3 class="sheet__title">이 타일의 숫자를 추리하세요 (색은 보이는 그대로)</h3>
    <div class="dv-num-grid">${nums.join('')}</div>
    <button class="dv-num dv-num--joker" data-act="dv_guess" data-j="1">🃏 조커</button>
    <button class="btn btn--ghost btn--lg" data-act="dv_cancel">취소</button>
  `, () => {});
}

/* ----------------------------- 액션 라우팅 --------------------------- */
async function davinciAct(act, el) {
  if (!DV.on) return;
  switch (act) {
    case 'dv_draw': return dvDraw();
    case 'dv_place': return dvPlace(Number(el.dataset.gap));
    case 'dv_pick': {
      DV.pick = { seat: Number(el.dataset.seat), id: el.dataset.id };
      dvRender(); dvOpenGuessSheet(); return;
    }
    case 'dv_cancel': DV.pick = null; closeSheet(); dvRender(); return;
    case 'dv_guess': return dvGuess(el.dataset.j === '1' ? null : Number(el.dataset.v), el.dataset.j === '1');
    case 'dv_stop': return dvStop();
  }
}

/* ----------------------------- 수(手) 처리 --------------------------- */
async function dvCommit(mutator) {
  if (DV.busy) return false;
  DV.busy = true;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const base = dvDeep(DV.state);
      const ns = mutator(base);
      if (!ns) return false;
      const r = await pushState(DV.roomId, ns, DV.version);
      if (r.ok) { DV.room = r.room; DV.state = r.room.state; DV.version = r.room.version; return true; }
      const room = await fetchRoom(DV.roomId);
      if (!room || room.status !== 'playing') { DV.room = room; if (room) { DV.state = room.state; DV.version = room.version; } return false; }
      DV.room = room; DV.state = room.state || {}; DV.version = room.version;
    }
    toast('상태가 자주 바뀌었어요. 다시 시도하세요.');
    return false;
  } finally { DV.busy = false; }
}
function dvDeep(o) { return JSON.parse(JSON.stringify(o)); }
function dvLog(s, msg) { (s.log = s.log || []).push(msg); if (s.log.length > 20) s.log.shift(); }

// ① 뽑기
async function dvDraw() {
  if (!dvIsMyTurn()) return;
  const ok = await dvCommit(s => {
    if (Number(s.turn) !== Number(DV.mySeat)) return null;
    if (s.drawn != null || s.fresh != null) return null;
    if (!s.pool || s.pool.length === 0) return null;
    s.drawn = s.pool.shift();
    return s;
  });
  if (ok) dvRender();
}

// ② 배치(유효 위치 중 선택) → fresh
async function dvPlace(gap) {
  if (!dvIsMyTurn()) return;
  const ok = await dvCommit(s => {
    if (Number(s.turn) !== Number(DV.mySeat)) return null;
    if (s.drawn == null) return null;
    const hand = s.hands[DV.mySeat];
    const gaps = dvValidGaps(hand, s.drawn);
    if (!gaps.includes(gap)) return null;   // 무효 위치
    const tile = { v: s.drawn.v, c: s.drawn.c, id: s.drawn.id, j: !!s.drawn.j, up: false };
    hand.splice(gap, 0, tile);
    s.fresh = tile.id; s.drawn = null;
    return s;
  });
  if (ok) dvRender();
}

// ③ 지목
async function dvGuess(v, isJoker) {
  if (!dvIsMyTurn() || !DV.pick) { closeSheet(); return; }
  // 산더미 남았는데 아직 안 끼웠으면 지목 불가(뽑기→배치 강제)
  if (DV.state.drawn != null || (DV.state.fresh == null && (DV.state.pool || []).length > 0)) { closeSheet(); toast('먼저 뽑아서 내 패에 끼우세요'); return; }
  const pick = DV.pick;
  DV.pick = null; closeSheet();

  const ok = await dvCommit(s => {
    if (Number(s.turn) !== Number(DV.mySeat)) return null;
    const target = (s.hands[pick.seat] || []).find(t => t.id === pick.id);
    if (!target || target.up) return null;
    if (!dvAlive(s, pick.seat)) return null;

    const myName = s.names[DV.mySeat], opName = s.names[pick.seat];
    const guessLabel = isJoker ? '조커' : String(v);
    const hit = isJoker ? !!target.j : (!target.j && target.v === v);
    if (hit) {
      target.up = true; s.lastHit = true;
      dvLog(s, `🎯 ${myName} → ${opName}의 ${guessLabel} 적중!`);
      if ((s.hands[pick.seat] || []).every(t => t.up)) {
        s.eliminated[pick.seat] = true; (s.elimOrder = s.elimOrder || []).push(pick.seat);
        dvLog(s, `💥 ${opName} 탈락!`);
      }
    } else {
      s.lastHit = false;
      // 틀림 → 내 fresh 공개(없으면=산더미 빔: 가장 왼쪽 가린 타일 공개)
      let revealed = false;
      if (s.fresh != null) { const f = (s.hands[DV.mySeat] || []).find(t => t.id === s.fresh); if (f) { f.up = true; revealed = true; } }
      if (!revealed) { const hid = (s.hands[DV.mySeat] || []).filter(t => !t.up); if (hid.length) hid[0].up = true; }
      s.fresh = null;
      if ((s.hands[DV.mySeat] || []).every(t => t.up)) { s.eliminated[DV.mySeat] = true; (s.elimOrder = s.elimOrder || []).push(DV.mySeat); dvLog(s, `💥 ${myName} 탈락!`); }
      dvLog(s, `❌ ${myName} → ${opName}의 ${guessLabel} 빗나감`);
      dvEndTurn(s);
    }
    return s;
  });
  if (ok) { dvRender(); dvMaybeFinish(); }
}

// 멈추기: 적중 직후만. fresh 가린 채 확정, 턴 종료.
async function dvStop() {
  if (!dvIsMyTurn()) return;
  const ok = await dvCommit(s => {
    if (Number(s.turn) !== Number(DV.mySeat)) return null;
    if (!s.lastHit) return null;
    dvLog(s, `✋ ${s.names[DV.mySeat]} 멈춤`);
    dvEndTurn(s);
    return s;
  });
  if (ok) { dvRender(); dvMaybeFinish(); }
}

function dvEndTurn(s) {
  s.lastHit = false; s.drawn = null; s.fresh = null;
  if (dvAliveSeats(s).length > 1) s.turn = dvNextSeat(s, DV.mySeat);
}

/* ----------------------------- 중퇴 처리 ----------------------------- */
async function dvSkipDeparted() {
  const s = DV.state; if (!s || s.ranks || DV.amSpectator) return;
  const members = (typeof MEMBERS !== 'undefined') ? MEMBERS : [];
  const pres = (typeof presentIds !== 'undefined') ? presentIds : null;
  // 살아있음 = 멤버행 존재 AND (접속정보 모르면 통과 / 알면 접속중). 탭 닫힌 턴홀더(행 남아도 presence 빠짐)도 중퇴 처리.
  const isLive = uid => members.some(m => m.user_id === uid) && (!pres || pres.length === 0 || pres.includes(uid));
  const departed = dvAliveSeats(s).filter(seat => { const uid = (s.players || {})[seat]; return uid && !isLive(uid); });
  if (!departed.length) return;
  const live = dvAliveSeats(s).filter(seat => { const uid = (s.players || {})[seat]; return uid && isLive(uid); });
  if (!live.length || Number(live[0]) !== Number(DV.mySeat)) return;
  const ok = await dvCommit(base => {
    if (base.ranks) return null;
    let changed = false;
    departed.forEach(seat => {
      if (dvAlive(base, seat)) { base.eliminated[seat] = true; (base.elimOrder = base.elimOrder || []).push(seat); dvLog(base, `🚪 ${base.names[seat]} 중퇴 — 탈락 처리`); changed = true; }
    });
    if (!changed) return null;
    if (!dvAlive(base, Number(base.turn)) && dvAliveSeats(base).length > 1) { base.turn = dvNextSeat(base, Number(base.turn)); base.drawn = null; base.fresh = null; base.lastHit = false; }
    return base;
  });
  if (ok) { dvRender(); dvMaybeFinish(); }
}

/* ----------------------------- 종료/정산 ----------------------------- */
async function dvMaybeFinish() {
  const s = DV.state; if (!s || DV.amSpectator) return;
  if (s.ranks) { try { await finishGame(DV.roomId, DV.me.token, 'davinci'); } catch (e) {} return; }
  const alive = dvAliveSeats(s);
  if (alive.length > 1) return;
  const seats = dvSeats(s);
  const leader = alive.length ? alive[0] : seats[0];
  if (Number(leader) !== Number(DV.mySeat)) return;

  await dvCommit(base => {
    if (base.ranks) return null;
    const aliveNow = dvAliveSeats(base);
    if (aliveNow.length > 1) return null;
    const ranks = {}; const allSeats = dvSeats(base);
    aliveNow.forEach(seat => { ranks[seat] = 1; });
    let r = aliveNow.length ? 2 : 1;
    const elim = (base.elimOrder || []).slice();
    for (let i = elim.length - 1; i >= 0; i--) { if (ranks[elim[i]] == null) ranks[elim[i]] = r++; }
    allSeats.forEach(seat => { if (ranks[seat] == null) ranks[seat] = r++; });
    base.ranks = ranks; dvLog(base, `🏁 게임 종료`);
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
