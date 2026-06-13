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
function bindAppInput(onAct, onTap, tapActive) {
  const root = app();
  root.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;   // 좌클릭/터치만
    _ptrAt = e.timeStamp;
    const actEl = e.target.closest('[data-act]');
    if (actEl) { onAct(actEl.dataset.act, actEl, e); return; }
    const tapEl = e.target.closest('[data-tap]');
    if (tapEl && tapActive && tapActive()) onTap(tapEl, e);
  }, { passive: true });
  // 마우스/키보드 click 은 pointer 직후가 아닐 때만(데스크톱 폴백·접근성)
  root.addEventListener('click', (e) => {
    if (e.timeStamp - _ptrAt < 700) return;            // pointerdown 이 이미 처리함
    const actEl = e.target.closest('[data-act]');
    if (actEl) onAct(actEl.dataset.act, actEl, e);
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
