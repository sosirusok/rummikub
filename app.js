/* =========================================================================
   app.js — UI / 드래그&드롭 / 게임 진행 글루 코드
   ========================================================================= */

/* ----------------------------- 신원 ------------------------------------ */
function getClientId() {
  let id = localStorage.getItem('rk_cid');
  if (!id) { id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('rk_cid', id); }
  return id;
}
const CID = getClientId();
let NAME = localStorage.getItem('rk_name') || '';

/* ----------------------------- 상태 ------------------------------------ */
let ROOM = null;        // room 행
let SEATS = [];         // seats 행 배열
let G = null;           // 게임 상태(state)
let mySeat = null;      // 내 자리(1~4) 또는 null
let work = null;        // { board, hands } — 내 턴 편집용 복제본
let turnStart = null;   // { board, rack } — 턴 시작 스냅샷
let dragging = null;
let busy = false;       // 네트워크 전송 중 중복 클릭 방지

const $ = sel => document.querySelector(sel);
const app = () => $('#app');

function isMyTurn() { return G && G.status === 'playing' && mySeat && Number(G.turn) === Number(mySeat); }
function cloneWork(state) { return { board: deepClone(state.board), hands: deepClone(state.hands) }; }

/* ----------------------------- 부팅 ------------------------------------ */
async function boot() {
  if (!configReady()) { renderSetupNeeded(); return; }
  initSupabase();
  subscribeAll(() => refresh());
  await refresh();
}

async function refresh() {
  const { room, seats } = await fetchAll();
  if (!room) { renderSetupNeeded('room 행이 없습니다. supabase_setup.sql 을 실행했는지 확인하세요.'); return; }
  ROOM = room;
  SEATS = seats;
  mySeat = (SEATS.find(s => s.player_id === CID) || {}).seat || null;

  if (room.status === 'waiting' || !room.state) {
    G = null; work = null; turnStart = null;
    renderLobby();
    maybeAutoStart();
  } else {
    const prevTurn = G ? Number(G.turn) : null;
    G = room.state;
    if (isMyTurn()) {
      // 내 턴이 새로 시작된 경우에만 편집본/스냅샷 초기화 (편집 중 덮어쓰기 방지)
      if (!work || prevTurn !== Number(mySeat)) {
        work = cloneWork(G);
        turnStart = { board: deepClone(G.board), rack: G.hands[mySeat].slice() };
      }
    } else {
      work = cloneWork(G);
    }
    renderGame();
  }
}

async function maybeAutoStart() {
  // 4자리가 다 차면 좌석을 가진 클라이언트가 딜을 시도.
  // startGame은 status='waiting'일 때만 성공하는 조건부 업데이트라
  // 여러 명이 동시에 시도해도 단 1명의 딜만 반영된다(누가 렉이어도 시작 보장).
  if (mySeat && SEATS.length === 4 && ROOM.status === 'waiting') {
    const state = dealNewGame([1, 2, 3, 4]);
    await startGame(state);              // 실시간으로 모두에게 전파됨
  }
}

/* ----------------------------- 로비 ------------------------------------ */
async function pickSeat(n) {
  if (busy) return;
  if (SEATS.some(s => s.seat === n)) { alert('이미 선택된 자리예요. 다른 번호를 골라주세요.'); return; }
  if (!NAME) {
    const v = prompt('닉네임을 입력하세요', '플레이어' + n);
    if (v === null) return;
    NAME = (v || ('플레이어' + n)).slice(0, 12);
    localStorage.setItem('rk_name', NAME);
  }
  busy = true;
  const r = await claimSeat(n, CID, NAME);
  busy = false;
  if (!r.ok) alert('이미 선택된 자리예요. 다른 번호를 골라주세요.');
  await refresh();
}

