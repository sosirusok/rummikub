/* =========================================================================
   engage.js — 계정 레벨 · 프로필 · 통합 랭킹 (코인/상점/업적/출석 전부 제거됨)
   - 서버 rk_meta 가 레벨/XP(평생 플레이 점수에서 파생)를 돌려준다. 클라는 표시만.
   - 통합 랭킹: rk_leaderboard_total.
   의존: ui-core(app/esc/setScreen/toast), net.js(apiMeta/apiLeaderboardTotal),
         tiers(nameHTML/emblemHTML/tierForScore/GAME_NAME). app.js 전역: ME/TOKEN/goHome.
   ========================================================================= */

const ENGAGE = { meta: null };

// 이름 표시(예전 칭호/이펙트 제거 — 항상 티어색 이름만). app.js 호출부 호환 위해 시그니처 유지.
function decoNameHTML(name, score) { return nameHTML(name, score); }

/* 헤더 레벨 칩 (프로필 진입) ---------------------------------------------- */
function engageChipHTML() {
  const m = ENGAGE.meta;
  if (!m) return `<button class="eng-chip" data-act="eng_open"><span class="eng-chip__lv">Lv.…</span></button>`;
  const pct = m.xpForNext ? Math.max(4, Math.round((m.xpInLevel / m.xpForNext) * 100)) : 0;
  return `<button class="eng-chip" data-act="eng_open" aria-label="내 프로필">
    <span class="eng-chip__lv">Lv.${m.level || 1}</span>
    <span class="eng-chip__bar"><i style="width:${pct}%"></i></span></button>`;
}
function refreshEngageChip() { document.querySelectorAll('.eng-chip').forEach(el => { el.outerHTML = engageChipHTML(); }); }

/* 메타 로드 -------------------------------------------------------------- */
async function loadEngage() {
  if (!TOKEN) return null;
  const m = await apiMeta(TOKEN);
  if (m === undefined) return ENGAGE.meta;     // 일시 오류 → 기존 유지
  ENGAGE.meta = m || null;
  refreshEngageChip();
  return ENGAGE.meta;
}

/* 액션 위임 --------------------------------------------------------------- */
function engageAct(act) {
  switch (act) {
    case 'eng_open': showEngage(); return true;
    case 'eng_back': goHome(); return true;
  }
  return false;
}

/* 프로필 화면 (레벨 + 게임별 티어) --------------------------------------- */
function showEngage() {
  setScreen('engage');
  const m = ENGAGE.meta;
  app().innerHTML = `
    <section class="screen screen--engage">
      <header class="room__top"><button class="btn btn--ghost" data-act="eng_back">← 홈</button>
        <b style="margin-left:6px">🎮 내 프로필</b><span class="spacer"></span></header>
      <div class="grow scrollable eng-body">${m ? engProfileBody(m) : '<p class="muted center" style="padding:30px">불러오는 중…</p>'}</div>
    </section>`;
  if (!m) loadEngage().then(() => { if (SCREEN === 'engage') showEngage(); });
}

function engProfileBody(m) {
  const pct = m.xpForNext ? Math.min(100, Math.round((m.xpInLevel / m.xpForNext) * 100)) : 0;
  const games = ['rummikub', 'davinci', 'splendor', 'uno', 'mafia', 'race', 'hunt'];
  const rows = games.map(g => {
    const gs = (ME.games && ME.games[g]) ? ME.games[g] : { score: 0, wins: 0, losses: 0 };
    const t = tierForScore(gs.score || 0);
    return `<li class="prof-grow" style="--tc:${t.color}">
      <span class="prof-grow__emb">${emblemHTML(g, gs.score || 0, 'eq')}</span>
      <span class="prof-grow__name">${GAME_NAME[g]}</span>
      <span class="prof-grow__tier">${t.fullName}</span>
      <span class="prof-grow__rec muted">${gs.wins || 0}승 ${gs.losses || 0}패 · ${gs.score || 0}</span></li>`;
  }).join('');
  return `<div class="eng-pane">
    <div class="eng-hero">
      <div class="eng-hero__name">${nameHTML(ME.real_name, null)}</div>
      <div class="eng-level">
        <div class="eng-level__row"><span class="eng-level__lv">Lv. ${m.level || 1}</span>
          <span class="muted">${m.xpInLevel || 0} / ${m.xpForNext || 0} XP</span></div>
        <div class="eng-level__bar"><i style="width:${pct}%"></i></div>
      </div>
      <div class="eng-stats"><span>🎮 총 <b>${m.games || 0}</b>판</span><span>🏆 <b>${m.wins || 0}</b>승</span></div>
    </div>
    <div class="eng-card"><div class="eng-card__t">게임별 티어</div><ul class="prof-grows">${rows}</ul></div>
    <p class="muted center" style="padding:8px 14px;font-size:12px;line-height:1.6">레벨은 게임을 즐길수록 함께 오릅니다. 게임마다 티어·전적은 따로 쌓여요.</p>
  </div>`;
}

/* 통합 랭킹 (app.js showRank 의 'total' 탭) ------------------------------- */
async function totalRankHTML() {
  const list = await apiLeaderboardTotal();
  if (!list.length) return '<li class="muted center" style="padding:20px">아직 기록이 없어요</li>';
  return list.map((u, i) => `<li class="board-rank__row ${u.id === ME.id ? 'is-me' : ''}">
    <span class="pos ${i < 3 ? 'pos--top' : ''}">${i < 3 ? ['🥇', '🥈', '🥉'][i] : (i + 1)}</span>
    <span>${nameHTML(u.real_name, u.total)}<small class="muted"> ${(u.wins || 0)}승</small></span>
    <span></span>
    <span class="eng-total"><b>${(u.total || 0).toLocaleString()}</b>점</span></li>`).join('');
}

window.engageAct = engageAct;
