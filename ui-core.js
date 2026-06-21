/* =========================================================================
   ui-core.js — DOM/입력 공용 계층 (모든 화면·게임 공유, 가장 먼저 로드)
   - $, app, esc, setScreen, toast, 바텀시트/스크림
   - 터치 수정의 본진: click 위임(300ms 지연·더블탭줌·연타누락) → pointerdown 통합
   ========================================================================= */

let SCREEN = 'login';
const $  = s => document.querySelector(s);
const app = () => document.getElementById('app');
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function setScreen(name) { app().dataset.screen = name; SCREEN = name; }

/* ----------------------------- 통합 입력 ------------------------------- */
// pointerdown 우선 처리(즉시 반응) + 합성 click 더블파이어 가드(키보드 접근성은 유지).
let _ptrAt = -1e9;
let _act = null;                 // 보류 중 탭 후보 {el, kind, x, y, pid}
const TAP_MOVE = 12;             // 이 거리(px) 넘게 움직이면 스크롤/드래그로 간주 → 탭 취소
// 두 요소가 같은 논리 액션인가(재렌더로 노드가 바뀌어도 dataset 이 같으면 동일 버튼으로 취급)
function sameAction(a, b) {
  const da = a.dataset, db = b.dataset, ka = Object.keys(da);
  if (ka.length !== Object.keys(db).length) return false;
  for (const k of ka) if (da[k] !== db[k]) return false;
  return true;
}
// 탭은 "누른 버튼에서 손을 떼야" 발동(누르는 순간 X). 스크롤 중 오클릭/연타 오작동 방지.
function bindAppInput(onAct, onTap, tapActive) {
  const root = document;   // #app 밖의 바텀시트(#uiSheet)·스크림 버튼도 잡도록 전역 바인딩
  root.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;          // 좌클릭/터치만
    const actEl = e.target.closest('[data-act]');
    const tapEl = actEl ? null : e.target.closest('[data-tap]');
    if (!actEl && !tapEl) { _act = null; return; }
    _act = { el: actEl || tapEl, kind: actEl ? 'act' : 'tap', x: e.clientX, y: e.clientY, pid: e.pointerId };
  }, { passive: true });
  root.addEventListener('pointermove', (e) => {
    if (!_act || e.pointerId !== _act.pid) return;
    if (Math.hypot(e.clientX - _act.x, e.clientY - _act.y) > TAP_MOVE) _act = null;   // 스크롤 시작 → 탭 취소
  }, { passive: true });
  root.addEventListener('pointercancel', () => { _act = null; }, { passive: true });
  root.addEventListener('pointerup', (e) => {
    const rec = _act; _act = null;
    if (!rec || e.pointerId !== rec.pid) return;
    if (Math.hypot(e.clientX - rec.x, e.clientY - rec.y) > TAP_MOVE) return;           // 스크롤 → 무시
    const upEl = document.elementFromPoint(e.clientX, e.clientY);
    if (!upEl) return;
    // 떼는 순간의 실제 요소를 다시 찾는다(중간 재렌더로 rec.el 이 detach 됐을 수 있음)
    const live = upEl.closest(rec.kind === 'act' ? '[data-act]' : '[data-tap]');
    if (!live) return;
    if (live !== rec.el && !sameAction(live, rec.el)) return;   // 같은 버튼(또는 같은 논리 액션)에서 떼야 발동
    if (live.disabled || live.getAttribute('aria-disabled') === 'true') return;
    _ptrAt = e.timeStamp;                                    // 발화 확정 시에만 합성 click 억제(탭 기각되면 데스크톱 click 폴백 살림)
    if (rec.kind === 'act') onAct(live.dataset.act, live, e);
    else if (tapActive && tapActive()) onTap(live, e);
  });
  // 마우스 클릭 + 키보드(Enter/Space) 폴백 — pointerup 직후가 아닐 때만(접근성)
  root.addEventListener('click', (e) => {
    if (e.timeStamp - _ptrAt < 700) return;
    const actEl = e.target.closest('[data-act]');
    if (actEl && !actEl.disabled) onAct(actEl.dataset.act, actEl, e);
  });
}

/* ----------------------------- 토스트 -------------------------------- */
let _toastT = null;
function toast(msg, ok) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); document.body.appendChild(t); }
  t.className = 'toast' + (ok ? ' toast--ok' : '');
  t.textContent = msg;
  clearTimeout(_toastT); _toastT = setTimeout(() => { t.remove(); }, 2200);
}

/* ----------------------------- 바텀시트 ------------------------------ */
// 관전 손패 보기 등 범용 시트. innerHTML 주입.
function openSheet(html, onClose) {
  let sheet = document.getElementById('uiSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'uiSheet'; sheet.className = 'sheet';
    document.body.appendChild(sheet);
  }
  sheet.innerHTML = `<div class="sheet__grab"></div>${html}`;
  sheet.classList.add('is-open');
  let sc = document.getElementById('ui-scrim');
  if (!sc) {
    sc = document.createElement('div'); sc.id = 'ui-scrim'; sc.className = 'scrim';
    sc.addEventListener('pointerdown', () => closeSheet());
    document.body.appendChild(sc);
  }
  _sheetClose = onClose || null;
}
let _sheetClose = null;
function closeSheet() {
  const s = document.getElementById('uiSheet'); if (s) s.classList.remove('is-open');
  const sc = document.getElementById('ui-scrim'); if (sc) sc.remove();
  if (_sheetClose) { const f = _sheetClose; _sheetClose = null; f(); }
}

/* ----------------------------- 1장! 배너 ----------------------------- */
let _oneT = null;
function flashBanner(text) {
  if (document.querySelector('.banner-1tile')) return;
  const b = document.createElement('div'); b.className = 'banner-1tile'; b.textContent = text || '1장!';
  document.body.appendChild(b);
  if (navigator.vibrate) navigator.vibrate(40);
  clearTimeout(_oneT); _oneT = setTimeout(() => b.remove(), 1000);
}