function renderLobby() {
  const taken = {};
  SEATS.forEach(s => taken[s.seat] = s);
  const count = SEATS.length;
  app().innerHTML = `
    <div class="lobby">
      <h1>🀄 루미큐브 <span class="sub">4인 실시간</span></h1>
      <p class="hint">플레이할 번호를 고르세요. 한 번호는 한 명만 가능하고, <b>4명이 다 차면 자동 시작</b>합니다.</p>
      <div class="seat-grid">
        ${[1, 2, 3, 4].map(n => {
          const t = taken[n];
          const mine = t && t.player_id === CID;
          return `<button class="seat-card ${t ? 'taken' : ''} ${mine ? 'mine' : ''}" ${t ? 'disabled' : ''} data-seat="${n}">
            <div class="seat-num">${n}</div>
            <div class="seat-name">${t ? esc(t.name || ('플레이어' + n)) + (mine ? ' (나)' : '') : '비어 있음'}</div>
          </button>`;
        }).join('')}
      </div>
      <div class="status-line">${count}/4 명 입장 ${count === 4 ? '— 시작하는 중…' : '— 나머지를 기다리는 중'}</div>
      ${mySeat ? `<button class="btn ghost small" id="leaveBtn">자리 비우기</button>` : ''}
      <button class="btn ghost small" id="resetBtn">방 초기화</button>
      <p class="share">친구들에게 이 페이지 주소를 공유하세요. (각자 다른 번호 선택)</p>
    </div>`;
  app().querySelectorAll('.seat-card:not([disabled])').forEach(b =>
    b.addEventListener('click', () => pickSeat(Number(b.dataset.seat))));
  const lb = $('#leaveBtn');
  if (lb) lb.addEventListener('click', async () => { await sbDeleteMySeat(); await refresh(); });
  $('#resetBtn').addEventListener('click', async () => { if (confirm('방을 초기화할까요? (모든 자리 비움)')) { await resetGame(); await refresh(); } });
}

async function sbDeleteMySeat() {
  if (mySeat) await sb.from('seats').delete().eq('seat', mySeat);
  NAME = NAME; // keep name
}

/* ----------------------------- 게임 ------------------------------------ */
function renderGame() {
  const myTurn = isMyTurn();
  const seatName = n => { const s = SEATS.find(x => x.seat === n); return s ? (s.name || ('플레이어' + n)) : ('플레이어' + n); };

  const players = [1, 2, 3, 4].map(n => {
    const cnt = (G.hands[n] || []).length;
    const turn = Number(G.turn) === n;
    const done = G.initialMeld[n];
    return `<div class="pchip ${turn ? 'turn' : ''} ${n === mySeat ? 'me' : ''}">
        <span class="pn">${n}</span>
        <span class="pname">${esc(seatName(n))}${n === mySeat ? ' (나)' : ''}</span>
        <span class="pcount">🁢 ${cnt}</span>
        ${done ? '<span class="pdone">첫등록✓</span>' : ''}
      </div>`;
  }).join('');

  const preview = previewNewPoints(G, mySeat, turnStart ? turnStart.board : G.board, work.board);
  const previewTxt = (myTurn && preview !== null) ? `<span class="prev">이번 턴 새 세트: ${preview}점${preview >= 30 ? ' ✓' : ' (30점 필요)'}</span>` : '';

  app().innerHTML = `
    <div class="game">
      <div class="topbar">
        <div class="players">${players}</div>
        <div class="poolinfo">남은 더미 <b>${G.pool.length}</b>장</div>
      </div>

      <div class="board" id="board"></div>

      <div class="tray">
        <div class="tray-head">
          <span class="myturn ${myTurn ? 'on' : ''}">${myTurn ? '🟢 내 차례입니다' : '⏳ ' + esc(seatName(Number(G.turn))) + ' 님 차례'}</span>
          ${previewTxt}
          <span class="spacer"></span>
          <button class="btn tiny" id="sortNum">숫자정렬</button>
          <button class="btn tiny" id="sortCol">색정렬</button>
        </div>
        <div class="rack" id="rack"></div>
        <div class="actions">
          <button class="btn" id="resetMove" ${myTurn ? '' : 'disabled'}>되돌리기</button>
          <button class="btn warn" id="drawBtn" ${myTurn ? '' : 'disabled'}>한 장 뽑기</button>
          <button class="btn primary" id="endBtn" ${myTurn ? '' : 'disabled'}>턴 종료</button>
        </div>
      </div>
    </div>`;

  renderBoard();
  renderRack();

  $('#sortNum').addEventListener('click', () => { sortRack('num'); });
  $('#sortCol').addEventListener('click', () => { sortRack('col'); });
  const rm = $('#resetMove'), db = $('#drawBtn'), eb = $('#endBtn');
  if (myTurn) {
    rm.addEventListener('click', () => { work = cloneWork(G); renderGame(); });
    db.addEventListener('click', onDraw);
    eb.addEventListener('click', onEndTurn);
  }

  if (G.status === 'finished') renderFinished();
}

