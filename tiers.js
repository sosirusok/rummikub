/* =========================================================================
   tiers.js — 3게임 공용 티어 사다리 + 점수 엔진(미리보기) + 티어 표시 헬퍼
   - 신규 천장 15000 (나무 0 … 챌린저 15000)
   - 게임별 독립 점수/티어/연승. 서버 RPC(rk_finish_*)가 점수의 진실,
     클라 compute·applyScore 는 미리보기/표시용(반올림 차이 무관).
   - 의존: ui-core.js(esc) 가 먼저 로드돼야 함.
   ========================================================================= */

const GAME_NAME  = { rummikub: '루미큐브', davinci: '다빈치 코드', splendor: '스플랜더', uno: '우노', race: '운빨 대시',  hunt: '나도 사람이야', mafia: '마피아' };
const GAME_SHORT = { rummikub: '루미',     davinci: '다빈치',      splendor: '스플랜더', uno: '우노', race: '운빨',       hunt: '나도사람',     mafia: '마피아' };
const GAME_LOGO  = { rummikub: '🀄',       davinci: '🔢',          splendor: '💎',       uno: '🎴', race: '🏁',         hunt: '🕵️',          mafia: '🔪' };

/* ----------------------------- 티어 사다리 ----------------------------- */
const TIER_DEFS = [
  { key: 'wood',        name: '나무',         color: '#8a6a44', logo: '🌳', cuts: [0] },
  { key: 'iron',        name: '아이언',       color: '#7d7d7d', logo: '🔩', cuts: [200, 400, 600, 800] },
  { key: 'bronze',      name: '브론즈',       color: '#b06a32', logo: '🥉', cuts: [1000, 1300, 1600, 1900] },
  { key: 'silver',      name: '실버',         color: '#9fb0c3', logo: '🥈', cuts: [2200, 2600, 3000, 3400] },
  { key: 'gold',        name: '골드',         color: '#e6b32e', logo: '🥇', cuts: [3800, 4200, 4600, 5000] },
  { key: 'platinum',    name: '플래티넘',     color: '#33c2ad', logo: '💠', cuts: [5400, 5800, 6200, 6600] },
  { key: 'emerald',     name: '에메랄드',     color: '#1fb15e', logo: '💚', cuts: [7000, 7500, 8000, 8500] },
  { key: 'diamond',     name: '다이아몬드',   color: '#49a8ff', logo: '💎', cuts: [9000, 9500, 10000, 10500] },
  { key: 'master',      name: '마스터',       color: '#b14de0', logo: '👑', cuts: [12000] },
  { key: 'grandmaster', name: '그랜드마스터', color: '#e0444a', logo: '⚔️', cuts: [13500] },
  { key: 'challenger',  name: '챌린저',       color: '#f4d35e', logo: '🏆', cuts: [15000] },
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
const DIAMOND_MAX_LEVEL = TIER_LADDER.filter(e => e.key === 'diamond').reduce((m, e) => Math.max(m, e.level), 0); // 28

function tierForScore(score) {
  score = Math.max(0, score || 0);
  let e = TIER_LADDER[0];
  for (const t of TIER_LADDER) { if (score >= t.min) e = t; else break; }
  const next = TIER_LADDER[e.level + 1] || null;
  const fullName = e.division ? `${e.name} ${ROMAN[e.division]}` : e.name;
  return { key: e.key, name: e.name, division: e.division, color: e.color, logo: e.logo, level: e.level, fullName, nextMin: next ? next.min : null };
}
function tierLevel(score) { return tierForScore(score).level; }

/* ----------------------------- 점수 엔진 ------------------------------- */
// 베이스(원래값): 감소는 그대로. 획득만 applyScore 의 저티어 밴드(gb)로 가산. 서버 rk_apply_score 와 동일.
const SCORE_CFG = {
  rummikub: { gainMult: L => Math.max(0.42, 1 - L * 0.011), lossMult: L => Math.min(2.10, 1 + L * 0.020), tax: L => L * 0.85, minWin: L => Math.max(8, Math.round(28 - L * 0.45)), bonusRate: 0.10 },
  davinci:  { gainMult: L => Math.max(0.42, 1 - L * 0.011), lossMult: L => Math.min(2.08, 1 + L * 0.020), tax: L => L * 0.60, minWin: L => Math.max(6, Math.round(20 - L * 0.34)), bonusRate: 0.10 },
  mafia:    { gainMult: L => Math.max(0.50, 1 - L * 0.010), lossMult: L => Math.min(2.00, 1 + L * 0.018), tax: L => L * 0.30, minWin: L => Math.max(10, Math.round(24 - L * 0.40)), bonusRate: 0.12 },
  race:     { gainMult: L => Math.max(0.45, 1 - L * 0.011), lossMult: L => Math.min(2.05, 1 + L * 0.019), tax: L => L * 0.32, minWin: L => Math.max(4, Math.round(12 - L * 0.18)), bonusRate: 0.08 },
  hunt:     { gainMult: L => Math.max(0.45, 1 - L * 0.011), lossMult: L => Math.min(2.05, 1 + L * 0.019), tax: L => L * 0.30, minWin: L => Math.max(4, Math.round(11 - L * 0.16)), bonusRate: 0.08 },
};
function gainBand(L) { return L <= 4 ? 3.0 : L <= 8 ? 2.4 : L <= 12 ? 1.8 : L <= 20 ? 1.5 : 1.3; }   // 획득 대폭 가산
function lossBand(L) { return L <= 4 ? 0.15 : L <= 8 ? 0.4 : L <= 12 ? 0.7 : 1.0; }                  // 저티어 손실 축소
const STREAK_BASE_RK = { 2: { 1: 'apply', 2: 'break' }, 3: { 1: 'apply', 2: 'maintain', 3: 'break' }, 4: { 1: 'apply', 2: 'apply', 3: 'maintain', 4: 'break' } };
function streakRummikub(n, rank, tied) { if (rank === 1) return 'apply'; if (tied) return 'maintain'; return STREAK_BASE_RK[n][rank]; }
function streakRace(n, rank, tied) {
  if (rank === 1) return 'apply';
  if (tied) return 'maintain';
  const pos = (rank - 1) / Math.max(1, n - 1);
  if (pos <= 1 / 3) return 'apply';
  if (pos <= 2 / 3) return 'maintain';
  return 'break';
}
function applyScore(game, perf, score, prevStreak, isWin, treatment) {
  const C = SCORE_CFG[game];
  const L = tierLevel(score || 0);
  const gb = gainBand(L), lb = lossBand(L);
  const adj = perf - C.tax(L);
  let delta = Math.round(adj >= 0 ? adj * C.gainMult(L) * gb : adj * C.lossMult(L) * lb);   // 획득 가산 + 손실 축소
  if (isWin) delta = Math.max(delta, Math.round(C.minWin(L) * gb));
  const newStreak = treatment === 'apply' ? (prevStreak || 0) + 1 : treatment === 'maintain' ? (prevStreak || 0) : 0;
  let bonus = 0;
  if (treatment === 'apply' && L <= DIAMOND_MAX_LEVEL && newStreak >= 2 && delta > 0) {
    bonus = Math.round(delta * newStreak * C.bonusRate); delta += bonus;
  }
  return { delta, bonus, newStreak, newScore: Math.max(0, (score || 0) + delta), level: L };
}

/* ===================== 고정 점수표 (보드게임: 등수·인원·티어별 절대 증감) =====================
   사용자 확정 테이블. 공식이 아니라 룩업 — (게임·티어·인원·등수) → 정확한 점수 변화량.
   서버 rk_rank_points 와 1:1 동일해야 함. 마피아는 기여도 기반(아래 MAFIA_*).
   티어키: wood/iron/bronze/silver/gold/platinum/emerald/diamond/master/grandmaster/challenger */
const TIER_KEY_CUTS = [
  ['challenger', 15000], ['grandmaster', 13500], ['master', 12000],
  ['diamond', 9000], ['emerald', 7000], ['platinum', 5400], ['gold', 3800],
  ['silver', 2200], ['bronze', 1000], ['iron', 200], ['wood', 0],
];
function tierKeyForScore(score) {
  score = Math.max(0, score || 0);
  for (const [key, min] of TIER_KEY_CUTS) if (score >= min) return key;
  return 'wood';
}
// SCORE_TABLE[game][tierKey] = { 2:[1위,2위], 3:[1위,2위,3위], 4:[1위,2위,3위,4위] }
const SCORE_TABLE = {
  rummikub: {
    wood:        { 2:[110,0],   3:[120,90,0],    4:[150,100,50,0] },
    iron:        { 2:[100,-10], 3:[110,80,-10],  4:[130,100,40,-20] },
    bronze:      { 2:[90,-20],  3:[100,60,-20],  4:[120,90,20,-40] },
    silver:      { 2:[80,-30],  3:[90,50,-40],   4:[110,90,0,-60] },
    gold:        { 2:[70,-40],  3:[80,30,-60],   4:[100,80,-20,-80] },
    platinum:    { 2:[60,-50],  3:[80,20,-80],   4:[100,70,-40,-100] },
    emerald:     { 2:[50,-70],  3:[70,10,-100],  4:[90,60,-50,-120] },
    diamond:     { 2:[50,-90],  3:[70,0,-120],   4:[90,50,-60,-140] },
    master:      { 2:[40,-90],  3:[60,0,-130],   4:[80,50,-60,-150] },
    grandmaster: { 2:[40,-110], 3:[60,-10,-140], 4:[80,40,-70,-160] },
    challenger:  { 2:[30,-110], 3:[50,-20,-140], 4:[70,40,-80,-170] },
  },
  davinci: {
    wood:        { 2:[90,0],    3:[100,80,0],    4:[120,90,40,0] },
    iron:        { 2:[80,-10],  3:[100,70,-20],  4:[110,90,30,-20] },
    bronze:      { 2:[70,-20],  3:[90,70,-40],   4:[100,80,20,-30] },
    silver:      { 2:[70,-30],  3:[80,60,-50],   4:[90,80,10,-50] },
    gold:        { 2:[60,-40],  3:[70,50,-60],   4:[90,70,0,-70] },
    platinum:    { 2:[60,-50],  3:[70,40,-80],   4:[80,60,-10,-90] },
    emerald:     { 2:[50,-70],  3:[60,20,-100],  4:[70,50,-30,-110] },
    diamond:     { 2:[50,-90],  3:[60,10,-120],  4:[70,40,-40,-130] },
    master:      { 2:[40,-90],  3:[50,0,-120],   4:[70,40,-40,-150] },
    grandmaster: { 2:[40,-110], 3:[50,-10,-130], 4:[60,30,-50,-150] },
    challenger:  { 2:[30,-110], 3:[40,-10,-130], 4:[50,30,-50,-160] },
  },
  uno: {
    wood:        { 2:[90,0],    3:[100,80,0],    4:[120,90,40,0] },
    iron:        { 2:[80,-10],  3:[100,70,-20],  4:[110,90,30,-20] },
    bronze:      { 2:[70,-20],  3:[90,70,-40],   4:[100,80,20,-30] },
    silver:      { 2:[70,-30],  3:[80,60,-50],   4:[90,80,10,-50] },
    gold:        { 2:[60,-40],  3:[70,50,-60],   4:[90,70,0,-70] },
    platinum:    { 2:[60,-50],  3:[70,40,-80],   4:[80,60,-10,-90] },
    emerald:     { 2:[50,-70],  3:[60,20,-100],  4:[70,50,-30,-110] },
    diamond:     { 2:[50,-90],  3:[60,10,-120],  4:[70,40,-40,-130] },
    master:      { 2:[40,-90],  3:[50,0,-120],   4:[70,40,-40,-150] },
    grandmaster: { 2:[40,-110], 3:[50,-10,-130], 4:[60,30,-50,-150] },
    challenger:  { 2:[30,-110], 3:[40,-10,-130], 4:[50,30,-50,-160] },
  },
  splendor: {
    wood:        { 2:[130,0],   3:[150,90,50],   4:[180,140,80,0] },
    iron:        { 2:[130,-10], 3:[150,80,20],   4:[170,130,60,-20] },
    bronze:      { 2:[120,-20], 3:[140,60,0],    4:[160,120,40,-40] },
    silver:      { 2:[110,-30], 3:[130,50,-20],  4:[150,110,20,-60] },
    gold:        { 2:[100,-40], 3:[120,30,-40],  4:[140,100,0,-80] },
    platinum:    { 2:[90,-50],  3:[110,20,-50],  4:[130,90,-10,-100] },
    emerald:     { 2:[80,-70],  3:[100,10,-70],  4:[120,80,-20,-120] },
    diamond:     { 2:[70,-90],  3:[90,0,-90],    4:[110,70,-30,-140] },
    master:      { 2:[60,-90],  3:[80,0,-110],   4:[100,60,-40,-150] },
    grandmaster: { 2:[50,-110], 3:[70,-10,-120], 4:[90,50,-50,-160] },
    challenger:  { 2:[40,-110], 3:[60,-20,-130], 4:[80,40,-60,-170] },
  },
};
// 등수 기반 점수 변화량 룩업(루미/다빈치/스플랜더). rank=1..n(동률은 공동등수 index).
function rankPoints(game, score, n, rank) {
  const g = SCORE_TABLE[game]; if (!g) return 0;
  const row = g[tierKeyForScore(score)]; if (!row) return 0;
  const nn = Math.max(2, Math.min(4, n || 2));
  const arr = row[nn] || row[4];
  const idx = Math.max(1, Math.min(arr.length, rank || arr.length)) - 1;
  return arr[idx];
}

/* ===================== 마피아: 기여도 기반 점수 =====================
   진영 승패 베이스(티어별) + 역할 기여도(살인/조사정답/세이브/생존).
   승리 진영은 트롤이어도 무조건 +1 이상. 패배는 기여도로 손실만 줄임(최대 0). */
const MAFIA_BASE = {  // 앵커=나무/브론즈/골드/다이아/챌린저 · 나머지=내분 보간(아이언·실버=평균, 플래/에메=골드:다이아 2:1·1:2, 마스터/그마=다이아:챌린저 2:1·1:2)
  wood:        { mwin:150, cwin:75, loss:0 },
  iron:        { mwin:135, cwin:67, loss:-10 },
  bronze:      { mwin:120, cwin:58, loss:-20 },
  silver:      { mwin:102, cwin:47, loss:-33 },
  gold:        { mwin:84,  cwin:36, loss:-46 },
  platinum:    { mwin:74,  cwin:30, loss:-59 },
  emerald:     { mwin:64,  cwin:24, loss:-73 },
  diamond:     { mwin:54,  cwin:18, loss:-86 },
  master:      { mwin:47,  cwin:15, loss:-96 },
  grandmaster: { mwin:41,  cwin:13, loss:-106 },
  challenger:  { mwin:34,  cwin:10, loss:-116 },
};
const MAFIA_CONTRIB = { kill:8, invest:10, save:12, survive:6 };  // 살인·정답조사·세이브·시민생존(1회)
// info: { won, camp:'mafia'|'citizens', role, survived, kills, hits, saves }
function mafiaPoints(score, info) {
  const b = MAFIA_BASE[tierKeyForScore(score)] || MAFIA_BASE.wood;
  let base = info.won ? (info.camp === 'mafia' ? b.mwin : b.cwin) : b.loss;
  let contrib = 0;
  if (info.role === 'mafia')       contrib = (info.kills || 0) * MAFIA_CONTRIB.kill;
  else if (info.role === 'police') contrib = (info.hits  || 0) * MAFIA_CONTRIB.invest;
  else if (info.role === 'doctor') contrib = (info.saves || 0) * MAFIA_CONTRIB.save;
  else if (info.survived)          contrib = MAFIA_CONTRIB.survive;
  let delta = base + contrib;
  if (info.won) delta = Math.max(delta, 1);   // 승리진영 무조건 +1 이상
  else delta = Math.min(delta, 0);            // 패배는 최대 0(기여도로 손실만 경감)
  return { delta, newScore: Math.max(0, Math.min(15000, (score || 0) + delta)) };
}

/* ----------------------------- 표시 헬퍼 ------------------------------- */
// score===null → 꾸미기 숨김(중립색). 그 외엔 해당 점수의 티어색.
function nameHTML(name, score) {
  if (score == null) return `<span class="tier-name tier-name--plain">${esc(name)}</span>`;
  const t = tierForScore(score || 0);
  return `<span class="tier-name" style="--tc:${t.color}">${esc(name)}</span>`;
}
function scoreTierHTML(score) {
  const t = tierForScore(score || 0);
  return `<span class="score-tier" style="--tc:${t.color}"><span class="tg">${t.logo}</span><b>${score || 0}</b><span class="tg">${t.logo}</span></span>`;
}
function tierBadgeHTML(score) {
  const t = tierForScore(score || 0);
  return `<span class="tier-badge" style="--tc:${t.color}">${t.logo} ${t.fullName}</span>`;
}
function streakHTML(streak) { return streak >= 1 ? `<span class="streak">🔥 ${streak}연승</span>` : ''; }

// 꾸미기에서 고른 표시 엠블럼(이름 옆 항상 표시용). userId 로 room_members(MEMBERS) 미러에서 표시게임/점수 조회.
function decoEmblemHTML(userId, size) {
  const M = (typeof MEMBERS !== 'undefined') ? MEMBERS : [];
  const m = M.find(x => x.user_id === userId);
  if (!m || !m.display_game) return '';
  return emblemHTML(m.display_game, m.display_score || 0, size || 'xs');
}
// 꾸미기 칩: (짧은게임명) 티어(점수). game=null → 빈 문자열.
function decoChipHTML(game, score) {
  if (!game) return '';
  const t = tierForScore(score || 0);
  return `<span class="deco-chip" style="--tc:${t.color}">${GAME_SHORT[game]} ${t.fullName}(${score || 0})</span>`;
}

/* ----------------------------- 티어 엠블럼(좀비고 래더식 — 채도 높은 티어색 컬러 배지 + 게임별 고유 모티브) ----------------------------- */
const TIER_INFO = {}; TIER_DEFS.forEach(d => TIER_INFO[d.key] = { name: d.name, color: d.color, logo: d.logo });
// 티어키 → [밝은,중간,진한] 채도 높은 색 + 강조색 + 장식단계(st).
const _EMB = {
  wood:        { st:0, pal:['#e6c79c','#b07c44','#5e4326'], acc:'#eccfa2' },
  iron:        { st:0, pal:['#d2dae4','#8a94a2','#586070'], acc:'#cdd8e6' },
  bronze:      { st:1, pal:['#ffd9a0','#e87f2e','#a8430f'], acc:'#ffb060' },
  silver:      { st:1, pal:['#ffffff','#c2cfe0','#8593a8'], acc:'#eaf2ff' },
  gold:        { st:2, pal:['#fff1a0','#ffc21e','#e07a00'], acc:'#ffd64a' },
  platinum:    { st:2, pal:['#c8fff6','#22d6c0','#0f8f86'], acc:'#7af0e0' },
  emerald:     { st:3, pal:['#caffb6','#3fd462','#137a35'], acc:'#86f0a0' },
  diamond:     { st:3, pal:['#b9f6ff','#22c6ff','#1366ff'], acc:'#7fe0ff' },
  master:      { st:4, pal:['#f0b6ff','#b14de0','#6a2cff'], acc:'#e0a6ff' },
  grandmaster: { st:4, pal:['#ffd0a0','#ff5a4a','#c01030'], acc:'#ff9a6a' },
  challenger:  { st:4, pal:['#ffe7a0','#ff5ea8','#7a3cff'], acc:'#ffd76a' },
};
let _embN = 0;
function _eDefs(id, pal, acc) {
  return `<defs>
    <radialGradient id="${id}bg" cx="50%" cy="38%" r="72%"><stop offset="0%" stop-color="${pal[0]}"/><stop offset="52%" stop-color="${pal[1]}"/><stop offset="100%" stop-color="${pal[2]}"/></radialGradient>
    <linearGradient id="${id}sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity=".55"/><stop offset="40%" stop-color="#fff" stop-opacity=".08"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="${id}halo" cx="50%" cy="42%" r="60%"><stop offset="0%" stop-color="${acc}" stop-opacity=".9"/><stop offset="100%" stop-color="${acc}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}ring" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff3b0"/><stop offset="38%" stop-color="#f5cf63"/><stop offset="70%" stop-color="#c98f24"/><stop offset="100%" stop-color="#8a5e12"/></linearGradient>
    <linearGradient id="${id}ringI" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffe27a"/><stop offset="100%" stop-color="#a9760f"/></linearGradient>
    <linearGradient id="${id}steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#39424f"/><stop offset="30%" stop-color="#aebccd"/><stop offset="50%" stop-color="#fff"/><stop offset="58%" stop-color="#eef4fb"/><stop offset="74%" stop-color="#8b99ab"/><stop offset="100%" stop-color="#2a323d"/></linearGradient>
    <linearGradient id="${id}go" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff7cf"/><stop offset="34%" stop-color="#f4d678"/><stop offset="64%" stop-color="#d39a2c"/><stop offset="100%" stop-color="#8c5e12"/></linearGradient>
    <linearGradient id="${id}gr" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#1b1b22"/><stop offset="50%" stop-color="#4a3b4f"/><stop offset="100%" stop-color="#15151b"/></linearGradient>
    <radialGradient id="${id}gem" cx="38%" cy="30%" r="80%"><stop offset="0%" stop-color="#fff"/><stop offset="34%" stop-color="${acc}"/><stop offset="100%" stop-color="${pal[2]}"/></radialGradient>
    <radialGradient id="${id}gemBig" cx="40%" cy="28%" r="85%"><stop offset="0%" stop-color="#fff"/><stop offset="30%" stop-color="${acc}"/><stop offset="72%" stop-color="${pal[1]}"/><stop offset="100%" stop-color="${pal[2]}"/></radialGradient>
    <filter id="${id}ds" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.3" flood-color="rgba(0,0,0,.45)"/></filter>
    <clipPath id="${id}cc"><circle cx="60" cy="60" r="46"/></clipPath></defs>`;
}
function _eRays(id, n, op) { let s = `<g class="er" opacity="${op}">`; for (let i = 0; i < n; i++) { const a = i/n*Math.PI*2, lng = i%2===0, r2 = lng?46:38, w = lng?.06:.035;
  s += `<polygon points="${(60+Math.cos(a-w)*12).toFixed(1)},${(60+Math.sin(a-w)*12).toFixed(1)} ${(60+Math.cos(a)*r2).toFixed(1)},${(60+Math.sin(a)*r2).toFixed(1)} ${(60+Math.cos(a+w)*12).toFixed(1)},${(60+Math.sin(a+w)*12).toFixed(1)}" fill="#fff" opacity=".5"/>`; } return s + `</g>`; }
function _eGem(id, cx, cy, r) { return `<g stroke="rgba(0,0,0,.28)" stroke-width=".6" stroke-linejoin="round"><polygon points="${cx},${cy-r} ${cx+r*0.92},${cy-r*0.28} ${cx+r*0.57},${cy+r} ${cx-r*0.57},${cy+r} ${cx-r*0.92},${cy-r*0.28}" fill="url(#${id}gem)"/><polygon points="${cx},${cy-r} ${cx+r*0.4},${cy-r*0.05} ${cx},${cy+r*0.25} ${cx-r*0.4},${cy-r*0.05}" fill="#fff" opacity=".55"/></g>`; }
function _eWing(id) { const N = 6; let f = ''; for (let i = 0; i < N; i++) { const ang = -76+i*15, len = 30-i*2.8, w = 5.6-i*0.45;
  f += `<g transform="rotate(${ang})"><path d="M0 0 C ${w} ${-len*0.35}, ${w*0.7} ${-len*0.8}, 0 ${-len} C ${-w*0.7} ${-len*0.8}, ${-w} ${-len*0.35}, 0 0 Z" fill="url(#${id}ringI)" stroke="rgba(80,52,8,.3)" stroke-width=".3"/></g>`; } return f; }
/* 게임별 고유 모티브 */
function _Mknife(id) { return `
  <g filter="url(#${id}ds)"><path d="M60 22 C 66 42, 70 62, 68 80 L60 92 L52 80 C 50 62, 54 42, 60 22 Z" fill="url(#${id}steel)" stroke="#222a35" stroke-width="1"/><path d="M60 22 C 63 40, 64 58, 63.5 72" stroke="#fff" stroke-width="1.4" opacity=".85" fill="none"/></g>
  <g filter="url(#${id}ds)"><path d="M36 84 C 42 78, 52 81, 56 87 L64 87 C 68 81, 78 78, 84 84 C 78 91, 68 87, 64 90 L56 90 C 52 87, 42 91, 36 84 Z" fill="url(#${id}go)" stroke="#6c4908" stroke-width="1"/><circle cx="36" cy="84" r="3" fill="url(#${id}gem)"/><circle cx="84" cy="84" r="3" fill="url(#${id}gem)"/></g>
  <g filter="url(#${id}ds)"><rect x="55" y="90" width="10" height="18" rx="4" fill="url(#${id}gr)" stroke="#0d0d12" stroke-width=".6"/><g stroke="#caa24a" stroke-width="1" opacity=".85"><line x1="55.5" y1="94" x2="64.5" y2="96"/><line x1="55.5" y1="99" x2="64.5" y2="101"/></g></g>
  <g filter="url(#${id}ds)"><circle cx="60" cy="111" r="6.5" fill="url(#${id}go)" stroke="#6c4908" stroke-width="1"/>${_eGem(id,60,111,4.4)}</g>`; }
function _Mgem(id) { const cx=60,cy=62,r=24;
  return `<g filter="url(#${id}ds)"><polygon points="${cx-r},${cy-r*0.5} ${cx-r*0.5},${cy-r} ${cx+r*0.5},${cy-r} ${cx+r},${cy-r*0.5} ${cx},${cy+r*1.15}" fill="url(#${id}gemBig)" stroke="rgba(0,0,0,.3)" stroke-width="1.2" stroke-linejoin="round"/>
    <polygon points="${cx-r},${cy-r*0.5} ${cx+r},${cy-r*0.5} ${cx},${cy-r*0.1}" fill="#fff" opacity=".55"/>
    <line x1="${cx-r*0.5}" y1="${cy-r}" x2="${cx}" y2="${cy+r*1.15}" stroke="rgba(0,0,0,.22)"/><line x1="${cx+r*0.5}" y1="${cy-r}" x2="${cx}" y2="${cy+r*1.15}" stroke="rgba(0,0,0,.22)"/>
    <line x1="${cx-r}" y1="${cy-r*0.5}" x2="${cx}" y2="${cy+r*1.15}" stroke="rgba(0,0,0,.16)"/><line x1="${cx+r}" y1="${cy-r*0.5}" x2="${cx}" y2="${cy+r*1.15}" stroke="rgba(0,0,0,.16)"/></g>
    <g fill="#fff">${[[48,46,2.2],[74,52,1.8],[60,92,1.6]].map(([x,y,rr])=>`<circle cx="${x}" cy="${y}" r="${rr}" opacity=".9"/>`).join('')}</g>`; }
function _Mastro(id) { let g = `<g filter="url(#${id}ds)"><circle cx="60" cy="62" r="26" fill="none" stroke="url(#${id}go)" stroke-width="4"/><circle cx="60" cy="62" r="19" fill="none" stroke="url(#${id}ringI)" stroke-width="2.4" stroke-dasharray="3 4"/><circle cx="60" cy="62" r="11" fill="rgba(10,12,20,.32)" stroke="url(#${id}go)" stroke-width="1.6"/><path d="M60 36 L60 88 M34 62 L86 62" stroke="url(#${id}ringI)" stroke-width="1.4" opacity=".8"/>`;
  for (let i = 0; i < 8; i++) { const a = i/8*Math.PI*2; g += `<text x="${(60+Math.cos(a)*22).toFixed(1)}" y="${(64.5+Math.sin(a)*22).toFixed(1)}" font-size="6" fill="#fff" text-anchor="middle">${'✦✧⟡◇✶✷❖✸'[i]}</text>`; }
  return g + `<circle cx="60" cy="62" r="3.4" fill="#fff"/></g>`; }
function _star(cx, cy, r, fill) { return `<polygon points="${Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.45:r;return `${(cx+Math.cos(a)*rr).toFixed(1)},${(cy+Math.sin(a)*rr).toFixed(1)}`}).join(' ')}" fill="${fill}" stroke="rgba(0,0,0,.3)" stroke-width="1"/>`; }
function _Mjoker(id) {
  const tile = (x,y,rot,fill,t,tc) => `<g transform="rotate(${rot} ${x+11} ${y+18})" filter="url(#${id}ds)"><rect x="${x}" y="${y}" width="22" height="36" rx="5" fill="${fill}" stroke="rgba(0,0,0,.3)" stroke-width="1.2"/><text x="${x+11}" y="${y+24}" font-size="18" font-weight="900" font-family="sans-serif" fill="${tc}" text-anchor="middle">${t}</text></g>`;
  return `${tile(30,52,-14,'#f2ecdc','7','#d8443f')}${tile(68,52,14,'#f2ecdc','3','#2b6cff')}<g filter="url(#${id}ds)">${_star(60,62,22,`url(#${id}go)`)}${_star(60,62,11,'#fff8e0')}</g>`; }
function _Mcard(id) {
  const card = (x,y,rot,fill) => `<g transform="rotate(${rot} ${x+13} ${y+20})" filter="url(#${id}ds)"><rect x="${x}" y="${y}" width="26" height="40" rx="5" fill="${fill}" stroke="#fff" stroke-width="2.2"/><ellipse cx="${x+13}" cy="${y+20}" rx="9" ry="13" transform="rotate(34 ${x+13} ${y+20})" fill="#fff" opacity=".92"/></g>`;
  return `${card(26,50,-22,'#1fa85a')}${card(40,46,-7,'#e8b21e')}${card(56,44,8,'#2b6cff')}${card(70,50,22,'#d8443f')}`; }
function _Mflag(id) { return `<g filter="url(#${id}ds)"><line x1="46" y1="38" x2="46" y2="92" stroke="#fff" stroke-width="5" stroke-linecap="round"/><g transform="translate(49,40)">${[0,1,2,3,4].map(r=>[0,1,2,3].map(c=>`<rect x="${c*8}" y="${r*8}" width="8" height="8" fill="${(r+c)%2?'#fff':'#1a1a1a'}"/>`).join('')).join('')}<rect width="32" height="40" fill="none" stroke="rgba(0,0,0,.3)"/></g></g>`; }
function _Mmag(id) { return `<g filter="url(#${id}ds)"><circle cx="56" cy="58" r="20" fill="rgba(10,12,20,.28)" stroke="url(#${id}go)" stroke-width="5"/><circle cx="56" cy="58" r="11" fill="#fff" opacity=".25"/><line x1="70" y1="72" x2="88" y2="92" stroke="url(#${id}go)" stroke-width="7" stroke-linecap="round"/></g>`; }
function _Mdefault(id) { return `<g filter="url(#${id}ds)">${_star(60,62,24,`url(#${id}go)`)}<circle cx="60" cy="58" r="6" fill="#fff" opacity=".7"/></g>`; }
const _MOTIF = { mafia:_Mknife, splendor:_Mgem, davinci:_Mastro, rummikub:_Mjoker, uno:_Mcard, race:_Mflag, hunt:_Mmag };

function emblemHTML(game, score, size) {
  const t = tierForScore(score || 0);
  const c = _EMB[t.key] || _EMB.wood, st = c.st, pal = c.pal, acc = c.acc;
  const id = 'e' + (++_embN) + '_';
  const motif = (_MOTIF[game] || _Mdefault)(id);
  let s = `<span class="emb emb--${size || 'sm'} emb--${t.key}" title="${t.fullName}"><svg viewBox="0 0 120 124" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${_eDefs(id, pal, acc)}`;
  s += `<ellipse class="egl" cx="60" cy="60" rx="58" ry="60" fill="url(#${id}halo)" opacity="${st>=4?.9:st>=2?.6:.4}"/>`;
  if (st >= 3) s += `<g transform="translate(60,74)">${_eWing(id)}</g><g transform="translate(60,74) scale(-1,1)">${_eWing(id)}</g>`;
  s += `<circle cx="60" cy="60" r="46" fill="url(#${id}bg)"/>`;
  s += `<g clip-path="url(#${id}cc)">${st>=2 ? _eRays(id, 24, st>=4?.5:.32) : ''}<ellipse cx="60" cy="40" rx="44" ry="30" fill="url(#${id}sheen)"/></g>`;
  s += `<circle cx="60" cy="60" r="46" fill="none" stroke="url(#${id}ring)" stroke-width="${st>=2?5:4}"/><circle cx="60" cy="60" r="41" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1"/>`;
  if (st >= 1) { const n = st>=3?16:12; let st2 = ''; for (let i = 0; i < n; i++) { const a = i/n*Math.PI*2; st2 += `<circle cx="${(60+Math.cos(a)*46).toFixed(1)}" cy="${(60+Math.sin(a)*46).toFixed(1)}" r="${st>=3?1.6:1.2}" fill="url(#${id}ringI)"/>`; } s += st2; }
  s += motif;
  s += _eGem(id, 60, 16, st>=4?5:4);
  if (st >= 4) s += `<g transform="translate(60,7)"><path d="M-15 9 L-9 -5 L0 4 L9 -5 L15 9 Q0 3 -15 9 Z" fill="url(#${id}go)" stroke="#6c4908" stroke-width=".7"/></g>`;
  if (st >= 2) s += `<g fill="#fff">${[[30,40,1.8],[90,44,1.6],[36,84,1.3],[86,84,1.3]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" opacity=".85"/>`).join('')}</g>`;
  return s + `</svg></span>`;
}

/* ----------------------------- 점수 증감 테이블(티어 화면) ----------------------------- */
function _scCell(v) { const c = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'; return `<td class="sc-c sc-${c}">${v > 0 ? '+' + v : v}</td>`; }
function _scBoardTable(game, n) {
  const tbl = SCORE_TABLE[game];
  let head = '<th>티어</th>'; for (let r = 1; r <= n; r++) head += `<th>${r}위</th>`;
  const body = TIER_KEY_CUTS.map(([key]) => {
    const info = TIER_INFO[key];
    return `<tr><th class="sc-tier" style="--tc:${info.color}">${info.logo} ${info.name}</th>${(tbl[key][n] || []).map(_scCell).join('')}</tr>`;
  }).join('');
  return `<div class="sc-sub"><div class="sc-cap">${n}인전</div><table class="sc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function scoreTableHTML(game) {
  if (!game) return '';
  if (SCORE_TABLE[game]) {   // 루미큐브 / 다빈치 / 스플랜더 — 사용자 확정 고정 점수표
    return `<div class="sc-wrap"><div class="sc-title">📊 등수·인원·티어별 점수 증감</div>`
      + [2, 3, 4].map(n => _scBoardTable(game, n)).join('')
      + `<p class="sc-note">동률이면 공동 등수로 같은 점수를 받아요. 1등/승리는 항상 +.</p></div>`;
  }
  if (game === 'mafia') {
    const head = `<th>티어</th><th>🔪마피아 승</th><th>🙂시민 승</th><th>패배</th>`;
    const body = TIER_KEY_CUTS.map(([key]) => {
      const info = TIER_INFO[key]; const b = MAFIA_BASE[key];
      return `<tr><th class="sc-tier" style="--tc:${info.color}">${info.logo} ${info.name}</th>${_scCell(b.mwin)}${_scCell(b.cwin)}${_scCell(b.loss)}</tr>`;
    }).join('');
    return `<div class="sc-wrap"><div class="sc-title">📊 티어별 진영 승패 점수(기본)</div>`
      + `<div class="sc-sub"><table class="sc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
      + `<p class="sc-note">여기에 <b>역할 기여도</b>가 더해져요 — 살인 +${MAFIA_CONTRIB.kill} · 조사 정답 +${MAFIA_CONTRIB.invest} · 세이브 +${MAFIA_CONTRIB.save} · 시민 생존 +${MAFIA_CONTRIB.survive}.<br>승리 진영은 최소 +1, 패배는 기여도로 손실만 줄여 최대 0이에요.</p></div>`;
  }
  // race / hunt — 공식 기반(대략치)
  const isRace = game === 'race';
  const head = isRace ? `<th>티어</th><th>1위(4인)</th><th>꼴찌(4인)</th>` : `<th>티어</th><th>생존 승</th><th>색출당함</th>`;
  const body = TIER_KEY_CUTS.map(([key, min]) => {
    const info = TIER_INFO[key]; let a, b;
    if (isRace) { a = applyScore('race', (2.5 - 1) * 6, min, 0, true, 'apply').delta; b = applyScore('race', (2.5 - 4) * 6, min, 0, false, 'break').delta; }
    else { a = applyScore('hunt', 7, min, 0, true, 'apply').delta; b = applyScore('hunt', -7, min, 0, false, 'break').delta; }
    return `<tr><th class="sc-tier" style="--tc:${info.color}">${info.logo} ${info.name}</th>${_scCell(a)}${_scCell(b)}</tr>`;
  }).join('');
  return `<div class="sc-wrap"><div class="sc-title">📊 티어별 점수 증감(대략)</div>`
    + `<div class="sc-sub"><table class="sc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
    + `<p class="sc-note">${isRace ? '운빨로 등수가 갈려 실제값은 달라질 수 있어요.' : '역할·생존·색출 수에 따라 변동해요.'} 연승 보너스는 별도(다이아 이하 2연승+).</p></div>`;
}
