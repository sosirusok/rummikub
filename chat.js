/* =========================================================================
   chat.js — 모든 게임/대기실 공용 실시간 채팅 (드래그 이동 가능)
   - body 레벨 #chatRoot(고정) → #app 재렌더에 안 지워짐. broadcast 휘발(렉 0).
   - 토글/닫기/드래그는 위젯 자체 리스너로 처리(전역 탭 시스템에 의존 X → 실기기서 확실).
     · 💬(FAB): 탭=열고닫기 / 끌면=위치 이동   · 헤더: 끌어서 이동   · ✕: 닫기
   의존: net.js(joinChat/leaveChannel), ui-core.js(esc). app.js 가 chatEnter/chatLeave 호출.
   ========================================================================= */
const CHAT = { on: false, roomId: null, me: null, ch: null, send: null, msgs: [], open: false, unread: 0, drag: null, moved: false };

function chatInjectStyles() {
  if (document.getElementById('chatCSS')) return;
  const s = document.createElement('style'); s.id = 'chatCSS';
  s.textContent = `
  #chatRoot{position:fixed;right:12px;bottom:calc(58px + env(safe-area-inset-bottom));z-index:1200}  /* 게임 하단 액션버튼(뽑기/푸터) 위로 올림 */
  .chat-fab{position:relative;width:54px;height:54px;border-radius:50%;border:none;background:var(--accent);color:#fff;font-size:24px;box-shadow:0 4px 14px rgba(0,0,0,.45);cursor:grab;touch-action:none;display:flex;align-items:center;justify-content:center;user-select:none}
  .chat-fab.is-open{background:#3a4660}
  .chat-fab__b{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#e0444a;color:#fff;font-size:11px;line-height:18px;font-weight:800;box-sizing:border-box}
  .chat-box{position:absolute;right:0;bottom:64px;width:min(92vw,360px);height:min(56vh,440px);display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 10px 34px rgba(0,0,0,.55)}
  .chat-box[hidden]{display:none}
  .chat-box__hd{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:var(--panel2);border-bottom:1px solid var(--line);color:#e8edf6;font-size:14px;cursor:grab;touch-action:none;user-select:none}
  .chat-box__hd .chat-grip{color:#5e6b85;font-size:12px;margin-left:6px}
  .chat-cl{background:#22304a;border:none;color:#cdd9ec;font-size:15px;cursor:pointer;width:30px;height:30px;border-radius:8px;line-height:30px;text-align:center;flex:none}
  .chat-msgs{flex:1;list-style:none;margin:0;padding:8px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}
  .chat-empty{color:#6b7790;text-align:center;font-size:13px;margin:auto 0}
  .chat-m{max-width:82%;align-self:flex-start;background:var(--panel2);border-radius:10px;padding:5px 9px}
  .chat-m.is-me{align-self:flex-end;background:var(--accent-soft);color:var(--ink);border-left:2px solid var(--accent)}
  .chat-m__n{display:block;font-size:11px;color:#8aa0c0;margin-bottom:1px}
  .chat-m.is-me .chat-m__n{color:#bcd2f5}
  .chat-m__t{color:#eef2f8;font-size:14px;word-break:break-word;white-space:pre-wrap;line-height:1.3}
  .chat-form{display:flex;gap:6px;padding:8px;border-top:1px solid var(--line);background:var(--well)}
  .chat-in{flex:1;min-width:0;background:var(--panel2);border:1px solid var(--line);border-radius:9px;color:#fff;padding:9px 10px;font-size:15px;outline:none}
  .chat-in:focus{border-color:var(--accent)}
  .chat-snd{background:var(--accent);border:none;color:#fff;border-radius:9px;padding:0 14px;font-weight:700;cursor:pointer}
  @media(max-width:380px){.chat-box{width:94vw;height:min(54vh,400px)}}`;
  document.head.appendChild(s);
}

function chatEnter(roomId, me) {
  if (CHAT.on && CHAT.roomId === roomId) { CHAT.me = me; return; }
  chatLeave();
  CHAT.on = true; CHAT.roomId = roomId; CHAT.me = me; CHAT.msgs = []; CHAT.open = false; CHAT.unread = 0;
  try { const t = joinChat(roomId, chatRecv); CHAT.ch = t.ch; CHAT.send = t.send; } catch (e) {}
  chatMount();
}
function chatLeave() {
  if (CHAT.ch) { try { leaveChannel(CHAT.ch); } catch (e) {} }
  CHAT.ch = null; CHAT.send = null;
  CHAT.on = false; CHAT.roomId = null; CHAT.msgs = []; CHAT.open = false; CHAT.unread = 0; CHAT.drag = null;
  const r = document.getElementById('chatRoot'); if (r) r.remove();
}
function chatRecv(m) {
  if (!m || !CHAT.on || typeof m.text !== 'string') return;
  CHAT.msgs.push({ name: String(m.name || '익명').slice(0, 20), text: m.text.slice(0, 200), me: false });
  if (CHAT.msgs.length > 80) CHAT.msgs.shift();
  if (!CHAT.open) { CHAT.unread++; chatBadge(); }
  chatList();
}
function chatMount() {
  chatInjectStyles();
  let r = document.getElementById('chatRoot');
  if (!r) { r = document.createElement('div'); r.id = 'chatRoot'; document.body.appendChild(r); }
  r.innerHTML = `
    <div class="chat-box" data-role="cbox" hidden>
      <div class="chat-box__hd" data-role="chd"><span><b>💬 채팅</b><span class="chat-grip">⠿ 끌어서 이동</span></span><button class="chat-cl" data-role="ccl" aria-label="닫기">✕</button></div>
      <ul class="chat-msgs" data-role="cmsgs"></ul>
      <form class="chat-form" data-role="cform">
        <input class="chat-in" data-role="cin" maxlength="200" placeholder="메시지 입력…" autocomplete="off" />
        <button type="submit" class="chat-snd">전송</button>
      </form>
    </div>
    <button class="chat-fab" data-role="cfab" aria-label="채팅">💬<span class="chat-fab__b" data-role="cbadge" hidden></span></button>`;
  const fab = r.querySelector('[data-role="cfab"]');
  const hd  = r.querySelector('[data-role="chd"]');
  const cl  = r.querySelector('[data-role="ccl"]');
  const form = r.querySelector('[data-role="cform"]');
  if (fab) fab.addEventListener('pointerdown', (e) => { e.preventDefault(); chatDragStart('fab', e); });
  if (hd)  hd.addEventListener('pointerdown', (e) => { if (e.target.closest('.chat-cl')) return; e.preventDefault(); chatDragStart('hd', e); });
  if (cl)  cl.addEventListener('click', () => chatToggle(false));
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); chatDoSend(); });
  chatList(); chatBadge();
}

