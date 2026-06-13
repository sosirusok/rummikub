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

/* ===================== 티어 사다리 (LoL식) =========================
   나무(시작) → 아이언/브론즈/실버/골드/플래티넘/에메랄드/다이아 IV~I → 마스터/그마/챌린저
   점수 컷·레벨·색·로고. 표시는 클라가 tierForScore 로 산출(서버는 점수만 저장). */
const TIER_DEFS = [
  { key: 'wood',        name: '나무',         color: '#8a6a44', logo: '🌳', cuts: [0] },
  { key: 'iron',        name: '아이언',       color: '#7d7d7d', logo: '🔩', cuts: [100, 175, 250, 325] },
  { key: 'bronze',      name: '브론즈',       color: '#b06a32', logo: '🥉', cuts: [425, 525, 625, 725] },
  { key: 'silver',      name: '실버',         color: '#9fb0c3', logo: '🥈', cuts: [850, 975, 1100, 1225] },
  { key: 'gold',        name: '골드',         color: '#e6b32e', logo: '🥇', cuts: [1375, 1525, 1675, 1825] },
  { key: 'platinum',    name: '플래티넘',     color: '#33c2ad', logo: '💠', cuts: [2000, 2175, 2350, 2525] },
  { key: 'emerald',     name: '에메랄드',     color: '#1fb15e', logo: '💚', cuts: [2725, 2925, 3125, 3325] },
  { key: 'diamond',     name: '다이아몬드',   color: '#49a8ff', logo: '💎', cuts: [3550, 3775, 4000, 4225] },
  { key: 'master',      name: '마스터',       color: '#b14de0', logo: '👑', cuts: [4600] },
  { key: 'grandmaster', name: '그랜드마스터', color: '#e0444a', logo: '⚔️', cuts: [5200] },
  { key: 'challenger',  name: '챌린저',       color: '#f4d35e', logo: '🏆', cuts: [6000] },
];
const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
const TIER_LADDER = (() => {
  const out = []; let lvl = 0;
  for (const t of TIER_DEFS) {
    const multi = t.cuts.length > 1;
    t.cuts.forEach((min, i) => out.push({ min, level: lvl++, key: t.key, name: t.name, color: t.color, logo: t.logo, division: multi ? (4 - i) : 0 }));
  }
  return out;
})();
const DIAMOND_MAX_LEVEL = TIER_LADDER.filter(e => e.key === 'diamond').reduce((m, e) => Math.max(m, e.level), 0);

function tierForScore(score) {
  score = Math.max(0, score || 0);
  let e = TIER_LADDER[0];
  for (const t of TIER_LADDER) { if (score >= t.min) e = t; else break; }
  const next = TIER_LADDER[e.level + 1] || null;
  const fullName = e.division ? `${e.name} ${ROMAN[e.division]}` : e.name;
  return { key: e.key, name: e.name, division: e.division, color: e.color, logo: e.logo, level: e.level, fullName, nextMin: next ? next.min : null };
}
function tierLevel(score) { return tierForScore(score).level; }

/* ===================== 점수 산정 v3 (마진 × 티어 × 연승) =================
   - 마진: 남은 손패가 평균보다 적을수록(=극적으로 이길수록) 더 큰 +, 못할수록 더 큰 −.
     perf = (평균 남은점수) − (내 남은점수)  → 합이 0(누군가 오르면 누군가 내림 → 전원 동시 상승/하락 방지).
   - 티어: 고티어일수록 gainMult↓, lossMult↑, tax↑(중위권도 하락 가능). 단 1등은 항상 최소+ 보장.
   - 연승: 등수별 적용/유지/깨짐(동점 규칙 포함). 2연승부터 +연승수*10%(다이아 이하만). 연승 자체는 전 티어 추적. */
const SCFG = {
  gainMult: L => Math.max(0.34, 1 - L * 0.020),
  lossMult: L => Math.min(1.95, 1 + L * 0.024),
  tax:      L => L * 0.45,
  minWin:   L => Math.max(2, Math.round(10 - L * 0.24)),
};
// 연승 처리: 'apply'(+1·보너스대상) / 'maintain'(유지) / 'break'(0)
const STREAK_BASE = { 2: { 1: 'apply', 2: 'break' }, 3: { 1: 'apply', 2: 'maintain', 3: 'break' }, 4: { 1: 'apply', 2: 'apply', 3: 'maintain', 4: 'break' } };
function streakTreatment(n, rank, tied) { if (rank === 1) return 'apply'; if (tied) return 'maintain'; return STREAK_BASE[n][rank]; }

// players: [{seat, handPoints, score, streak}]  →  {seat:{rank,won,handPoints,delta,bonus,prevScore,newScore,streak,treatment}}
function computeResults(players, n) {
  const sorted = players.slice().sort((a, b) => a.handPoints - b.handPoints || a.seat - b.seat);
  const avg = players.reduce((s, p) => s + p.handPoints, 0) / n;
  const rankOf = {}, tiedOf = {};
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1].handPoints === sorted[i].handPoints) j++;
    const tied = j > i;
    for (let k = i; k <= j; k++) { rankOf[sorted[k].seat] = i + 1; tiedOf[sorted[k].seat] = tied; }
    i = j + 1;
  }
  const out = {};
  for (const p of players) {
    const L = tierLevel(p.score || 0);
    const perf = avg - p.handPoints;
    const adj = perf - SCFG.tax(L);
    let delta = Math.round(adj >= 0 ? adj * SCFG.gainMult(L) : adj * SCFG.lossMult(L));
    const rank = rankOf[p.seat];
    if (rank === 1) delta = Math.max(delta, SCFG.minWin(L));      // 1등 최소+ 보장(전원 하락 방지·승리 보상)
    const tr = streakTreatment(n, rank, tiedOf[p.seat]);
    const prevStreak = p.streak || 0;
    const newStreak = tr === 'apply' ? prevStreak + 1 : tr === 'maintain' ? prevStreak : 0;
    let bonus = 0;
    if (tr === 'apply' && L <= DIAMOND_MAX_LEVEL && newStreak >= 2 && delta > 0) {
      bonus = Math.round(delta * newStreak * 0.10);
      delta += bonus;
    }
    const newScore = Math.max(0, (p.score || 0) + delta);
    out[p.seat] = { rank, won: rank === 1, handPoints: p.handPoints, delta, bonus, prevScore: p.score || 0, newScore, streak: newStreak, treatment: tr };
  }
  return out;
}
