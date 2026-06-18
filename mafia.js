/* =========================================================================
   mafia.js — "마피아" (4~12인, 서버 권위 비밀역할)
   - 역할/밤 행동은 rooms.state 가 아니라 서버 테이블(mafia_secrets)에만 존재.
     클라는 mf_my_view 로 "내 역할/내 결과"만 받아온다 → 치트 불가(다빈치와 달리 완전비밀).
   - 공개 진행(phase/alive/votes/log/winner)만 rooms.state 에 담겨 realtime 으로 동기화.
   - 페이즈: lobby_assign → night → day → night → … → end.
     night: 마피아 제거 / 의사 보호 / 경찰 조사 (모두 제출되면 서버가 자동 해소).
     day:   전원 투표(or 기권). 모두 투표하면 자동 처형. 시간초과 시 리더가 강제 해소.
   - 사회자(시스템)가 narration(log)으로 진행을 안내.

   app.js 가 기대하는 전역: mafiaEnter / mafiaOnRoom / mafiaAct / mafiaStop
   의존: net.js(mafiaStartRoles/mfMyView/mfNightAction/mfDayVote/mfResolvePhase/
         finishGame/fetchRoom/serverNow + refreshRoom), ui-core(app/esc/setScreen/toast),
         tiers(GAME_NAME). app.js 전역: presentIds(접속자), MF(이 파일 정의).
   ========================================================================= */

const MF = {
  on: false, room: null, roomId: null, state: null,
  me: null, mySeat: null, amSpectator: false, version: 0,
  busy: false, view: null, viewKey: '', tickIv: null, finishing: false,
};

const MF_NIGHT_SEC = 60, MF_DAY_SEC = 90;
const MF_ROLE = {
  mafia:   { name: '마피아', emoji: '🔪', cls: 'mf-role--mafia',   verb: '제거할', desc: '밤에 한 명을 제거하세요. 정체를 숨기고 시민을 속이세요.' },
  police:  { name: '경찰',   emoji: '🚓', cls: 'mf-role--police',  verb: '조사할', desc: '밤에 한 명을 조사해 마피아인지 알아내세요.' },
  doctor:  { name: '의사',   emoji: '🚑', cls: 'mf-role--doctor',  verb: '살릴',   desc: '밤에 한 명을 살리세요(자신도 가능). 마피아의 표적을 지키세요.' },
  citizen: { name: '시민',   emoji: '🙂', cls: 'mf-role--citizen', verb: '',       desc: '낮 토론·투표로 마피아를 찾아 처형하세요.' },
};

