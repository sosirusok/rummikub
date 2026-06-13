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
async function syncServerTime() {
  try {
    const t0 = Date.now();
    const { data } = await sb.rpc('rk_now');
    const t1 = Date.now();
    if (data) SERVER_OFFSET = new Date(data).getTime() - (t0 + (t1 - t0) / 2);
  } catch (e) { /* keep offset 0 */ }
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
  if (error) return null;
  return data;   // {id,username,real_name,display_game,games:{rummikub,race,hunt},display:{game,score},token}
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
  const g = (me.games && me.games[game]) || { score: 0, wins: 0, losses: 0, streak: 0 };
  const disp = me.display || { game: null, score: 0 };
  return {
    score: g.score || 0, wins: g.wins || 0, losses: g.losses || 0, streak: g.streak || 0,
    display_game: disp.game || null, display_score: disp.score || 0,
  };
}

async function enterRoom(roomId, me, game) {
  const snap = memberSnapshot(me, game || 'rummikub');
  await sb.from('room_members').upsert({
    room_id: roomId, user_id: me.id, seat: null, role: 'player',
    name: me.real_name, ...snap, joined_at: new Date().toISOString(),
  }, { onConflict: 'room_id,user_id' });
  await sb.from('rooms').update({ host_id: me.id }).eq('id', roomId).is('host_id', null);
  await heartbeat(me.token, roomId);
}
// 방의 게임이 바뀌었을 때(미니게임 방장 선택) 내 표시 스냅샷 갱신
async function updateMemberSnapshot(roomId, me, game) {
  const snap = memberSnapshot(me, game || 'rummikub');
  await sb.from('room_members').update(snap).eq('room_id', roomId).eq('user_id', me.id);
}
// 원자적 착석 — 유령좌석/동시경합 차단
async function takeSeat(roomId, me, seat) {
  const { data, error } = await sb.rpc('rk_take_seat', { p_token: me.token, p_room: roomId, p_seat: seat });
  if (error) return { ok: false, reason: 'err', error };
  return data || { ok: false, reason: 'err' };
}
async function unseat(roomId, me) {
  await sb.from('room_members').update({ seat: null }).eq('room_id', roomId).eq('user_id', me.id);
}
async function spectate(roomId, me) {
  await sb.from('room_members').update({ role: 'spectator', seat: null }).eq('room_id', roomId).eq('user_id', me.id);
}
async function leaveRoom(roomId, me) {
  await sb.from('room_members').delete().eq('room_id', roomId).eq('user_id', me.id);
  await sb.from('room_presence').delete().eq('room_id', roomId).eq('user_id', me.id);
  const members = await fetchMembers(roomId);
  if (members.length === 0) {
    await sb.from('rooms').update({
      host_id: null, status: 'waiting', state: null, version: 0,
      game: (roomId >= 1 && roomId <= 5) ? 'rummikub' : null,
    }).eq('id', roomId);
  } else {
    const earliest = members.slice().sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at))[0];
    await sb.from('rooms').update({ host_id: earliest.user_id }).eq('id', roomId).eq('host_id', me.id);
  }
}
async function setTurnSeconds(roomId, sec) {
  await sb.from('rooms').update({ turn_seconds: sec }).eq('id', roomId);
}
async function setRoomGame(roomId, game) {   // 미니게임 방장이 종류 선택 (대기 중에만; 트리거가 강제)
  await sb.from('rooms').update({ game }).eq('id', roomId).eq('status', 'waiting');
}
async function startGame(roomId, state) {
  const { data } = await sb.from('rooms')
    .update({ status: 'playing', state, version: 1 })
    .eq('id', roomId).eq('status', 'waiting').select();
  return { ok: !!(data && data.length), version: data && data[0] ? data[0].version : null };
}
async function pushState(roomId, state, expectedVersion) {
  const { data } = await sb.from('rooms')
    .update({ status: state.status || 'playing', state, version: expectedVersion + 1 })
    .eq('id', roomId).eq('version', expectedVersion).select();
  if (data && data.length) return { ok: true, version: data[0].version, room: data[0] };
  return { ok: false };
}
async function resetRoomToWaiting(roomId) {
  await sb.from('rooms').update({ status: 'waiting', state: null, version: 0 }).eq('id', roomId);
}
async function finishGame(roomId, token, game) {
  const rpc = game === 'race' ? 'rk_finish_race' : game === 'hunt' ? 'rk_finish_hunt' : 'rk_finish_game';
  const { data, error } = await sb.rpc(rpc, { p_token: token, p_room: roomId });
  if (error) return { ok: false, error };
  return { ok: true, results: data };
}
async function promoteHost(roomId, fromHostId, toUserId) {
  await sb.from('rooms').update({ host_id: toUserId }).eq('id', roomId).eq('host_id', fromHostId);
}
async function deleteMember(roomId, userId) {
  await sb.from('room_members').delete().eq('room_id', roomId).eq('user_id', userId);
}

/* ----------------------------- 유령정리 ------------------------------ */
async function heartbeat(token, roomId) {
  try { await sb.rpc('rk_heartbeat', { p_token: token, p_room: roomId }); } catch (e) {}
}
async function reapStale(roomId, ttl) {
  try { const { data } = await sb.rpc('rk_reap_stale', { p_room: roomId, p_ttl_seconds: ttl || 25 }); return data || 0; }
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
function leaveChannel(ch) { if (ch) try { sb.removeChannel(ch); } catch (e) {} }
