/* =========================================================================
   net.js — Supabase 계층 (v3, 3게임)
   - 계정: RPC(rk_signup/login/me/leaderboard/set_display) — users 는 RPC 전용
   - 방/멤버: rooms(1~10), room_members 직접 read/write (permissive) + realtime
   - 점수: rk_finish_game / rk_finish_race / rk_finish_hunt (서버 권위)
   - 좌석/유령: rk_take_seat(원자) / rk_heartbeat / rk_reap_stale
   - 미니게임 위치: broadcast 채널(휘발, DB 미경유)
   ========================================================================= */

let sb = null;
let SERVER_OFFSET = 0; // serverNow - clientNow (ms)
let _lastSync = 0, _lastAttempt = 0, _syncing = false;   // 클럭 동기 신선도/중복호출 가드
// 세션 토큰 접근(app.js 전역 ME). 토큰 인자 없는 래퍼들이 RPC 호출 시 사용.
function _tok() { return (typeof ME !== 'undefined' && ME) ? ME.token : null; }

function configReady() {
  return window.SUPABASE_URL && !String(window.SUPABASE_URL).includes('YOUR_') &&
         window.SUPABASE_ANON_KEY && !String(window.SUPABASE_ANON_KEY).includes('YOUR_');
}
function initSupabase() {
  sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY,
    { realtime: { params: { eventsPerSecond: 20 } } });   // broadcast(미니게임) 헤드룸
  return sb;
}
function serverNow() { return Date.now() + SERVER_OFFSET; }
// 클럭 동기가 한 번도 성공 못 했거나(0) 60초 넘게 오래됐으면 재동기 필요 → 타이머 클럭스큐 자가치유
function serverTimeStale() { return _lastSync === 0 || (Date.now() - _lastSync) > 60000; }
// 서버시각 오프셋 측정. 3회 샘플 중 최소 RTT 채택(정확도↑), 실패 시 직전 오프셋 보존(0으로 리셋 안 함).
async function syncServerTime() {
  if (_syncing || (Date.now() - _lastAttempt) < 1500) return false;   // 과도호출 억제
  _syncing = true; _lastAttempt = Date.now();
  try {
    let best = null;
    for (let i = 0; i < 3; i++) {
      try {
        const t0 = Date.now();
        const { data, error } = await sb.rpc('rk_now');
        const t1 = Date.now();
        if (error || !data) continue;
        const rtt = t1 - t0, offset = new Date(data).getTime() - (t0 + rtt / 2);
        if (!best || rtt < best.rtt) best = { rtt, offset };
      } catch (e) { /* 다음 샘플 시도 */ }
    }
    if (best) { SERVER_OFFSET = best.offset; _lastSync = Date.now(); return true; }
    return false;                                       // 실패 → 이전 오프셋 유지
  } finally { _syncing = false; }
}

/* ----------------------------- 계정 ----------------------------------- */
function mapErr(e) {
  const m = String((e && e.message) || e || '');
  if (m.includes('USERNAME_TAKEN'))  return '이미 사용 중인 아이디예요.';
  if (m.includes('BAD_CREDENTIALS')) return '아이디 또는 비밀번호가 틀렸어요.';
  if (m.includes('USERNAME_LEN'))    return '아이디는 2~20자로 입력하세요.';
  if (m.includes('PW_LEN'))          return '비밀번호는 4자 이상이어야 해요.';
  if (m.includes('NAME_KR'))         return '본명은 한글로 1~10자 입력하세요.';
  if (m.includes('NOT_CONSERVED') || m.includes('BAD_POOL')) return '게임 상태가 올바르지 않아 점수를 반영하지 못했어요.';
  return '오류: ' + m;
}
async function apiSignup(username, password, realName) {
  const { data, error } = await sb.rpc('rk_signup', { p_username: username, p_password: password, p_real_name: realName });
  if (error) return { error: mapErr(error) };
  return { profile: data };
}
async function apiLogin(username, password) {
  const { data, error } = await sb.rpc('rk_login', { p_username: username, p_password: password });
  if (error) return { error: mapErr(error) };
  return { profile: data };
}
async function apiMe(token) {
  if (!token) return null;
  const { data, error } = await sb.rpc('rk_me', { p_token: token });
  if (error) return undefined;   // 네트워크/일시 오류 → 로그인 유지(undefined)
  return data;                   // null = 토큰 무효(타 기기 로그인) / obj = 정상
}
async function apiLeaderboard(game) {
  const { data } = await sb.rpc('rk_leaderboard', { p_game: game || 'rummikub' });
  return data || [];
}
async function apiSetDisplay(token, game) {
  const { data, error } = await sb.rpc('rk_set_display', { p_token: token, p_game: game || null });
  if (error) return { error: mapErr(error) };
  return { display: data };   // {game, score}
}