function renderBoard() {
  const board = $('#board');
  board.innerHTML = '';
  work.board.forEach((meld, mi) => {
    const m = document.createElement('div');
    m.className = 'meld' + (meld.length >= 3 && !isValidMeld(meld) ? ' invalid' : '') + (isValidMeld(meld) ? ' valid' : '');
    m.dataset.mi = mi;
    meld.forEach(id => m.appendChild(makeTile(id, { type: 'meld', mi })));
    board.appendChild(m);
  });
  // 새 세트 드롭존
  const nm = document.createElement('div');
  nm.className = 'meld newmeld';
  nm.innerHTML = '<span>+ 새 세트</span>';
  board.appendChild(nm);
}

function renderRack() {
  const rack = $('#rack');
  rack.innerHTML = '';
  (work.hands[mySeat] || []).forEach(id => rack.appendChild(makeTile(id, { type: 'rack' })));
}

function makeTile(id, origin) {
  const t = TILES[id];
  const d = document.createElement('div');
  d.className = 'tile' + (t.joker ? ' joker' : '');
  d.dataset.id = id;
  if (t.joker) d.innerHTML = '<span class="jf">😊</span>';
  else { d.textContent = t.num; d.style.color = COLOR_HEX[t.color]; }
  if (isMyTurn()) {
    d.classList.add('grab');
    d.addEventListener('pointerdown', e => startDrag(d, e));
  }
  return d;
}

function sortRack(mode) {
  const arr = work.hands[mySeat].slice();
  arr.sort((a, b) => {
    const ta = TILES[a], tb = TILES[b];
    if (ta.joker) return 1; if (tb.joker) return -1;
    if (mode === 'num') return ta.num - tb.num || COLORS.indexOf(ta.color) - COLORS.indexOf(tb.color);
    return COLORS.indexOf(ta.color) - COLORS.indexOf(tb.color) || ta.num - tb.num;
  });
  work.hands[mySeat] = arr;
  renderRack();
}

/* --------------------------- 드래그&드롭 -------------------------------- */
function startDrag(el, e) {
  if (!isMyTurn() || busy) return;
  e.preventDefault();
  const id = el.dataset.id;
  const clone = el.cloneNode(true);
  clone.classList.add('drag-clone');
  document.body.appendChild(clone);
  const rect = el.getBoundingClientRect();
  const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
  el.classList.add('dragging');

  function move(ev) {
    clone.style.left = (ev.clientX - offX) + 'px';
    clone.style.top = (ev.clientY - offY) + 'px';
    highlight(ev.clientX, ev.clientY);
  }
  function up(ev) {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    clone.style.display = 'none';
    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    clone.remove();
    clearHighlight();
    handleDrop(id, target, ev.clientX);
  }
  move(e);
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function highlight(x, y) {
  clearHighlight();
  const el = document.elementFromPoint(x, y);
  const zone = el && el.closest('.meld, #rack');
  if (zone) zone.classList.add('drop-hi');
}
function clearHighlight() { document.querySelectorAll('.drop-hi').forEach(e => e.classList.remove('drop-hi')); }

function removeFromWork(id) {
  for (const m of work.board) { const i = m.indexOf(id); if (i >= 0) { m.splice(i, 1); return; } }
  const r = work.hands[mySeat]; const i = r.indexOf(id); if (i >= 0) r.splice(i, 1);
}

function computeInsertIndex(meldEl, x, draggedId) {
  const tiles = [...meldEl.querySelectorAll('.tile')].filter(t => t.dataset.id !== draggedId);
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect();
    if (x < r.left + r.width / 2) return i;
  }
  return tiles.length;
}

