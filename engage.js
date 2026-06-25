/* =========================================================================
   engage.js — 흥미 요소(코인·계정레벨·업적·상점·출석·통합랭킹) 클라이언트
   - 서버 권위: rk_meta / rk_buy_item / rk_equip / rk_claim_daily / rk_leaderboard_total
   - 코인/XP 는 누적 전적에서 파생(서버). 클라는 표시·구매요청만.
   의존: ui-core(app/esc/setScreen/toast/openSheet/closeSheet), net.js(api*), tiers(nameHTML 등).
   app.js 전역: ME/TOKEN/goHome/showRank. handleAct 가 'eng_' 접두 액션을 engageAct 로 위임.
   ========================================================================= */

const ENGAGE = { meta: null, _dailyShown: false, _achSeen: null };
let ENG_TAB = 'me';   // me | ach | shop

/* 이름 이펙트/칭호 표시 헬퍼 ------------------------------------------------ */
// 점수 티어색 + 장착 이펙트 클래스. score=null 이면 중립색(숨김).
function nameFxHTML(name, score, effect) {
  const fx = effect ? ` name-fx name-fx--${effect}` : '';
  if (score == null) return `<span class="tier-name tier-name--plain${fx}">${esc(name)}</span>`;
  const t = tierForScore(score || 0);
  return `<span class="tier-name${fx}" style="--tc:${t.color}">${esc(name)}</span>`;
}
function titleChipHTML(title) { return title ? `<span class="utitle">${esc(title)}</span>` : ''; }
// 이름 + (이펙트) + 칭호 칩 한 줄
function decoNameHTML(name, score, title, effect) {
  return `${nameFxHTML(name, score, effect)}${title ? ' ' + titleChipHTML(title) : ''}`;
}

/* 헤더 코인·레벨 칩 -------------------------------------------------------- */
function engageChipHTML() {
  const m = ENGAGE.meta;
  if (!m) return `<button class="eng-chip" data-act="eng_open"><span class="eng-chip__coin">💰 …</span></button>`;
  const coins = (m.coins || 0).toLocaleString();
  const pct = m.xpForNext ? Math.max(4, Math.round((m.xpInLevel / m.xpForNext) * 100)) : 0;
  const dot = (m.daily && m.daily.claimable) ? '<span class="eng-chip__dot" title="출석 보상"></span>' : '';
  return `<button class="eng-chip" data-act="eng_open">
    <span class="eng-chip__lv">Lv.${m.level || 1}</span>
    <span class="eng-chip__bar"><i style="width:${pct}%"></i></span>
    <span class="eng-chip__coin">💰 ${coins}</span>${dot}</button>`;
}
function refreshEngageChip() {
  document.querySelectorAll('.eng-chip').forEach(el => { el.outerHTML = engageChipHTML(); });
}

/* 메타 로드(+신규 업적 토스트, +출석 시트) -------------------------------- */
async function loadEngage(opts) {
  if (!TOKEN) return null;
  const m = await apiMeta(TOKEN);
  if (m === undefined) return ENGAGE.meta;     // 일시 오류 → 기존 유지
  ENGAGE.meta = m || null;
  refreshEngageChip();
  if (m && Array.isArray(m.newly) && m.newly.length) {
    // 새로 해금된 업적 축하(누적 보상 합산 표기)
    const sum = m.newly.reduce((a, n) => a + (n.reward || 0), 0);
    const names = m.newly.map(n => `${n.icon || '🏆'} ${n.name}`).join(', ');
    toast(`🏆 업적 달성: ${names} (+💰${sum})`, true);
  }
  if (m && m.daily && m.daily.claimable && opts && opts.dailyPrompt && !ENGAGE._dailyShown) {
    ENGAGE._dailyShown = true;
    showDailySheet(m);
  }
  return ENGAGE.meta;
}

/* 출석 보상 시트 ---------------------------------------------------------- */
function showDailySheet(m) {
  const d = m.daily || {};
  openSheet(`<h3 class="sheet__title">📅 출석 보상</h3>
    <p class="muted" style="padding:0 6px 6px;line-height:1.5">매일 접속하면 코인을 받아요. 연속 출석할수록 더 많이!</p>
    <div class="daily-card">
      <div class="daily-card__streak">🔥 연속 출석 <b>${d.nextStreak || 1}</b>일째</div>
      <div class="daily-card__reward">오늘 보상 💰 <b>${d.reward || 50}</b></div>
    </div>
    <button class="btn btn--primary btn--lg" data-act="eng_daily">💰 ${d.reward || 50} 코인 받기</button>
    <button class="btn btn--ghost btn--lg" data-act="closeSheet">나중에</button>`);
}