/* ----------------------------- 진입/종료 ----------------------------- */
function mafiaEnter(room, me, mySeat, amSpectator) {
  MF.on = true; MF.room = room; MF.roomId = room.id; MF.state = room.state || {};
  MF.version = room.version; MF.me = me; MF.mySeat = mySeat; MF.amSpectator = amSpectator;
  MF.finishing = false; MF.view = null; MF.viewKey = '';
  setScreen('mafia');
  if (!MF.tickIv) MF.tickIv = setInterval(mfTick, 1000);
  mfSelfHealStart();
  mfRefreshView();
}
function mafiaOnRoom(room) {
  if (!MF.on || room.id !== MF.roomId) return;
  if (room.version != null && room.version < MF.version) return;
  const prev = MF.state || {};
  MF.room = room; MF.state = room.state || {}; MF.version = room.version;
  mfSelfHealStart();
  // 낮 투표만 바뀐 경우(같은 day·생존자 동일) 부분 렌더 — 매 표마다 전체 재구축(O(N^2)) 회피
  const cur = MF.state;
  if (SCREEN === 'mafia' && cur.phase === 'day' && prev.phase === 'day' && cur.day === prev.day
      && mfAliveSig(cur) === mfAliveSig(prev)) { mfUpdateVotes(); return; }
  mfRefreshView();
}
function mfAliveSig(s) { return mfAliveSeats(s || {}).join(','); }
// 낮 투표 부분 갱신: 각 카드 표 배지/내표 강조만, 투표자 푸터만 갱신(전체 innerHTML 재구축 X)
function mfUpdateVotes() {
  const s = MF.state; if (!s) return;
  const myVote = (s.votes && MF.mySeat != null) ? s.votes[MF.mySeat] : undefined;
  document.querySelectorAll('.mf-player').forEach(el => {
    const seat = Number(el.dataset.seat); if (isNaN(seat)) return;   // 좌석0(falsy)도 처리
    const vc = (s.voteCount && s.voteCount[seat]) || 0;
    let badge = el.querySelector('.mf-player__votes');
    if (mfAlive(s, seat) && vc) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'mf-player__votes'; el.appendChild(badge); }
      badge.textContent = '🗳 ' + vc;
    } else if (badge) { badge.remove(); }
    el.classList.toggle('is-myvote', Number(myVote) === seat);
  });
  const iAmAlive = MF.mySeat != null && mfAlive(s, MF.mySeat);
  if (!MF.amSpectator && iAmAlive && MF.view && MF.view.role) {
    const foot = document.querySelector('.dv-foot'); if (foot) foot.innerHTML = mfDayAction(s, myVote);
  }
}
function mfDayAction(s, myVote) {
  if (typeof myVote !== 'undefined') {
    const who = Number(myVote) === 0 ? '기권' : esc(mafiaName(s, Number(myVote)));
    return `<div class="mf-note">🗳 투표함: <b>${who}</b> · 다른 사람을 눌러 변경 가능<div class="mf-abstain-row"><button class="btn btn--ghost" data-act="mf_abstain">기권</button></div></div>`;
  }
  return `<div class="mf-note mf-note--act">☀️ 토론 후, 처형할 사람을 위에서 고르세요.<div class="mf-abstain-row"><button class="btn btn--ghost" data-act="mf_abstain">기권</button></div></div>`;
}
function mafiaStop() {
  MF.on = false;
  if (MF.tickIv) { clearInterval(MF.tickIv); MF.tickIv = null; }
  MF.room = MF.state = null; MF.roomId = null; MF.view = null;
}

/* 방장이 게임을 막 시작해 phase 가 lobby_assign 이면 역할 배정을 트리거(멱등) */
async function mfSelfHealStart() {
  const s = MF.state;
  if (!s || s.phase !== 'lobby_assign' || MF.busy || MF.amSpectator || MF.mySeat == null) return;
  const isHost = MF.room && MF.room.host_id === MF.me.id;
  const isLeader = mfLeader(s) === MF.mySeat;     // 방장 이탈 시 리더가 역할배정 대신 트리거(mf_start 멱등)
  if (!isHost && !isLeader) return;
  MF.busy = true;
  const go = async () => { try { if (MF.state && MF.state.phase === 'lobby_assign') await mafiaStartRoles(MF.roomId, MF.me); } catch (e) {} finally { MF.busy = false; } };
  if (isHost) await go(); else setTimeout(go, 700);   // 비호스트 리더는 약간 늦게(호스트 우선)
}

/* ----------------------------- 헬퍼 ---------------------------------- */
function mfSeats(s) { return Object.keys(s.players || {}).map(Number).sort((a, b) => a - b); }
function mfAlive(s, seat) { return !!(s.alive && s.alive[seat]); }
function mfAliveSeats(s) { return mfSeats(s).filter(x => mfAlive(s, x)); }
// 해소 후보 풀 = 접속 중 생존좌석(없으면 생존좌석) 오름차순. 리더=풀 첫 좌석.
function mfResolverPool(s) {
  const alive = mfAliveSeats(s);
  const present = (typeof presentIds !== 'undefined')
    ? alive.filter(seat => presentIds.includes(s.players[seat])) : alive;
  return present.length ? present : alive;
}
function mfLeader(s) { const p = mfResolverPool(s); return p.length ? p[0] : null; }