function handleDrop(id, target, x) {
  const meldEl = target && target.closest('.meld');
  const rackEl = target && target.closest('#rack');
  if (!meldEl && !rackEl) { renderGame(); return; }   // 유효 영역 아니면 원위치

  removeFromWork(id);
  if (meldEl) {
    let mi;
    if (meldEl.classList.contains('newmeld')) { work.board.push([]); mi = work.board.length - 1; }
    else mi = Number(meldEl.dataset.mi);
    const idx = computeInsertIndex(meldEl, x, id);
    work.board[mi].splice(idx, 0, id);
  } else {
    work.hands[mySeat].push(id);
  }
  work.board = work.board.filter(m => m.length > 0);   // 빈 세트 정리
  renderGame();
}

/* --------------------------- 턴 액션 ------------------------------------ */
async function onEndTurn() {
  if (busy) return;
  const cur = work.board.filter(m => m.length > 0);
  const res = validateTurn(G, mySeat, turnStart.board, cur, turnStart.rack, work.hands[mySeat]);
  if (!res.ok) { alert(res.msg); return; }

  const s = deepClone(G);
  s.board = cur;
  s.hands[mySeat] = work.hands[mySeat].slice();
  if (!s.initialMeld[mySeat]) s.initialMeld[mySeat] = true;
  if (s.hands[mySeat].length === 0) { s.status = 'finished'; s.winner = mySeat; }
  else s.turn = nextSeat(s, mySeat);

  await commit(s);
}

async function onDraw() {
  if (busy) return;
  if (work.board.filter(m => m.length).flat().length !== turnStart.board.flat().length) {
    if (!confirm('내려놓은 타일이 있어요. 모두 되돌리고 한 장 뽑을까요?')) return;
  }
  const s = deepClone(G);                 // 보드는 서버 상태 그대로 (편집분 폐기)
  if (s.pool.length > 0) s.hands[mySeat].push(s.pool.shift());
  s.turn = nextSeat(s, mySeat);
  await commit(s);
}

async function commit(state) {
  busy = true;
  const r = await pushState(state, ROOM.version);
  busy = false;
  if (!r.ok) { alert('동기화 충돌이 발생했어요. 화면을 새로고침합니다.'); }
  await refresh();
}

/* --------------------------- 종료 화면 ---------------------------------- */
function renderFinished() {
  const seatName = n => { const s = SEATS.find(x => x.seat === n); return s ? (s.name || ('플레이어' + n)) : ('플레이어' + n); };
  const rows = [1, 2, 3, 4].map(n => {
    const sc = handScore(G.hands[n] || []);
    return `<tr class="${n === G.winner ? 'win' : ''}"><td>${esc(seatName(n))}</td><td>${n === G.winner ? '🏆 승리' : '-' + sc + '점'}</td></tr>`;
  }).join('');
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal">
      <h2>🎉 ${esc(seatName(G.winner))} 님 승리!</h2>
      <table class="score">${rows}</table>
      <button class="btn primary" id="newGame">새 게임</button>
    </div>`;
  app().appendChild(ov);
  $('#newGame').addEventListener('click', async () => { await resetGame(); await refresh(); });
}

/* ----------------------------- 기타 ------------------------------------ */
function renderSetupNeeded(extra) {
  app().innerHTML = `<div class="lobby"><h1>🀄 루미큐브</h1>
    <p class="hint">Supabase 설정이 필요합니다. <code>config.js</code> 의 URL/anon key를 채우고,
    <code>supabase_setup.sql</code> 을 SQL Editor에서 한 번 실행하세요.</p>
    ${extra ? `<p class="hint warn-text">${esc(extra)}</p>` : ''}</div>`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

window.addEventListener('DOMContentLoaded', boot);
