/* =========================================================================
   engine.js — 루미큐브 룰 엔진 (백엔드 무관, 순수 로직)
   - 타일 생성/셔플/딜
   - 세트(그룹/런) 검증 + 점수 계산 (조커 와일드 포함)
   - 턴 검증 (첫 등록 30점, 보드 조작 규칙)
   ========================================================================= */

const COLORS = ['black', 'red', 'blue', 'orange'];
const COLOR_HEX = { black: '#1b1b1b', red: '#d4282a', blue: '#1456b8', orange: '#e08a16' };
const COLOR_KR = { black: '검정', red: '빨강', blue: '파랑', orange: '주황' };

// 모든 타일 정의 (1~13 × 4색 × 2벌 = 104 + 조커 2 = 106)
function buildTiles() {
  const t = {};
  for (const copy of [0, 1]) {
    for (const c of COLORS) {
      for (let n = 1; n <= 13; n++) {
        const id = `${c}_${n}_${copy}`;
        t[id] = { id, color: c, num: n, joker: false };
      }
    }
  }
  t['joker_0'] = { id: 'joker_0', joker: true };
  t['joker_1'] = { id: 'joker_1', joker: true };
  return t;
}
const TILES = buildTiles();
const ALL_TILE_IDS = Object.keys(TILES);

function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 새 게임 딜 (각자 14장)
function dealNewGame(seatNumbers) {
  const pool = shuffle(ALL_TILE_IDS);
  const hands = {};
  for (const s of seatNumbers) hands[s] = pool.splice(0, 14);
  return {
    board: [],                                   // [[id,id,...], ...]  각 세트
    hands,                                        // { seat: [id,...] }
    pool,                                         // 산(山) 더미
    turn: Math.min(...seatNumbers),               // 가장 낮은 번호부터
    initialMeld: Object.fromEntries(seatNumbers.map(s => [s, false])),
    status: 'playing',
    winner: null,
  };
}

/* --------------------------- 세트 검증 ---------------------------------- */
// 반환: { ok, type:'group'|'run', points }
function classify(ids) {
  const tiles = ids.map(id => TILES[id]);
  if (tiles.length < 3) return { ok: false };
  const reals = tiles.filter(t => !t.joker);

  // 1) 그룹: 같은 숫자, 서로 다른 색, 3~4장
  if (tiles.length <= 4 && reals.length > 0) {
    const nums = new Set(reals.map(t => t.num));
    const colors = reals.map(t => t.color);
    if (nums.size === 1 && new Set(colors).size === colors.length) {
      const n = reals[0].num;
      return { ok: true, type: 'group', points: n * tiles.length };
    }
  }

  // 2) 런: 같은 색, 연속 숫자 (조커가 빈칸 채움). 순서 그대로 해석.
  if (reals.length > 0) {
    const col = reals[0].color;
    if (reals.every(t => t.color === col)) {
      // 첫 실제타일로 시작값(base) 결정 → 위치 i 의 숫자 = base + i
      let base = null;
      for (let i = 0; i < tiles.length; i++) {
        if (!tiles[i].joker) { base = tiles[i].num - i; break; }
      }
      let valid = true, points = 0;
      for (let i = 0; i < tiles.length; i++) {
        const expected = base + i;
        if (expected < 1 || expected > 13) { valid = false; break; }
        const t = tiles[i];
        if (!t.joker && t.num !== expected) { valid = false; break; }
        points += expected;
      }
      if (valid) return { ok: true, type: 'run', points };
    }
  }
  return { ok: false };
}

function isValidMeld(ids) { return classify(ids).ok; }
function meldPoints(ids) { const c = classify(ids); return c.ok ? c.points : 0; }

function multisetKey(ids) { return ids.slice().sort().join(','); }

/* --------------------------- 턴 검증 ------------------------------------
   state      : 현재 서버 상태(턴 시작 시점)
   seat       : 내 자리 번호
   startBoard : 턴 시작 시 보드
   curBoard   : 내가 편집한 보드 (빈 세트 제거된 상태)
   startRack  : 턴 시작 시 내 손패
   curRack    : 편집 후 내 손패
   ------------------------------------------------------------------------ */
function validateTurn(state, seat, startBoard, curBoard, startRack, curRack) {
  const startSet = new Set(startBoard.flat());
  const curSet = new Set(curBoard.flat());
  const removed = [...startSet].filter(id => !curSet.has(id));
  const added = [...curSet].filter(id => !startSet.has(id));

  if (removed.length > 0)
    return { ok: false, msg: '보드에 있던 타일을 손으로 가져올 수 없어요. (조커 회수는 미지원)' };
  if (added.length === 0)
    return { ok: false, msg: '최소 한 장은 내려놓아야 합니다. 안 낼 거면 "뽑기"를 누르세요.' };

  const startRackSet = new Set(startRack);
  for (const id of added)
    if (!startRackSet.has(id)) return { ok: false, msg: '잘못된 타일이 보드에 있습니다.' };

  for (const m of curBoard)
    if (!isValidMeld(m)) return { ok: false, msg: '아직 완성되지 않은 세트가 있어요. (3장 미만이거나 규칙 위반)' };

  // 첫 등록(30점) 검증 — 아직 등록 안 한 사람은 기존 보드를 건드릴 수 없다
  if (!state.initialMeld[seat]) {
    const startKeys = startBoard.map(multisetKey);
    const used = new Array(startBoard.length).fill(false);
    let newPoints = 0;
    for (const m of curBoard) {
      const allAdded = m.every(id => !startSet.has(id));
      if (allAdded) { newPoints += meldPoints(m); continue; }
      const k = multisetKey(m);
      const idx = startKeys.findIndex((sk, i) => !used[i] && sk === k);
      if (idx < 0) return { ok: false, msg: '첫 등록(30점) 전에는 기존 세트를 건드릴 수 없어요.' };
      used[idx] = true;
    }
    if (newPoints < 30)
      return { ok: false, msg: `첫 등록은 30점 이상이어야 해요. (지금 새 세트 ${newPoints}점)` };
  }
  return { ok: true };
}

// 첫 등록 안 한 사람이 이번 턴에 새로 만든 세트 점수 합 (UI 힌트용)
function previewNewPoints(state, seat, startBoard, curBoard) {
  if (state.initialMeld[seat]) return null;
  const startSet = new Set(startBoard.flat());
  let pts = 0;
  for (const m of curBoard) {
    if (m.length >= 3 && m.every(id => !startSet.has(id)) && isValidMeld(m)) pts += meldPoints(m);
  }
  return pts;
}

function nextSeat(state, seat) {
  const seats = Object.keys(state.hands).map(Number).sort((a, b) => a - b);
  const i = seats.indexOf(Number(seat));
  return seats[(i + 1) % seats.length];
}

// 종료 시 손패 점수 (조커 30, 나머지는 숫자값)
function handScore(ids) {
  return ids.reduce((s, id) => s + (TILES[id].joker ? 30 : TILES[id].num), 0);
}