/* ----------------------------- 방/멤버 -------------------------------- */
async function fetchRooms() {
  const { data } = await sb.from('rooms').select('*').order('id');
  return data || [];
}
async function fetchRoom(roomId) {
  const { data } = await sb.from('rooms').select('*').eq('id', roomId).maybeSingle();
  return data;
}
async function fetchMembers(roomId) {
  let q = sb.from('room_members').select('*');
  if (roomId != null) q = q.eq('room_id', roomId);
  const { data } = await q;
  return data || [];
}
async function fetchAllMembers() {
  const { data } = await sb.from('room_members').select('room_id,user_id,seat,role,name');
  return data || [];
}

// 현재 게임 기준 표시 스냅샷 + 꾸미기 미러
function memberSnapshot(me, game) {
  const g = (game && me.games && me.games[game]) || { score: 0, wins: 0, losses: 0, streak: 0 };
  const disp = me.display || { game: null, score: 0 };
  return {
    score: g.score || 0, wins: g.wins || 0, losses: g.losses || 0, streak: g.streak || 0,
    display_game: disp.game || null, display_score: disp.score || 0,
  };
}

async function enterRoom(roomId, me, game) {
  await sb.rpc('rk_enter_room', { p_token: me.token, p_room: roomId, p_game: game || null });
  await heartbeat(me.token, roomId);
}
// 방의 게임이 바뀌었을 때(방장 선택) 내 표시 스냅샷 갱신
async function updateMemberSnapshot(roomId, me, game) {
  await sb.rpc('rk_update_snapshot', { p_token: me.token, p_room: roomId, p_game: game || null });
}
// 원자적 착석 — 유령좌석/동시경합 차단
async function takeSeat(roomId, me, seat) {
  const { data, error } = await sb.rpc('rk_take_seat', { p_token: me.token, p_room: roomId, p_seat: seat });
  if (error) return { ok: false, reason: 'err', error };
  return data || { ok: false, reason: 'err' };
}
async function unseat(roomId, me) {
  await sb.rpc('rk_unseat', { p_token: me.token, p_room: roomId });
}
async function spectate(roomId, me) {
  await sb.rpc('rk_spectate', { p_token: me.token, p_room: roomId });
}
async function leaveRoom(roomId, me) {
  await sb.rpc('rk_leave_room', { p_token: me.token, p_room: roomId });
}
async function setTurnSeconds(roomId, sec) {
  await sb.rpc('rk_set_turn_seconds', { p_token: _tok(), p_room: roomId, p_sec: sec });
}
async function setRoomGame(roomId, game) {   // 방장이 종류 선택 (대기 중에만; 트리거가 강제)
  await sb.rpc('rk_set_room_game', { p_token: _tok(), p_room: roomId, p_game: game });
}
async function startGame(roomId, state) {
  const { data, error } = await sb.rpc('rk_start_game', { p_token: _tok(), p_room: roomId, p_state: state });
  if (error || !data) return { ok: false, version: null };
  return { ok: !!data.ok, version: (data.version != null ? data.version : null) };
}
async function pushState(roomId, state, expectedVersion) {
  const { data, error } = await sb.rpc('rk_push_state', {
    p_token: _tok(), p_room: roomId, p_expected: expectedVersion,
    p_state: state, p_status: state.status || 'playing',
  });
  if (error || !data || !data.ok) return { ok: false };
  return { ok: true, version: data.version, room: data.room };
}
// 원자적 퇴장(서버 RPC). 마지막 1명이 나가면 방을 빈 대기방으로 리셋. RPC 미적용 시 옛 leaveRoom 폴백.
async function leaveRoomRpc(roomId, me) {
  try { await sb.rpc('rk_leave_room', { p_token: me.token, p_room: roomId }); }
  catch (e) { try { await leaveRoom(roomId, me); } catch (_) {} }
}
// 개발자 모드: 선택한 방들 강제 초기화(점수/전적 불변). 반환 처리 방 개수 또는 null.
async function adminResetRooms(rooms) {
  const { data, error } = await sb.rpc('rk_admin_reset_rooms', { p_token: _tok(), p_rooms: rooms });
  if (error) { console.warn('admin reset', error); return null; }
  return data;
}
/* 개발자 도구: 유저스탯 / 로그 / 공지 (모두 서버 is_admin 검증) */
async function adminUsers(q) { const { data, error } = await sb.rpc('rk_admin_users', { p_token: _tok(), p_q: q || null }); if (error) { console.warn('admin users', error); return null; } return data; }
async function adminSetName(uid, name) { const { data, error } = await sb.rpc('rk_admin_set_name', { p_token: _tok(), p_uid: uid, p_name: name }); if (error) return { ok: false, error: String((error && error.message) || error) }; return data; }
async function adminSetScore(uid, game, score) { const { data, error } = await sb.rpc('rk_admin_set_score', { p_token: _tok(), p_uid: uid, p_game: game, p_score: score }); if (error) return { ok: false, error: String((error && error.message) || error) }; return data; }
async function adminLogs(game, limit) { const { data, error } = await sb.rpc('rk_admin_logs', { p_token: _tok(), p_game: game || null, p_limit: limit || 80 }); if (error) { console.warn('admin logs', error); return null; } return data; }
async function setAnnouncement(content, minutes) { const { data, error } = await sb.rpc('rk_set_announcement', { p_token: _tok(), p_content: content, p_minutes: minutes }); if (error) return { ok: false, error: String((error && error.message) || error) }; return data; }
async function getAnnouncement() { const { data, error } = await sb.rpc('rk_get_announcement'); if (error) return null; return data; }
// 방장 강퇴(대기 중에만). 반환 {ok}.
async function kickMember(roomId, me, targetId) {
  const { data, error } = await sb.rpc('rk_kick_member', { p_token: me.token, p_room: roomId, p_target: targetId });
  if (error) return { ok: false, error: String((error && error.message) || error) };
  return data || { ok: false };
}

