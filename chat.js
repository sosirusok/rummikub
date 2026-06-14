/* =========================================================================
   chat.js — 모든 게임/대기실 공용 실시간 채팅
   - body 레벨 떠있는 위젯(#chatRoot) → #app 재렌더에 안 지워짐(바텀시트와 동일 전략)
   - 전송은 broadcast(휘발, DB 미경유 → 렉 0). self:false 라 내 메시지는 로컬에 즉시 추가.
   - data-act(chatToggle/chatSend)는 ui-core 통합입력이 처리, 입력창은 네이티브(타이핑 정상).
   의존: net.js(joinChat/leaveChannel), ui-core.js(esc). app.js 가 chatEnter/chatLeave/chatOnAct 호출.
   ========================================================================= */
const CHAT = { on: false, roomId: null, me: null, ch: null, send: null, msgs: [], open: false, unread: 0 };

function chatInjectStyles() {
  if (document.getElementById('chatCSS')) return;
  const s = document.createElement('style'); s.id = 'chatCSS';
  s.textContent = `
  .chat-fab{position:fixed;right:12px;bottom:12px;z-index:1200;width:52px;height:52px;border-radius:50%;border:none;background:#2b6cff;color:#fff;font-size:23px;box-shadow:0 4px 14px rgba(0,0,0,.45);cursor:pointer;touch-action:manipulation}
  .chat-fab.is-open{background:#3a4660}
  .chat-fab__b{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#e0444a;color:#fff;font-size:11px;line-height:18px;font-weight:800;box-sizing:border-box}
  .chat-box{position:fixed;right:12px;bottom:74px;z-index:1200;width:min(92vw,360px);height:min(56vh,440px);display:flex;flex-direction:column;background:#10131a;border:1px solid #2a3550;border-radius:14px;overflow:hidden;box-shadow:0 10px 34px rgba(0,0,0,.55)}
  .chat-box__hd{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#161b26;border-bottom:1px solid #2a3550;color:#e8edf6;font-size:14px}
  .chat-cl{background:none;border:none;color:#9fb0c3;font-size:17px;cursor:pointer;padding:2px 6px}
  .chat-msgs{flex:1;list-style:none;margin:0;padding:8px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}
  .chat-empty{color:#6b7790;text-align:center;font-size:13px;margin:auto 0}
  .chat-m{max-width:82%;align-self:flex-start;background:#1b2230;border-radius:10px;padding:5px 9px}
  .chat-m.is-me{align-self:flex-end;background:#244a8f}
  .chat-m__n{display:block;font-size:11px;color:#8aa0c0;margin-bottom:1px}
  .chat-m.is-me .chat-m__n{color:#bcd2f5}
  .chat-m__t{color:#eef2f8;font-size:14px;word-break:break-word;white-space:pre-wrap;line-height:1.3}
  .chat-form{display:flex;gap:6px;padding:8px;border-top:1px solid #2a3550;background:#0d1017}
  .chat-in{flex:1;min-width:0;background:#1b2230;border:1px solid #2a3550;border-radius:9px;color:#fff;padding:9px 10px;font-size:15px;outline:none}
  .chat-in:focus{border-color:#2b6cff}
  .chat-snd{background:#2b6cff;border:none;color:#fff;border-radius:9px;padding:0 14px;font-weight:700;cursor:pointer;touch-action:manipulation}
  @media(max-width:380px){.chat-box{width:94vw;right:3vw;height:min(54vh,400px)}}`;
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
  CHAT.on = false; CHAT.roomId = null; CHAT.msgs = []; CHAT.open = false; CHAT.unread = 0;
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
    <button class="chat-fab" data-act="chatToggle" aria-label="채팅">💬<span class="chat-fab__b" data-role="cbadge" hidden></span></button>
    <div class="chat-box" data-role="cbox" hidden>
      <div class="chat-box__hd"><b>💬 채팅</b><button class="chat-cl" data-act="chatToggle" aria-label="닫기">✕</button></div>
      <ul class="chat-msgs" data-role="cmsgs"></ul>
      <form class="chat-form" data-role="cform">
        <input class="chat-in" data-role="cin" maxlength="200" placeholder="메시지 입력…" autocomplete="off" />
        <button type="submit" class="chat-snd" data-act="chatSend">전송</button>
      </form>
    </div>`;
  const f = r.querySelector('[data-role="cform"]');
  if (f) f.addEventListener('submit', (e) => { e.preventDefault(); chatDoSend(); });
  chatList(); chatBadge();
}
function chatToggle() {
  CHAT.open = !CHAT.open;
  const box = document.querySelector('[data-role="cbox"]'); if (box) box.hidden = !CHAT.open;
  const fab = document.querySelector('.chat-fab'); if (fab) fab.classList.toggle('is-open', CHAT.open);
  if (CHAT.open) { CHAT.unread = 0; chatBadge(); chatList(); const i = document.querySelector('[data-role="cin"]'); if (i) setTimeout(() => { try { i.focus(); } catch (e) {} }, 0); }
}
function chatBadge() {
  const b = document.querySelector('[data-role="cbadge"]'); if (!b) return;
  if (CHAT.unread > 0 && !CHAT.open) { b.hidden = false; b.textContent = CHAT.unread > 9 ? '9+' : String(CHAT.unread); }
  else { b.hidden = true; }
}
function chatList() {
  const ul = document.querySelector('[data-role="cmsgs"]'); if (!ul) return;
  if (!CHAT.msgs.length) { ul.innerHTML = `<li class="chat-empty">아직 메시지가 없어요.<br>같은 방 사람들과 대화하세요!</li>`; return; }
  ul.innerHTML = CHAT.msgs.map(m =>
    `<li class="chat-m ${m.me ? 'is-me' : ''}"><span class="chat-m__n">${esc(m.name)}</span><span class="chat-m__t">${esc(m.text)}</span></li>`).join('');
  ul.scrollTop = ul.scrollHeight;
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
function chatOnAct(act) {
  if (act === 'chatToggle') { chatToggle(); return true; }
  if (act === 'chatSend') { chatDoSend(); return true; }
  return false;
}
window.chatEnter = chatEnter; window.chatLeave = chatLeave; window.chatOnAct = chatOnAct;
