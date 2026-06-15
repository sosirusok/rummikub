/* =========================================================================
   tiers.js — 3게임 공용 티어 사다리 + 점수 엔진(미리보기) + 티어 표시 헬퍼
   - 신규 천장 15000 (나무 0 … 챌린저 15000)
   - 게임별 독립 점수/티어/연승. 서버 RPC(rk_finish_*)가 점수의 진실,
     클라 compute·applyScore 는 미리보기/표시용(반올림 차이 무관).
   - 의존: ui-core.js(esc) 가 먼저 로드돼야 함.
   ========================================================================= */

const GAME_NAME  = { rummikub: '루미큐브', davinci: '다빈치 코드', splendor: '스플랜더', race: '운빨 대시',  hunt: '나도 사람이야', mafia: '마피아' };
const GAME_SHORT = { rummikub: '루미',     davinci: '다빈치',      splendor: '스플랜더', race: '운빨',       hunt: '나도사람',     mafia: '마피아' };
const GAME_LOGO  = { rummikub: '🀄',       davinci: '🔢',          splendor: '💎',       race: '🏁',         hunt: '🕵️',          mafia: '🔪' };

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

// 꾸미기 칩: (짧은게임명) 티어(점수). game=null → 빈 문자열.
function decoChipHTML(game, score) {
  if (!game) return '';
  const t = tierForScore(score || 0);
  return `<span class="deco-chip" style="--tc:${t.color}">${GAME_SHORT[game]} ${t.fullName}(${score || 0})</span>`;
}