/* ----------------------------- 마피아 RPC ---------------------------- */
async function mafiaStartRoles(roomId, me) {
  const { data, error } = await sb.rpc('mf_start', { p_token: me.token, p_room: roomId });
  if (error) return { ok: false, error: String((error && error.message) || error) };
  return data;
}
async function mfMyView(roomId, me) {
  const { data, error } = await sb.rpc('mf_my_view', { p_token: me.token, p_room: roomId });
  if (error) throw error;
  return data;
}
async function mfNightAction(roomId, me, target) {
  const { data, error } = await sb.rpc('mf_night_action', { p_token: me.token, p_room: roomId, p_target: target });
  if (error) return { ok: false, error: String((error && error.message) || error) };
  return data;
}
async function mfDayVote(roomId, me, target) {
  const { data, error } = await sb.rpc('mf_day_vote', { p_token: me.token, p_room: roomId, p_target: target });
  if (error) return { ok: false, error: String((error && error.message) || error) };
  return data;
}
async function mfResolvePhase(roomId, me, phase) {
  const { data, error } = await sb.rpc('mf_resolve_phase', { p_token: me.token, p_room: roomId, p_expected: phase });
  if (error) return { ok: false, error: String((error && error.message) || error) };
  return data;
}
async function finishGame(roomId, token, game) {
  const rpc = game === 'race' ? 'rk_finish_race' : game === 'hunt' ? 'rk_finish_hunt'
    : game === 'davinci' ? 'rk_finish_davinci' : game === 'mafia' ? 'rk_finish_mafia'
    : game === 'splendor' ? 'rk_finish_splendor' : game === 'uno' ? 'rk_finish_uno' : 'rk_finish_game';
  const { data, error } = await sb.rpc(rpc, { p_token: token, p_room: roomId });
  if (error) return { ok: false, error };
  return { ok: true, results: data };
}
// promoteHost / deleteMember 제거 — 유령/방장 정리는 서버 권위 rk_reap_stale 로 일원화(보안)

/* ----------------------------- 유령정리 ------------------------------ */
async function heartbeat(token, roomId) {
  try { await sb.rpc('rk_heartbeat', { p_token: token, p_room: roomId }); } catch (e) {}
}
async function reapStale(roomId, ttl) {
  try { const { data } = await sb.rpc('rk_reap_stale', { p_room: roomId, p_ttl_seconds: ttl || 10 }); return data || 0; }
  catch (e) { return 0; }
}

/* ----------------------------- 실시간 -------------------------------- */
function subscribeRoom(roomId, cb) {
  return sb.channel('room-' + roomId + '-db')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.' + roomId }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: 'room_id=eq.' + roomId }, cb)
    .subscribe();
}
function subscribeLobby(cb) {
  return sb.channel('lobby-db')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, cb)
    .subscribe();
}
// presence: 접속 감지(즉시성 보조). onSync(presenceState) 호출.
function joinPresence(roomId, me, info, onSync) {
  const ch = sb.channel('room-' + roomId + '-presence', { config: { presence: { key: me.id } } });
  ch.on('presence', { event: 'sync' }, () => onSync(ch.presenceState()));
  ch.on('presence', { event: 'leave' }, () => onSync(ch.presenceState()));
  ch.subscribe(async (status) => { if (status === 'SUBSCRIBED') await ch.track(info); });
  return ch;
}
// broadcast: 미니게임 고빈도 위치/이벤트 (DB 미경유, self 미수신)
function joinBroadcast(roomId, onMsg) {
  const ch = sb.channel('room-' + roomId + '-rt', { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'm' }, (p) => onMsg(p.payload));
  ch.subscribe();
  return { ch, send: (payload) => { try { ch.send({ type: 'broadcast', event: 'm', payload }); } catch (e) {} } };
}
// broadcast 채팅: 방 단위 휘발 메시지(DB 미경유). 미니게임 'm' 채널과 분리된 'c' 채널.
function joinChat(roomId, onMsg) {
  const ch = sb.channel('room-' + roomId + '-chat', { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'c' }, (p) => onMsg(p.payload));
  ch.subscribe();
  return { ch, send: (payload) => { try { ch.send({ type: 'broadcast', event: 'c', payload }); } catch (e) {} } };
}
function leaveChannel(ch) { if (ch) try { sb.removeChannel(ch); } catch (e) {} }