/* 내 역할/결과 비공개 정보는 페이즈가 바뀔 때만 다시 받아온다(투표마다 X) */
async function mfRefreshView() {
  const s = MF.state; if (!s) { return; }
  if (s.phase === 'end' || s.results) { mfRender(); mfMaybeFinish(); return; }
  if (MF.amSpectator) { MF.view = { role: null }; mfRender(); return; }
  const key = (s.phase || '') + '|' + (s.day || 0);
  const keyChanged = key !== MF.viewKey;
  if (keyChanged || !MF.view) {
    try { MF.view = await mfMyView(MF.roomId, MF.me); MF.viewKey = key; } catch (e) { MF.view = MF.view || { role: null }; }
  }
  if (keyChanged && MF.view) { MF.view.acted = false; }   // 페이즈/일차 전환 시 stale '이미 행동' 제거
  mfRender();
}

/* ----------------------------- 1초 틱: 카운트다운 + 시간초과 강제해소 ---------------------------------- */
function mfTick() {
  if (!MF.on || !MF.state) return;
  mfUpdateCountdown();
  const s = MF.state, ph = s.phase;
  if (ph !== 'night' && ph !== 'day') return;
  if (!MF.room || !MF.room.turn_started_at) return;
  if (MF.busy || MF.mySeat == null) return;
  const lim = ph === 'night' ? MF_NIGHT_SEC : MF_DAY_SEC;
  const elapsed = (serverNow() - new Date(MF.room.turn_started_at).getTime()) / 1000;
  if (elapsed < lim) return;
  // 리더(최저 접속 생존좌석) 먼저, 떨어지면 다음 좌석이 3초씩 밀려 백업 호출(서버 멱등이라 안전)
  const pool = mfResolverPool(s);
  const myRank = pool.indexOf(MF.mySeat);
  if (myRank < 0 || elapsed < lim + myRank * 3) return;
  MF.busy = true;
  mfResolvePhase(MF.roomId, MF.me, ph).catch(() => {}).finally(() => { MF.busy = false; });
}
function mfUpdateCountdown() {
  const el = document.querySelector('[data-role="mfTimer"]'); if (!el) return;
  const s = MF.state;
  if (!s || (s.phase !== 'night' && s.phase !== 'day') || !MF.room || !MF.room.turn_started_at) { el.textContent = ''; el.dataset.state = 'normal'; MF.lastDanger = false; return; }
  const lim = s.phase === 'night' ? MF_NIGHT_SEC : MF_DAY_SEC;
  const rem = Math.max(0, Math.ceil(lim - (serverNow() - new Date(MF.room.turn_started_at).getTime()) / 1000));
  el.textContent = '⏱ ' + rem + 's';
  const st = rem <= 10 ? 'danger' : rem <= 20 ? 'warn' : 'normal';   // 루미와 동일한 위험 경고
  el.dataset.state = st;
  if (st === 'danger' && !MF.lastDanger) { MF.lastDanger = true; if (navigator.vibrate) navigator.vibrate(60); }
  if (st !== 'danger') MF.lastDanger = false;
}

/* ----------------------------- 종료 정산 ---------------------------------- */
async function mfMaybeFinish() {
  const s = MF.state; if (!s) return;
  if (s.phase !== 'end' || !s.winner || s.results) return;
  if (MF.finishing) return; MF.finishing = true;
  for (let i = 0; i < 5; i++) {
    const r = await finishGame(MF.roomId, MF.me.token, 'mafia');
    if (r && r.ok) { await refreshRoom(); return; }
    const room = await fetchRoom(MF.roomId);
    if (room && room.status === 'finished') { await refreshRoom(); return; }
    await new Promise(res => setTimeout(res, 600));
  }
  MF.finishing = false;   // 5회 실패 → 다음 트리거에서 재시도 허용(davinci/uno/splendor 와 일관)
  await refreshRoom();
}