/* ----------------------------- 티어 엠블럼(SVG 크레스트 · 게임별 모티브가 단계별로 진화) ----------------------------- */
const TIER_INFO = {}; TIER_DEFS.forEach(d => TIER_INFO[d.key] = { name: d.name, color: d.color, logo: d.logo });
// 티어키 → 단계(0~4) + 팔레트(다색) + 아우라색. 단계가 오를수록 모티브 자체가 완전히 달라지고 장식이 극대화.
const _EMB = {
  wood:        { st:0, pal:['#8a6a44','#5a4026'],                               glow:'#7a5a36' },
  iron:        { st:0, pal:['#aab1bc','#6b727d'],                               glow:'#9aa3ad' },
  bronze:      { st:1, pal:['#cf8743','#8a4f22'],                               glow:'#c8803f' },
  silver:      { st:1, pal:['#d4deea','#8c99ad'],                               glow:'#cdd8e6' },
  gold:        { st:2, pal:['#ffda6e','#c8901c'],                               glow:'#ffcc44' },
  platinum:    { st:2, pal:['#a8f2e7','#2bb6a3'],                               glow:'#5fe6d4' },
  emerald:     { st:3, pal:['#86f0a6','#16a34a'],                               glow:'#3fdd7a' },
  diamond:     { st:3, pal:['#c6e9ff','#3aa0ff','#7c5cff'],                     glow:'#6cc0ff' },
  master:      { st:4, pal:['#ff9ae0','#b14de0','#6a5cff'],                     glow:'#c060f0' },
  grandmaster: { st:4, pal:['#ffe06a','#ff7a3a','#e0444a'],                     glow:'#ff6a3a' },
  challenger:  { st:4, pal:['#fff7d2','#ffd84a','#7af0ff','#ff9ae0','#b08bff'], glow:'#ffe27a' },
};
let _embN = 0;
function _gst(cols) { return cols.map((c, i) => `<stop offset="${Math.round(i / (cols.length - 1) * 100)}%" stop-color="${c}"/>`).join(''); }
const _SHELL = 'M60 10 L102 26 V70 Q102 116 60 140 Q18 116 18 70 V26 Z';
function _eDefs(id, pal, glow, st) {
  return `<defs>
    <linearGradient id="${id}p" x1="0" y1="0" x2="0.3" y2="1">${_gst(pal)}</linearGradient>
    <linearGradient id="${id}ph" x1="0" y1="0" x2="1" y2="1">${_gst(pal)}</linearGradient>
    <radialGradient id="${id}bg" cx="50%" cy="42%" r="75%"><stop offset="0%" stop-color="${pal[0]}" stop-opacity=".35"/><stop offset="55%" stop-color="#0c0f17" stop-opacity=".9"/><stop offset="100%" stop-color="#05070c"/></radialGradient>
    <radialGradient id="${id}gl" cx="50%" cy="46%" r="60%"><stop offset="0%" stop-color="${glow}" stop-opacity="${st>=4?1:st>=3?.8:st>=2?.55:.3}"/><stop offset="100%" stop-color="${glow}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#6b7480"/><stop offset="46%" stop-color="#eef3f8"/><stop offset="56%" stop-color="#fff"/><stop offset="100%" stop-color="#566069"/></linearGradient>
    <linearGradient id="${id}gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff0a8"/><stop offset="50%" stop-color="#eab94a"/><stop offset="100%" stop-color="#9a6c12"/></linearGradient>
    <linearGradient id="${id}grip" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#241a12"/><stop offset="50%" stop-color="#5a4632"/><stop offset="100%" stop-color="#1c140d"/></linearGradient>
    <linearGradient id="${id}lite" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#cfd8e6"/></linearGradient>
    <radialGradient id="${id}spark"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="${id}ds" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.5" flood-color="rgba(0,0,0,.55)"/></filter>
    <filter id="${id}bl" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.6"/></filter>
    <clipPath id="${id}sc"><path d="${_SHELL}"/></clipPath></defs>`;
}
function _eRays(id, n, r1, r2, op) {
  let s = `<g class="er" opacity="${op}">`;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, lng = i % 2 === 0, R = lng ? r2 : r2 * .78, w = lng ? .05 : .028;
    s += `<polygon points="${(60+Math.cos(a-w)*r1).toFixed(1)},${(70+Math.sin(a-w)*r1).toFixed(1)} ${(60+Math.cos(a)*R).toFixed(1)},${(70+Math.sin(a)*R).toFixed(1)} ${(60+Math.cos(a+w)*r1).toFixed(1)},${(70+Math.sin(a+w)*r1).toFixed(1)}" fill="url(#${id}p)"/>`; }
  return s + `</g>`;
}
function _eSpk(id, l) { return l.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id}spark)"/>`).join(''); }
function _eFil(id, st) { if (st < 2) return ''; return `<g stroke="rgba(255,255,255,.10)" stroke-width="1.2" fill="none"><path d="M34 40 Q44 34 52 42"/><path d="M86 40 Q76 34 68 42"/><path d="M30 96 Q42 104 54 98"/><path d="M90 96 Q78 104 66 98"/></g>`; }
function _eWings(id, st) { if (st < 3) return ''; const N = st >= 4 ? 8 : 6;
  const leaf = (x, s) => `<g transform="translate(${x},100) scale(${s},1)">${Array.from({length:N},(_,i)=>`<path d="M${-3-i*9} ${-i*12} q -15 -4 -26 5 q 13 3 26 -5 z" transform="rotate(${-20-i*6} ${-3-i*9} ${-i*12})" fill="url(#${id}gold)" stroke="rgba(0,0,0,.2)" stroke-width=".5"/>`).join('')}</g>`;
  return leaf(18, 1) + leaf(102, -1); }
function _eCrown(id, st) { if (st < 4) return ''; return `<g transform="translate(0,-3)"><path d="M40 20 L46 5 L53 15 L60 3 L67 15 L74 5 L80 20 Q60 14 40 20 Z" fill="url(#${id}gold)" stroke="#7a5510" stroke-width="1"/><circle cx="46" cy="7" r="2.4" fill="#ff5a7a"/><circle cx="74" cy="7" r="2.4" fill="#5ac8ff"/><circle cx="60" cy="6" r="2.8" fill="#7affb0"/></g>`; }
function _eBanner(id, st) { if (st < 4) return ''; return `<g transform="translate(0,4)"><path d="M36 128 L84 128 L80 140 L60 134 L40 140 Z" fill="url(#${id}gold)" stroke="#7a5510" stroke-width="1"/></g>`; }

