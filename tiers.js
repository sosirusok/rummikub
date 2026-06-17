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
    wood:        { 2:[220,0], 3:[220,65,0], 4:[275,230,15,0] },
    iron:        { 2:[210,-20], 3:[210,60,-20], 4:[265,225,10,-20] },
    bronze:      { 2:[205,-40], 3:[205,55,-40], 4:[255,220,5,-40] },
    silver:      { 2:[205,-65], 3:[205,40,-65], 4:[255,220,-10,-65] },
    gold:        { 2:[205,-90], 3:[205,25,-90], 4:[255,220,-25,-90] },
    platinum:    { 2:[200,-155], 3:[200,-20,-155], 4:[250,215,-70,-155] },
    emerald:     { 2:[195,-195], 3:[195,-50,-195], 4:[245,210,-100,-195] },
    diamond:     { 2:[190,-235], 3:[190,-80,-235], 4:[240,205,-130,-235] },
    master:      { 2:[190,-260], 3:[190,-95,-260], 4:[240,205,-145,-260] },
    grandmaster: { 2:[190,-300], 3:[190,-125,-300], 4:[235,200,-175,-300] },
    challenger:  { 2:[185,-365], 3:[185,-170,-365], 4:[230,195,-220,-365] },
  },
  davinci: {
    wood:        { 2:[200,0], 3:[200,65,0], 4:[250,215,15,0] },
    iron:        { 2:[180,-40], 3:[180,60,-40], 4:[225,205,10,-40] },
    bronze:      { 2:[160,-80], 3:[160,55,-80], 4:[200,195,5,-80] },
    silver:      { 2:[160,-80], 3:[160,55,-80], 4:[200,195,5,-80] },
    gold:        { 2:[160,-105], 3:[160,40,-105], 4:[200,195,-10,-105] },
    platinum:    { 2:[155,-145], 3:[155,10,-145], 4:[195,190,-40,-145] },
    emerald:     { 2:[150,-185], 3:[150,-20,-185], 4:[190,185,-70,-185] },
    diamond:     { 2:[150,-225], 3:[150,-50,-225], 4:[185,180,-100,-225] },
    master:      { 2:[150,-225], 3:[150,-50,-225], 4:[185,180,-100,-225] },
    grandmaster: { 2:[145,-265], 3:[145,-80,-265], 4:[180,175,-130,-265] },
    challenger:  { 2:[140,-330], 3:[140,-125,-330], 4:[175,170,-175,-330] },
  },
  uno: {
    wood:        { 2:[185,0], 3:[185,65,0], 4:[230,195,15,0] },
    iron:        { 2:[165,-40], 3:[165,60,-40], 4:[205,185,10,-40] },
    bronze:      { 2:[145,-80], 3:[145,55,-80], 4:[180,175,5,-80] },
    silver:      { 2:[140,-120], 3:[140,25,-120], 4:[175,170,-25,-120] },
    gold:        { 2:[140,-145], 3:[140,10,-145], 4:[175,170,-40,-145] },
    platinum:    { 2:[140,-170], 3:[140,-5,-170], 4:[175,170,-55,-170] },
    emerald:     { 2:[140,-195], 3:[140,-20,-195], 4:[175,170,-70,-195] },
    diamond:     { 2:[140,-220], 3:[140,-35,-220], 4:[175,170,-85,-220] },
    master:      { 2:[135,-260], 3:[135,-65,-260], 4:[170,165,-115,-260] },
    grandmaster: { 2:[135,-285], 3:[135,-80,-285], 4:[170,165,-130,-285] },
    challenger:  { 2:[130,-325], 3:[130,-110,-325], 4:[165,160,-160,-325] },
  },
  splendor: {
    wood:        { 2:[250,0], 3:[250,65,0], 4:[315,270,15,0] },
    iron:        { 2:[230,-40], 3:[230,60,-40], 4:[290,260,10,-40] },
    bronze:      { 2:[225,-60], 3:[225,55,-60], 4:[280,255,5,-60] },
    silver:      { 2:[225,-85], 3:[225,40,-85], 4:[280,255,-10,-85] },
    gold:        { 2:[220,-125], 3:[220,10,-125], 4:[275,250,-40,-125] },
    platinum:    { 2:[215,-165], 3:[215,-20,-165], 4:[270,245,-70,-165] },
    emerald:     { 2:[210,-205], 3:[210,-50,-205], 4:[265,240,-100,-205] },
    diamond:     { 2:[210,-245], 3:[210,-80,-245], 4:[260,235,-130,-245] },
    master:      { 2:[205,-330], 3:[205,-140,-330], 4:[255,225,-190,-330] },
    grandmaster: { 2:[205,-330], 3:[205,-140,-330], 4:[255,225,-190,-330] },
    challenger:  { 2:[200,-395], 3:[200,-185,-395], 4:[250,220,-235,-395] },
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
// 랭킹: (이모지)점수(이모지) → 점수 + 오른쪽 엠블럼(효과 버전). game 필수.
function scoreTierHTML(game, score) {
  const t = tierForScore(score || 0);
  return `<span class="score-tier" style="--tc:${t.color}"><b>${score || 0}</b>${emblemHTML(game, score, 'eqs')}</span>`;
}
// 티어 배지: 이모지 → 엠블럼(효과) + 티어명. game 필수.
function tierBadgeHTML(game, score) {
  const t = tierForScore(score || 0);
  return `<span class="tier-badge" style="--tc:${t.color}">${emblemHTML(game, score, 'xs')}<span class="tier-badge__t">${t.fullName}</span></span>`;
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
// 칩 + 오른쪽에 장착 엠블럼(효과 버전). 점수 오른쪽에 엠블럼 노출용(홈/미리보기/꾸미기옵션).
function decoChipEmbHTML(game, score, size) {
  if (!game) return '';
  return `${decoChipHTML(game, score)}${emblemHTML(game, score, size || 'eqs')}`;
}

/* ----------------------------- 티어 엠블럼(이미지 에셋 — 좀비고풍 77종, emblems/<game>_<tier>.png) ----------------------------- */
const TIER_INFO = {}; TIER_DEFS.forEach(d => TIER_INFO[d.key] = { name: d.name, color: d.color, logo: d.logo });
const EMBLEM_GAMES = ['mafia', 'splendor', 'davinci', 'uno', 'rummikub', 'race', 'hunt'];
function emblemHTML(game, score, size) {
  const t = tierForScore(score || 0);
  const g = EMBLEM_GAMES.indexOf(game) >= 0 ? game : 'mafia';
  const src = `emblems/${g}_${t.key}.png`;
  const bolt = t.key === 'challenger' ? '<i class="emb-bolt"></i>' : '';   // 챌린저 전용 낙뢰 레이어
  return `<span class="emb emb--${size || 'sm'} emb--${t.key}" title="${t.fullName}" style="--src:url(${src})"><img src="${src}" alt="" loading="lazy" decoding="async">${bolt}</span>`;
}

/* ----------------------------- 점수 증감 테이블(티어 화면) ----------------------------- */
function _scCell(v) { const c = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'; return `<td class="sc-c sc-${c}">${v > 0 ? '+' + v : v}</td>`; }
function _scBoardTable(game, n) {
  const tbl = SCORE_TABLE[game];
  let head = '<th>티어</th>'; for (let r = 1; r <= n; r++) head += `<th>${r}위</th>`;
  const body = TIER_KEY_CUTS.map(([key, min]) => {
    const info = TIER_INFO[key];
    return `<tr><th class="sc-tier" style="--tc:${info.color}">${emblemHTML(game, min, 'xs')}<span class="sc-tier__t">${info.name}</span></th>${(tbl[key][n] || []).map(_scCell).join('')}</tr>`;
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
    const body = TIER_KEY_CUTS.map(([key, min]) => {
      const info = TIER_INFO[key]; const b = MAFIA_BASE[key];
      return `<tr><th class="sc-tier" style="--tc:${info.color}">${emblemHTML('mafia', min, 'xs')}<span class="sc-tier__t">${info.name}</span></th>${_scCell(b.mwin)}${_scCell(b.cwin)}${_scCell(b.loss)}</tr>`;
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
    return `<tr><th class="sc-tier" style="--tc:${info.color}">${emblemHTML(game, min, 'xs')}<span class="sc-tier__t">${info.name}</span></th>${_scCell(a)}${_scCell(b)}</tr>`;
  }).join('');
  return `<div class="sc-wrap"><div class="sc-title">📊 티어별 점수 증감(대략)</div>`
    + `<div class="sc-sub"><table class="sc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
    + `<p class="sc-note">${isRace ? '운빨로 등수가 갈려 실제값은 달라질 수 있어요.' : '역할·생존·색출 수에 따라 변동해요.'} 연승 보너스는 별도(다이아 이하 2연승+).</p></div>`;
}