/* ----------------------------- 액션 라우팅 --------------------------- */
async function mafiaAct(act, el) {
  if (!MF.on) return;
  switch (act) {
    case 'mf_night': return mfDoNight(Number(el.dataset.seat));
    case 'mf_vote':  return mfDoVote(Number(el.dataset.seat));
    case 'mf_abstain': return mfDoVote(0);
  }
}
async function mfDoNight(target) {
  if (MF.busy) return; MF.busy = true;
  try {
    const r = await mfNightAction(MF.roomId, MF.me, target);
    if (r && r.ok) {
      MF.view = MF.view || {}; MF.view.acted = true;
      if (r.police) MF.view.police = r.police;
      mfRender();
    } else if (r && r.error) { toast(mfErr(r.error)); }
  } finally { MF.busy = false; }
}
async function mfDoVote(target) {
  if (MF.busy) return; MF.busy = true;
  try { const r = await mfDayVote(MF.roomId, MF.me, target); if (r && r.error) toast(mfErr(r.error)); }
  finally { MF.busy = false; }
}
function mfErr(m) {
  m = String(m || '');
  if (m.includes('TARGET_DEAD')) return '이미 죽은 사람은 고를 수 없어요';
  if (m.includes('NO_SELF')) return '자기 자신은 고를 수 없어요';
  if (m.includes('DEAD')) return '죽어서 행동할 수 없어요';
  if (m.includes('NOT_NIGHT') || m.includes('NOT_DAY')) return '지금은 할 수 없어요';
  return '처리 실패, 다시 시도하세요';
}