/* ===== 게임별 모티브 (단계별로 완전히 다른 그림) ===== */
function _Mmafia(st, id) {
  if (st===0) return `<g filter="url(#${id}ds)"><path d="M56 38 L66 92 L60 100 L52 90 Z" fill="#8a7a66" stroke="#3a2c20"/><path d="M56 38 L59 66 L57 74 Z" fill="#fff" opacity=".18"/><path d="M63 72 L67 75 L63.5 77 Z" fill="#3a2c20"/><rect x="52" y="98" width="15" height="22" rx="3" fill="url(#${id}grip)" stroke="#1c140d"/><g stroke="#1c140d" stroke-width="1.2"><line x1="52" y1="104" x2="67" y2="104"/><line x1="52" y1="110" x2="67" y2="110"/><line x1="52" y1="116" x2="67" y2="116"/></g></g>`;
  if (st===1) return `<g filter="url(#${id}ds)"><path d="M60 30 L67 92 L60 102 L53 92 Z" fill="url(#${id}steel)" stroke="#46505c"/><path d="M60 30 L60 102 L56 92 L58 42 Z" fill="#fff" opacity=".4"/><rect x="42" y="90" width="36" height="7" rx="3.5" fill="url(#${id}p)" stroke="rgba(0,0,0,.3)"/><rect x="55" y="96" width="10" height="26" rx="4" fill="url(#${id}grip)"/><circle cx="60" cy="125" r="5" fill="url(#${id}p)" stroke="rgba(0,0,0,.3)"/></g>`;
  if (st===2) return `<g filter="url(#${id}ds)"><path d="M60 26 L68 90 L60 102 L52 90 Z" fill="url(#${id}steel)" stroke="#3f4854"/><path d="M60 26 L60 102 L55 90 L57 38 Z" fill="#fff" opacity=".45"/><line x1="60" y1="40" x2="60" y2="86" stroke="#9fb0c3" opacity=".6"/><path d="M38 90 Q44 82 52 90 L68 90 Q76 82 82 90 Q72 100 60 97 Q48 100 38 90 Z" fill="url(#${id}gold)" stroke="#8a5f12"/><rect x="55" y="96" width="10" height="26" rx="4" fill="url(#${id}grip)"/><circle cx="60" cy="125" r="6" fill="url(#${id}gold)" stroke="#8a5f12"/><circle cx="60" cy="125" r="3" fill="url(#${id}p)"/></g>`;
  if (st===3) return `<g><path d="M60 20 L70 88 L60 102 L50 88 Z" fill="url(#${id}p)" filter="url(#${id}bl)" opacity=".85"/><g filter="url(#${id}ds)"><path d="M60 20 L70 88 L60 102 L50 88 Z" fill="url(#${id}steel)" stroke="#3f4854"/><path d="M60 20 L60 102 L55 88 L57.5 32 Z" fill="#fff" opacity=".5"/><g fill="#fff"><circle cx="60" cy="40" r="1.8"/><circle cx="60" cy="54" r="1.8"/><circle cx="60" cy="68" r="1.8"/></g><path d="M36 90 Q44 80 52 89 L68 89 Q76 80 84 90 Q73 102 60 98 Q47 102 36 90 Z" fill="url(#${id}gold)" stroke="#8a5f12"/><rect x="55" y="96" width="10" height="28" rx="4" fill="url(#${id}grip)"/><circle cx="60" cy="127" r="6.5" fill="url(#${id}p)" stroke="#fff"/></g></g>`;
  return `<g><path d="M60 14 L73 86 L60 104 L47 86 Z" fill="url(#${id}p)" filter="url(#${id}bl)" opacity=".95"/><g filter="url(#${id}ds)"><path d="M60 14 L73 86 L60 104 L47 86 Z" fill="url(#${id}steel)" stroke="#2f3742" stroke-width="1.2"/><path d="M60 14 L60 104 L54 86 L57 24 Z" fill="#fff" opacity=".55"/><g fill="#fff"><circle cx="60" cy="30" r="2"/><circle cx="60" cy="46" r="2"/><circle cx="60" cy="62" r="2"/><circle cx="60" cy="78" r="2"/></g><path d="M32 88 Q40 74 50 86 Q55 80 60 84 Q65 80 70 86 Q80 74 88 88 Q74 104 60 99 Q46 104 32 88 Z" fill="url(#${id}gold)" stroke="#8a5f12"/><circle cx="32" cy="88" r="3.2" fill="#ff5a7a"/><circle cx="88" cy="88" r="3.2" fill="#5ac8ff"/><rect x="54.5" y="96" width="11" height="30" rx="4.5" fill="url(#${id}grip)"/><circle cx="60" cy="130" r="7.5" fill="url(#${id}gold)" stroke="#8a5f12"/><circle cx="60" cy="130" r="3.6" fill="url(#${id}p)"/></g></g>`;
}
function _gem(cx, cy, r, fill, id) { return `<g stroke="rgba(0,0,0,.28)" stroke-width="1" stroke-linejoin="round"><polygon points="${cx-r},${cy-r*.55} ${cx-r*.5},${cy-r} ${cx+r*.5},${cy-r} ${cx+r},${cy-r*.55} ${cx},${cy+r*1.1}" fill="${fill}"/><polygon points="${cx-r},${cy-r*.55} ${cx+r},${cy-r*.55} ${cx},${cy-r*.2}" fill="#fff" opacity=".5"/><line x1="${cx-r*.5}" y1="${cy-r}" x2="${cx}" y2="${cy+r*1.1}"/><line x1="${cx+r*.5}" y1="${cy-r}" x2="${cx}" y2="${cy+r*1.1}"/></g>`; }
function _Msplendor(st, id) {
  if (st===0) return `<g filter="url(#${id}ds)"><polygon points="46,58 54,48 70,50 76,66 66,84 50,80 42,68" fill="#7d756a" stroke="#3a352e"/><polygon points="54,48 70,50 60,62" fill="#fff" opacity=".15"/></g>`;
  if (st===1) return `<g filter="url(#${id}ds)">${_gem(60,68,18,`url(#${id}p)`,id)}</g>`;
  if (st===2) return `<g filter="url(#${id}ds)">${_gem(60,66,20,`url(#${id}p)`,id)}${_gem(40,86,9,`url(#${id}ph)`,id)}${_gem(80,86,9,`url(#${id}ph)`,id)}</g>`;
  if (st===3) return `<g>${_gem(60,60,22,`url(#${id}p)`,id)}${_gem(40,82,11,`url(#${id}ph)`,id)}${_gem(82,82,11,`url(#${id}ph)`,id)}${_gem(60,96,8,`url(#${id}p)`,id)}${_eSpk(id,[[44,50,3],[78,54,2.4],[60,100,2],[36,76,2]])}</g>`;
  return `<g>${_gem(60,56,26,`url(#${id}p)`,id)}${_gem(36,80,13,`url(#${id}ph)`,id)}${_gem(84,80,13,`url(#${id}ph)`,id)}${_gem(60,98,11,`url(#${id}p)`,id)}${_gem(46,40,8,`url(#${id}ph)`,id)}${_gem(76,40,8,`url(#${id}ph)`,id)}${_eSpk(id,[[40,44,3.5],[82,46,3],[58,104,2.6],[30,72,2.4],[92,70,2.4],[60,30,3]])}</g>`;
}
function _Mdavinci(st, id) {
  const gl = `<g stroke="url(#${id}lite)" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M54 54 L66 54 M60 54 L60 80 M54 80 L66 80"/></g>`;
  if (st===0) return `<g filter="url(#${id}ds)"><circle cx="60" cy="68" r="26" fill="#726a5e" stroke="#3a352e" stroke-width="2"/><path d="M58 46 L62 92" stroke="#3a352e" stroke-width="1.4"/><text x="60" y="76" font-size="22" font-family="serif" fill="#cfc7b8" text-anchor="middle">3</text></g>`;
  if (st===1) return `<g filter="url(#${id}ds)"><circle cx="60" cy="68" r="27" fill="url(#${id}p)" stroke="rgba(0,0,0,.3)" stroke-width="2"/><circle cx="60" cy="68" r="20" fill="#10141d" opacity=".5"/>${Array.from({length:12},(_,i)=>{const a=i/12*Math.PI*2;return `<line x1="${(60+Math.cos(a)*23).toFixed(1)}" y1="${(68+Math.sin(a)*23).toFixed(1)}" x2="${(60+Math.cos(a)*27).toFixed(1)}" y2="${(68+Math.sin(a)*27).toFixed(1)}" stroke="rgba(0,0,0,.4)" stroke-width="1.6"/>`}).join('')}${gl}</g>`;
  if (st===2) return `<g filter="url(#${id}ds)"><circle cx="60" cy="68" r="29" fill="url(#${id}p)" stroke="url(#${id}gold)" stroke-width="3"/><circle cx="60" cy="68" r="21" fill="#0c0f17" opacity=".55"/>${Array.from({length:16},(_,i)=>{const a=i/16*Math.PI*2;return `<circle cx="${(60+Math.cos(a)*25).toFixed(1)}" cy="${(68+Math.sin(a)*25).toFixed(1)}" r="1.3" fill="url(#${id}gold)"/>`}).join('')}${gl}</g>`;
  if (st===3) return `<g><g filter="url(#${id}ds)"><circle cx="60" cy="68" r="30" fill="none" stroke="url(#${id}p)" stroke-width="4"/><circle cx="60" cy="68" r="22" fill="none" stroke="url(#${id}ph)" stroke-width="2.5" stroke-dasharray="4 5"/><circle cx="60" cy="68" r="15" fill="#0c0f17" opacity=".5"/>${Array.from({length:8},(_,i)=>{const a=i/8*Math.PI*2+.2;return `<text x="${(60+Math.cos(a)*26).toFixed(1)}" y="${(70+Math.sin(a)*26).toFixed(1)}" font-size="6" fill="#fff" text-anchor="middle" opacity=".85">${'✦✧⟡◇✶✷❖✸'[i]}</text>`}).join('')}${gl}</g></g>`;
  return `<g><g filter="url(#${id}ds)"><circle cx="60" cy="66" r="36" fill="none" stroke="url(#${id}p)" stroke-width="5"/><circle cx="60" cy="66" r="28" fill="none" stroke="url(#${id}ph)" stroke-width="3" stroke-dasharray="3 6"/><circle cx="60" cy="66" r="18" fill="none" stroke="url(#${id}lite)" stroke-width="2"/><circle cx="60" cy="66" r="11" fill="#0c0f17" opacity=".5"/>${Array.from({length:10},(_,i)=>{const a=i/10*Math.PI*2;return `<text x="${(60+Math.cos(a)*32).toFixed(1)}" y="${(69+Math.sin(a)*32).toFixed(1)}" font-size="7" fill="#fff" text-anchor="middle">${'✦✧⟡◇✶✷❖✸⬡✺'[i]}</text>`}).join('')}<g stroke="url(#${id}lite)" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M53 52 L67 52 M60 52 L60 82 M53 82 L67 82"/></g></g>${_eSpk(id,[[34,44,3],[88,48,3],[60,108,2.6],[26,70,2.4]])}</g>`;
}
function _tile(x, y, w, h, rot, fill, num) { return `<g transform="rotate(${rot} ${x+w/2} ${y+h/2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="rgba(0,0,0,.32)" stroke-width="1.4"/>${num?`<text x="${x+w/2}" y="${y+h*0.62}" font-size="${h*0.5}" font-weight="900" font-family="sans-serif" fill="${num.c}" text-anchor="middle">${num.t}</text>`:''}</g>`; }
function _star(cx, cy, r, fill) { return `<polygon points="${Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.45:r;return `${(cx+Math.cos(a)*rr).toFixed(1)},${(cy+Math.sin(a)*rr).toFixed(1)}`}).join(' ')}" fill="${fill}" stroke="rgba(0,0,0,.3)" stroke-width="1"/>`; }
function _Mrummikub(st, id) {
  if (st===0) return `<g filter="url(#${id}ds)">${_tile(48,46,26,40,-4,'#cfc6b4',{t:'7',c:'#9a3b3b'})}</g>`;
  if (st===1) return `<g filter="url(#${id}ds)">${_tile(40,50,24,38,-10,'#e8e2d2',{t:'3',c:'#2b6cff'})}${_tile(58,48,24,38,8,`url(#${id}lite)`,{t:'7',c:'#d8443f'})}</g>`;
  if (st===2) return `<g filter="url(#${id}ds)">${_tile(48,46,28,42,0,`url(#${id}p)`,null)}${_star(62,67,14,`url(#${id}gold)`)}</g>`;
  if (st===3) return `<g><g filter="url(#${id}ds)">${_tile(36,52,22,36,-12,'#e8e2d2',{t:'1',c:'#2faa55'})}${_tile(62,52,22,36,12,'#e8e2d2',{t:'9',c:'#e0a020'})}${_tile(48,46,28,44,0,`url(#${id}p)`,null)}${_star(62,68,16,`url(#${id}gold)`)}</g>${_eSpk(id,[[44,48,2.6],[78,52,2.4],[60,98,2.2]])}</g>`;
  return `<g>${_star(60,66,46,`url(#${id}p)`).replace('stroke-width="1"','stroke-width="0" opacity=".22"')}<g filter="url(#${id}ds)">${_tile(30,54,22,36,-16,`url(#${id}ph)`,{t:'3',c:'#fff'})}${_tile(68,54,22,36,16,`url(#${id}ph)`,{t:'7',c:'#fff'})}${_tile(46,44,30,48,0,`url(#${id}p)`,null)}${_star(61,68,18,`url(#${id}gold)`)}<circle cx="61" cy="64" r="5" fill="#fff" opacity=".8"/></g>${_eSpk(id,[[40,42,3.2],[82,46,3],[60,104,2.6],[28,72,2.4],[92,70,2.4]])}</g>`;
}
function _card(x, y, w, h, rot, fill, oval) { return `<g transform="rotate(${rot} ${x+w/2} ${y+h/2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="#fff" stroke-width="2"/><ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w*0.34}" ry="${h*0.42}" transform="rotate(38 ${x+w/2} ${y+h/2})" fill="${oval||'#fff'}" opacity="${oval?1:.92}"/></g>`; }
function _wild(cx, cy, r) { return `<g><path d="M${cx} ${cy-r} A ${r} ${r} 0 0 1 ${cx+r} ${cy} L ${cx} ${cy} Z" fill="#e0444a"/><path d="M${cx+r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy+r} L ${cx} ${cy} Z" fill="#1fa85a"/><path d="M${cx} ${cy+r} A ${r} ${r} 0 0 1 ${cx-r} ${cy} L ${cx} ${cy} Z" fill="#2b6cff"/><path d="M${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy-r} L ${cx} ${cy} Z" fill="#e8b21e"/></g>`; }
function _Muno(st, id) {
  if (st===0) return `<g filter="url(#${id}ds)">${_card(48,46,26,42,-5,'#b03a3a','#e2d9c9')}</g>`;
  if (st===1) return `<g filter="url(#${id}ds)">${_card(38,50,24,40,-12,'#2b6cff')}${_card(58,48,24,40,10,'#e0444a')}</g>`;
  if (st===2) return `<g filter="url(#${id}ds)">${_card(34,54,22,38,-20,'#1fa85a')}${_card(50,48,22,40,-2,'#e8b21e')}${_card(66,54,22,38,18,'#2b6cff')}</g>`;
  if (st===3) return `<g><g filter="url(#${id}ds)"><rect x="44" y="44" width="32" height="48" rx="6" fill="#15151c" stroke="#fff" stroke-width="2.4"/><g transform="translate(0,2)">${_wild(60,68,15)}</g></g>${_eSpk(id,[[42,50,2.6],[80,52,2.4],[60,98,2.2]])}</g>`;
  return `<g><g opacity=".9">${_card(20,40,18,28,-26,'#e0444a')}${_card(86,42,18,28,24,'#1fa85a')}${_card(26,96,18,28,18,'#2b6cff')}</g><g filter="url(#${id}ds)"><rect x="42" y="40" width="36" height="54" rx="7" fill="#0e0e16" stroke="url(#${id}gold)" stroke-width="3"/><g transform="translate(0,3)">${_wild(60,67,18)}</g><circle cx="60" cy="67" r="18" fill="none" stroke="#fff" stroke-width="1.5" opacity=".5"/></g>${_eSpk(id,[[36,44,3.2],[86,46,3],[60,104,2.6],[24,74,2.4]])}</g>`;
}
function _Mrace(st, id) {
  const flag = (sc) => `<g transform="translate(60,68) scale(${sc})"><line x1="-14" y1="-22" x2="-14" y2="26" stroke="url(#${id}lite)" stroke-width="4" stroke-linecap="round"/><g transform="translate(-12,-20)">${[0,1,2,3,4].map(r=>[0,1,2,3].map(cc=>`<rect x="${cc*7}" y="${r*7}" width="7" height="7" fill="${(r+cc)%2?'#fff':'#1a1a1a'}"/>`).join('')).join('')}<rect width="28" height="35" fill="none" stroke="rgba(0,0,0,.3)"/></g></g>`;
  if (st<2) return `<g filter="url(#${id}ds)">${flag(.85)}</g>`;
  if (st<4) return `<g><g filter="url(#${id}ds)">${flag(1)}</g>${st>=3?_eSpk(id,[[40,48,2.6],[82,54,2.4]]):''}</g>`;
  return `<g><path d="M44 96 L76 96 L72 112 L48 112 Z" fill="url(#${id}gold)" stroke="#7a5510"/><path d="M40 60 Q30 62 36 74 Q42 78 46 72" fill="none" stroke="url(#${id}gold)" stroke-width="3"/><path d="M80 60 Q90 62 84 74 Q78 78 74 72" fill="none" stroke="url(#${id}gold)" stroke-width="3"/><g filter="url(#${id}ds)">${flag(1.05)}</g>${_eSpk(id,[[36,46,3],[86,50,3],[60,104,2.4]])}</g>`;
}
function _Mhunt(st, id) {
  const mag = (sc) => `<g transform="translate(58,64) scale(${sc})"><circle cx="0" cy="0" r="20" fill="#0c0f17" opacity=".5" stroke="url(#${id}p)" stroke-width="4"/><line x1="15" y1="15" x2="34" y2="34" stroke="url(#${id}p)" stroke-width="6" stroke-linecap="round"/></g>`;
  if (st<3) return `<g filter="url(#${id}ds)">${mag(st<1?.85:1)}<circle cx="58" cy="64" r="9" fill="rgba(255,255,255,.18)"/></g>`;
  if (st<4) return `<g><g filter="url(#${id}ds)">${mag(1)}<g transform="translate(58,64)"><ellipse cx="0" cy="0" rx="12" ry="8" fill="#fff" opacity=".9"/><circle cx="0" cy="0" r="5" fill="url(#${id}p)"/><circle cx="0" cy="0" r="2.2" fill="#0c0f17"/></g></g>${_eSpk(id,[[40,46,2.6],[80,50,2.4]])}</g>`;
  return `<g><g filter="url(#${id}ds)">${mag(1.1)}<g transform="translate(58,64)"><ellipse cx="0" cy="0" rx="14" ry="9" fill="#fff"/><circle cx="0" cy="0" r="6" fill="url(#${id}p)"/><circle cx="0" cy="0" r="2.6" fill="#0c0f17"/><path d="M-14 0 Q0 -11 14 0 Q0 11 -14 0 Z" fill="none" stroke="url(#${id}p)" stroke-width="1.5" opacity=".6"/></g></g>${_eSpk(id,[[34,46,3],[86,50,3],[60,104,2.4]])}</g>`;
}
function _Mdefault(st, id) { return `<g filter="url(#${id}ds)">${_star(60,66,st>=4?30:st>=2?24:20,`url(#${id}p)`)}<circle cx="60" cy="62" r="${st>=4?7:5}" fill="#fff" opacity=".7"/></g>`; }
const _MOTIF = { mafia:_Mmafia, splendor:_Msplendor, davinci:_Mdavinci, rummikub:_Mrummikub, uno:_Muno, race:_Mrace, hunt:_Mhunt };

function emblemHTML(game, score, size) {
  const t = tierForScore(score || 0);
  const c = _EMB[t.key] || _EMB.wood, st = c.st, pal = c.pal, glow = c.glow;
  const id = 'e' + (++_embN) + '_';
  const fw = st >= 4 ? 5 : st >= 2 ? 3.5 : 2.5;
  const motif = (_MOTIF[game] || _Mdefault)(st, id);
  let bg = `<rect width="120" height="150" fill="url(#${id}bg)" clip-path="url(#${id}sc)"/>`
    + `<g clip-path="url(#${id}sc)">${_eRays(id, 28, 18, st>=4?96:st>=3?80:64, st>=4?.6:st>=3?.4:st>=2?.22:.1)}</g>`
    + `<ellipse class="egl" cx="60" cy="66" rx="60" ry="66" fill="url(#${id}gl)" clip-path="url(#${id}sc)"/>`;
  let shell = `<path d="${_SHELL}" fill="url(#${id}p)"/><path d="${_SHELL}" fill="#0a0e16" opacity=".5"/>`
    + `<path d="${_SHELL}" fill="none" stroke="url(#${id}p)" stroke-width="${fw}"/>`
    + `<path d="${_SHELL}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1" transform="scale(.965)" transform-origin="60 75"/>`
    + `<path d="M60 10 L102 26 V46 Q60 34 18 46 V26 Z" fill="#fff" opacity="${st>=1?.16:.08}" clip-path="url(#${id}sc)"/>`;
  let inner = `<g clip-path="url(#${id}sc)"><ellipse cx="60" cy="64" rx="34" ry="40" fill="${glow}" opacity="${st>=4?.22:st>=3?.16:.1}"/>${st>=2?`<circle cx="60" cy="68" r="40" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width="6"/>`:''}</g>`;
  const big = `<g transform="translate(60 71) scale(1.08) translate(-60 -71)">${motif}</g>`;
  const extra = st >= 4 ? `<g clip-path="url(#${id}sc)">${_eSpk(id, [[26,40,3],[96,44,3],[30,100,2.6],[92,98,2.6],[60,24,2.4]])}</g>` : '';
  return `<span class="emb emb--${size || 'sm'} emb--${t.key}" title="${t.fullName}"><svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + `${_eDefs(id, pal, glow, st)}${bg}${_eWings(id, st)}${shell}${inner}${_eFil(id, st)}${big}${extra}${_eCrown(id, st)}${_eBanner(id, st)}</svg></span>`;
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