/* 액션 위임 --------------------------------------------------------------- */
function engageAct(act, el) {
  switch (act) {
    case 'eng_open': ENG_TAB = 'me'; showEngage(); return true;
    case 'eng_back': goHome(); return true;
    case 'eng_tab': ENG_TAB = el.dataset.tab; showEngage(); return true;
    case 'eng_daily': doClaimDaily(); return true;
    case 'eng_buy': doBuyItem(el.dataset.key); return true;
    case 'eng_equip': doEquipItem(el.dataset.kind, el.dataset.key, el.dataset.on === '1'); return true;
  }
  return false;
}

async function doClaimDaily() {
  const r = await apiClaimDaily(TOKEN);
  if (r && r.ok) { toast(`📅 출석 완료! 💰+${r.reward} (연속 ${r.streak}일)`, true); }
  else if (r && r.reason === 'already') toast('오늘은 이미 받았어요');
  else toast('잠시 후 다시 시도하세요');
  closeSheet();
  await loadEngage();
  if (SCREEN === 'engage') showEngage(); else if (SCREEN === 'home') refreshEngageChip();
}
async function doBuyItem(key) {
  const r = await apiBuyItem(TOKEN, key);
  if (r && r.ok && r.already) toast('이미 보유한 아이템이에요');
  else if (r && r.ok) toast('🛒 구매 완료!', true);
  else if (r && r.reason === 'no_coins') toast('코인이 부족해요');
  else toast('구매 실패, 다시 시도하세요');
  await loadEngage();
  if (SCREEN === 'engage') showEngage();
}
async function doEquipItem(kind, key, isOn) {
  const r = await apiEquip(TOKEN, kind, isOn ? '' : key);   // 이미 장착 중이면 해제
  if (r && r.ok) { toast(isOn ? '장착 해제' : '✨ 장착 완료!', true); }
  else if (r && r.reason === 'not_owned') toast('보유하지 않은 아이템이에요');
  else toast('처리 실패');
  await loadEngage();
  if (SCREEN === 'engage') showEngage();
}

/* 화면: 프로필 허브(레벨/출석) · 업적 · 상점 ------------------------------ */
function showEngage() {
  setScreen('engage');
  const m = ENGAGE.meta;
  const tab = (k, label) => `<button class="chip ${ENG_TAB === k ? 'is-active' : ''}" data-act="eng_tab" data-tab="${k}">${label}</button>`;
  let body = '';
  if (!m) body = `<p class="muted center" style="padding:30px">불러오는 중…</p>`;
  else if (ENG_TAB === 'me') body = engMeBody(m);
  else if (ENG_TAB === 'ach') body = engAchBody(m);
  else body = engShopBody(m);
  app().innerHTML = `
    <section class="screen screen--engage">
      <header class="room__top"><button class="btn btn--ghost" data-act="eng_back">← 홈</button>
        <b style="margin-left:6px">🎁 내 프로필</b><span class="spacer"></span>
        <span class="eng-coins">💰 ${m ? (m.coins || 0).toLocaleString() : '…'}</span></header>
      <nav class="game-select game-select--wrap">${tab('me', '레벨·출석')}${tab('ach', '업적')}${tab('shop', '상점')}</nav>
      <div class="grow scrollable eng-body">${body}</div>
    </section>`;
  if (!m) loadEngage().then(() => { if (SCREEN === 'engage') showEngage(); });
}