/* ----------------------------- 렌더 ---------------------------------- */
function mafiaName(s, seat) { return (s.names && s.names[seat]) || ('좌석' + seat); }
function mfRender() {
  const s = MF.state; if (!s) return;
  if (s.phase === 'end' || s.results) { return; }   // 종료는 app.js refreshRoom→renderResult 가 처리
  const seats = mfSeats(s);
  const myRole = MF.view && MF.view.role;
  const mates = (myRole === 'mafia' && MF.view && Array.isArray(MF.view.mates)) ? MF.view.mates : [];
  const mateSeats = new Set(mates.map(m => m.seat));
  const ph = s.phase, day = s.day || 1;
  const isNight = ph === 'night', isDay = ph === 'day';
  const iAmAlive = MF.mySeat != null && mfAlive(s, MF.mySeat);
  const myVote = (s.votes && MF.mySeat != null) ? s.votes[MF.mySeat] : undefined;
  const acted = !!(MF.view && MF.view.acted);

  let phaseLabel;
  if (ph === 'lobby_assign') phaseLabel = '🎭 역할 배정 중…';
  else if (isNight) phaseLabel = '🌙 ' + day + '일차 밤';
  else if (isDay) phaseLabel = '☀️ ' + day + '일차 낮 · 투표';
  else phaseLabel = '게임 종료';

  // 플레이어 카드
  const grid = seats.map(seat => {
    const alive = mfAlive(s, seat);
    const isMe = seat === MF.mySeat;
    const vc = (s.voteCount && s.voteCount[seat]) || 0;
    let act = '', target = false;
    if (alive) {
      if (isNight && iAmAlive && myRole && myRole !== 'citizen' && !acted) {
        let canTarget = (myRole === 'doctor') || !isMe;         // 마피아/경찰은 자신 불가, 의사는 가능
        if (myRole === 'mafia' && mateSeats.has(seat)) canTarget = false;  // 동료 마피아는 못 죽임
        if (canTarget) { act = 'data-act="mf_night"'; target = true; }
      } else if (isDay && iAmAlive) { act = 'data-act="mf_vote"'; target = true; }
    }
    const sel = (isDay && Number(myVote) === seat) ? 'is-myvote' : '';
    return `<button class="mf-player ${alive ? '' : 'is-dead'} ${isMe ? 'is-me' : ''} ${target ? 'is-target' : ''} ${sel}" data-seat="${seat}" ${act}>
      <span class="mf-player__seat">${seat}</span>
      <span class="mf-player__name">${decoEmblemHTML((s.players || {})[seat]) || emblemHTML('mafia', 0, 'xs')}${esc(mafiaName(s, seat))}${isMe ? ' (나)' : ''}${mateSeats.has(seat) ? ' <span class="mf-mate">🔪동료</span>' : ''}</span>
      ${alive ? (isDay && vc ? `<span class="mf-player__votes">🗳 ${vc}</span>` : '') : '<span class="mf-player__dead">💀</span>'}
    </button>`;
  }).join('');

  // 내 역할 카드(나만 보임)
  let roleCard = '';
  if (MF.amSpectator) {
    roleCard = `<div class="mf-rolecard mf-role--citizen"><div class="mf-rolecard__role">👁 관전 중</div></div>`;
  } else if (myRole) {
    const R = MF_ROLE[myRole];
    let mateLine = '';
    if (myRole === 'mafia') {
      mateLine = mates.length
        ? `<div class="mf-rolecard__mates">🤝 동료 마피아: <b>${mates.map(m => esc(m.name || ('좌석' + m.seat))).join(', ')}</b></div>`
        : `<div class="mf-rolecard__mates">🤝 당신은 유일한 마피아입니다.</div>`;
    }
    roleCard = `<div class="mf-rolecard ${R.cls}">
      <div class="mf-rolecard__role">${R.emoji} 당신은 <b>${R.name}</b>${iAmAlive ? '' : ' <span class="mf-dead-tag">(사망 · 관전)</span>'}</div>
      <div class="mf-rolecard__desc">${R.desc}</div>${mateLine}</div>`;
  }

  // 액션/안내 바
  let action = '';
  if (ph === 'lobby_assign') action = `<div class="mf-note">역할을 배정하고 있어요…</div>`;
  else if (MF.amSpectator) action = `<div class="mf-note">👁 관전 중 — ${phaseLabel}</div>`;
  else if (!iAmAlive) action = `<div class="mf-note">💀 사망했습니다. 결과를 지켜보세요.</div>`;
  else if (!myRole) action = `<div class="mf-note">역할 정보를 불러오는 중…</div>`;
  else if (isNight) {
    if (myRole === 'citizen') action = `<div class="mf-note">🌙 밤입니다. 눈을 감고 기다리세요. 마피아·경찰·의사가 활동 중…</div>`;
    else if (acted) {
      let extra = '';
      if (myRole === 'police' && MF.view.police) {
        const p = MF.view.police;
        extra = `<div class="mf-result ${p.isMafia ? 'is-mafia' : 'is-clean'}">🔎 ${esc(p.name)} 님은 ${p.isMafia ? '🔪 마피아입니다!' : '마피아가 아닙니다.'}</div>`;
      }
      action = `<div class="mf-note">✅ 행동 완료. 다른 역할을 기다리는 중…</div>${extra}`;
    } else {
      const R = MF_ROLE[myRole];
      action = `<div class="mf-note mf-note--act">${R.emoji} ${R.verb} 대상을 위에서 고르세요${myRole === 'doctor' ? ' (자신 포함)' : ''}.</div>`;
    }
  } else if (isDay) {
    action = mfDayAction(s, myVote);
  }

  const logHTML = (s.log || []).slice(-6).reverse().map(l => `<li>${esc(l)}</li>`).join('');

  app().innerHTML = `
    <section class="screen screen--mafia">
      <header class="topbar">
        <div class="turn-pill ${isNight ? 'mf-pill-night' : isDay ? 'mf-pill-day' : ''}">${phaseLabel}</div>
        <span class="mf-timer" data-role="mfTimer"></span>
        <span class="room-tag">방${MF.roomId}</span>
        <span class="dv-alive">생존 ${mfAliveSeats(s).length}/${s.n}</span>
        <button class="btn btn--ghost" data-act="leave" style="margin-left:6px">나가기</button>
      </header>
      ${roleCard}
      <div class="mf-grid grow scrollable">${grid}</div>
      ${logHTML ? `<ul class="dv-log mf-log">${logHTML}</ul>` : ''}
      <footer class="dv-foot">${action}</footer>
    </section>`;
  mfUpdateCountdown();
}

/* ----------------------------- 전역 노출 ----------------------------- */
window.mafiaEnter = mafiaEnter;
window.mafiaOnRoom = mafiaOnRoom;
window.mafiaAct = mafiaAct;
window.mafiaStop = mafiaStop;