/* ----- 드래그 이동(+ FAB 은 안 끌면 탭=열고닫기) ----- */
function chatDragStart(kind, e) {
  const r = document.getElementById('chatRoot'); if (!r) return;
  const b = r.getBoundingClientRect();
  CHAT.drag = { kind, sx: e.clientX, sy: e.clientY, left: b.left, top: b.top, w: b.width, h: b.height };
  CHAT.moved = false;
  window.addEventListener('pointermove', chatDragMove);
  window.addEventListener('pointerup', chatDragEnd);
  window.addEventListener('pointercancel', chatDragEnd);
}
function chatDragMove(e) {
  const d = CHAT.drag; if (!d) return;
  const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
  if (!CHAT.moved && Math.hypot(dx, dy) > 7) CHAT.moved = true;
  if (!CHAT.moved) return;
  const r = document.getElementById('chatRoot'); if (!r) return;
  let left = d.left + dx, top = d.top + dy;
  left = Math.max(4, Math.min(window.innerWidth - d.w - 4, left));
  top  = Math.max(4, Math.min(window.innerHeight - d.h - 4, top));
  r.style.left = left + 'px'; r.style.top = top + 'px'; r.style.right = 'auto'; r.style.bottom = 'auto';
}
function chatDragEnd() {
  const d = CHAT.drag; CHAT.drag = null;
  window.removeEventListener('pointermove', chatDragMove);
  window.removeEventListener('pointerup', chatDragEnd);
  window.removeEventListener('pointercancel', chatDragEnd);
  if (d && !CHAT.moved && d.kind === 'fab') chatToggle();   // 안 끌었으면 탭 = 열고닫기
}

function chatToggle(open) {
  CHAT.open = (typeof open === 'boolean') ? open : !CHAT.open;
  const box = document.querySelector('[data-role="cbox"]'); if (box) box.hidden = !CHAT.open;
  const fab = document.querySelector('[data-role="cfab"]'); if (fab) fab.classList.toggle('is-open', CHAT.open);
  if (CHAT.open) { CHAT.unread = 0; chatBadge(); chatList(); const i = document.querySelector('[data-role="cin"]'); if (i) setTimeout(() => { try { i.focus(); } catch (e) {} }, 30); }
}
function chatBadge() {
  const b = document.querySelector('[data-role="cbadge"]'); if (!b) return;
  if (CHAT.unread > 0 && !CHAT.open) { b.hidden = false; b.textContent = CHAT.unread > 9 ? '9+' : String(CHAT.unread); }
  else { b.hidden = true; }
}
function chatList() {
  const ul = document.querySelector('[data-role="cmsgs"]'); if (!ul) return;
  if (!CHAT.msgs.length) { ul.innerHTML = `<li class="chat-empty">아직 메시지가 없어요.<br>같은 방 사람들과 대화하세요!</li>`; return; }
  const atBottom = ul.scrollHeight - ul.scrollTop - ul.clientHeight < 40;   // 위로 스크롤해 과거 읽는 중이면 강제 하단이동 안 함
  ul.innerHTML = CHAT.msgs.map(m =>
    `<li class="chat-m ${m.me ? 'is-me' : ''}"><span class="chat-m__n">${esc(m.name)}</span><span class="chat-m__t">${esc(m.text)}</span></li>`).join('');
  if (atBottom) ul.scrollTop = ul.scrollHeight;
}
function chatDoSend() {
  const i = document.querySelector('[data-role="cin"]'); if (!i) return;
  const text = (i.value || '').trim(); if (!text) return;
  i.value = '';
  const name = (CHAT.me && (CHAT.me.real_name || CHAT.me.username)) || '익명';
  const payload = { name: String(name).slice(0, 20), text: text.slice(0, 200), uid: CHAT.me && CHAT.me.id };
  if (CHAT.send) CHAT.send(payload);
  CHAT.msgs.push({ name: String(name).slice(0, 20), text: text.slice(0, 200), me: true });
  if (CHAT.msgs.length > 80) CHAT.msgs.shift();
  chatList();
  try { i.focus(); } catch (e) {}
}
function chatOnAct() { return false; }   // 전역 위임 미사용(직접 리스너로 처리)
window.chatEnter = chatEnter; window.chatLeave = chatLeave; window.chatOnAct = chatOnAct;