function engMeBody(m) {
  const pct = m.xpForNext ? Math.min(100, Math.round((m.xpInLevel / m.xpForNext) * 100)) : 0;
  const d = m.daily || {};
  const nm = decoNameHTML(ME.real_name, null, (m.equipped && m.equipped.title) || '', (m.equipped && m.equipped.effect) || '');
  const unlocked = (m.achievements || []).filter(a => a.unlocked).length;
  return `<div class="eng-pane">
    <div class="eng-hero">
      <div class="eng-hero__name">${nm}</div>
      <div class="eng-level">
        <div class="eng-level__row"><span class="eng-level__lv">Lv. ${m.level || 1}</span>
          <span class="muted">${m.xpInLevel || 0} / ${m.xpForNext || 0} XP</span></div>
        <div class="eng-level__bar"><i style="width:${pct}%"></i></div>
      </div>
      <div class="eng-stats">
        <span>💰 코인 <b>${(m.coins || 0).toLocaleString()}</b></span>
        <span>🏆 업적 <b>${unlocked}/${(m.achievements || []).length}</b></span>
        <span>🎮 ${m.games || 0}판 · ${m.wins || 0}승</span>
      </div>
    </div>
    <div class="eng-card">
      <div class="eng-card__t">📅 출석 보상</div>
      <div class="daily-card">
        <div class="daily-card__streak">🔥 연속 출석 <b>${d.streak || 0}</b>일</div>
        <div class="daily-card__reward">${d.claimable ? `오늘 보상 💰 <b>${d.reward}</b>` : '오늘 출석 완료 ✅'}</div>
      </div>
      <button class="btn ${d.claimable ? 'btn--primary' : ''} btn--lg" data-act="eng_daily" ${d.claimable ? '' : 'disabled'}>
        ${d.claimable ? `💰 ${d.reward} 코인 받기` : '내일 다시 받을 수 있어요'}</button>
    </div>
    <p class="muted center" style="padding:8px 14px;font-size:12px;line-height:1.6">
      코인은 게임을 할수록 쌓여요(승리 +120 · 참가 +40). 업적·출석으로 추가 코인을 받아 <b>상점</b>에서 칭호·이름 이펙트를 사세요.</p>
  </div>`;
}

function engAchBody(m) {
  const list = m.achievements || [];
  const rows = list.map(a => {
    const pct = a.goal ? Math.min(100, Math.round((a.progress / a.goal) * 100)) : 0;
    return `<li class="ach-row ${a.unlocked ? 'is-on' : ''}">
      <span class="ach-row__ic">${a.icon || '🏆'}</span>
      <div class="ach-row__main">
        <div class="ach-row__name">${esc(a.name)} ${a.unlocked ? '<span class="ach-done">달성 ✅</span>' : ''}</div>
        <div class="ach-row__desc muted">${esc(a.desc)} · 보상 💰${a.reward}</div>
        <div class="ach-row__bar"><i style="width:${pct}%"></i></div>
        <div class="ach-row__num muted">${Math.floor(a.progress)} / ${a.goal}</div>
      </div></li>`;
  }).join('');
  return `<ul class="ach-list">${rows}</ul>`;
}

function engShopBody(m) {
  const list = m.shop || [];
  const card = a => {
    const previewName = a.kind === 'effect'
      ? `<span class="tier-name name-fx name-fx--${a.value}" style="--tc:#e6b32e">${esc(ME.real_name)}</span>`
      : titleChipHTML(a.value);
    let btn;
    if (a.equipped) btn = `<button class="btn btn--ghost shop-eq is-on" data-act="eng_equip" data-kind="${a.kind}" data-key="${a.key}" data-on="1">장착 해제</button>`;
    else if (a.owned) btn = `<button class="btn btn--primary shop-eq" data-act="eng_equip" data-kind="${a.kind}" data-key="${a.key}" data-on="0">장착하기</button>`;
    else btn = `<button class="btn shop-buy" data-act="eng_buy" data-key="${a.key}">💰 ${a.price.toLocaleString()}</button>`;
    return `<li class="shop-card ${a.owned ? 'is-owned' : ''}">
      <div class="shop-card__top"><span class="shop-card__name">${esc(a.name)}</span>${a.owned ? '<span class="shop-card__own">보유</span>' : ''}</div>
      <div class="shop-card__prev">${previewName}</div>
      <div class="shop-card__desc muted">${esc(a.desc)}</div>
      ${btn}</li>`;
  };
  return `<ul class="shop-grid">${list.map(card).join('')}</ul>`;
}

/* 통합 랭킹(app.js showRank 의 'total' 탭에서 사용) ----------------------- */
async function totalRankHTML() {
  const list = await apiLeaderboardTotal();
  if (!list.length) return '<li class="muted center" style="padding:20px">아직 기록이 없어요</li>';
  return list.map((u, i) => `<li class="board-rank__row ${u.id === ME.id ? 'is-me' : ''}">
    <span class="pos ${i < 3 ? 'pos--top' : ''}">${i < 3 ? ['🥇', '🥈', '🥉'][i] : (i + 1)}</span>
    <span>${decoNameHTML(u.real_name, u.total, u.title, u.effect)}<small class="muted"> ${(u.wins || 0)}승</small></span>
    <span></span>
    <span class="eng-total"><b>${(u.total || 0).toLocaleString()}</b>점</span></li>`).join('');
}

window.engageAct = engageAct;
