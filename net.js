/* =========================================================================
   net.js — Supabase 계층 (v2)
   - 계정: RPC(rk_signup/login/me/leaderboard) — users 테이블은 RPC로만 접근
   - 방/멤버: rooms, room_members 직접 read/write (permissive) + realtime
   - 점수: rk_finish_game (서버 권위 산정)
   - 시계: rk_now 로 서버 오프셋 보정 (타이머 시계오차 방지)
   ========================================================================= */

let sb = null;
let SERVER_OFFSET = 0; // serverNow - clientNow (ms)

function configReady() {
  return window.SUPABASE_URL && !String(window.SUPABASE_URL).includes('YOUR_') &&
         window.SUPABASE_ANON_KEY && !String(window.SUPABASE_ANON_KEY).includes('YOUR_');
}
function initSupabase() {
  sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY,
    { realtime: { params: { eventsPerSecond: 12 } } });
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
  if (m.includes('USERNAME_TAKEN')) return '이미 사용 중인 아이디예요.';
  if (m.includes('BAD_CREDENTIALS')) return '아이디 또는 비밀번호가 틀렸어요.';
  if (m.includes('USERNAME_LEN')) return '아이디는 2~20자로 입력하세요.';
  if (m.includes('PW_LEN')) return '비밀번호는 4자 이상이어야 해요.';
  if (m.includes('NAME_KR')) return '본명은 한글로 1~10자 입력하세요.';
  if (m.includes('NAME_REQ')) return '본명을 입력하세요.';
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
  return data;
}
async function apiLeaderboard() {
  const { data } = await sb.rpc('rk_leaderboard');
  return data || [];
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

async function enterRoom(roomId, me) {
  await sb.from('room_members').upsert({
    room_id: roomId, user_id: me.id, seat: null, role: 'player',
    name: me.real_name, score: me.score, wins: me.wins, losses: me.losses,
    joined_at: new Date().toISOString(),
  }, { onConflict: 'room_id,user_id' });
  // 빈 방이면 내가 방장
  await sb.from('rooms').update({ host_id: me.id }).eq('id', roomId).is('host_id', null);
}
async function takeSeat(roomId, me, seat) {
  const { error } = await sb.from('room_members')
    .update({ seat, role: 'player' }).eq('room_id', roomId).eq('user_id', me.id);
  return { ok: !error, error };
}
async function unseat(roomId, me) {
  await sb.from('room_members').update({ seat: null }).eq('room_id', roomId).eq('user_id', me.id);
}
async function spectate(roomId, me) {
  await sb.from('room_members').update({ role: 'spectator', seat: null }).eq('room_id', roomId).eq('user_id', me.id);
}
async function leaveRoom(roomId, me) {
  await sb.from('room_members').delete().eq('room_id', roomId).eq('user_id', me.id);
  const members = await fetchMembers(roomId);
  if (members.length === 0) {
    await sb.from('rooms').update({ host_id: null, status: 'waiting', state: null, version: 0 }).eq('id', roomId);
  } else {
    const earliest = members.slice().sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at))[0];
    await sb.from('rooms').update({ host_id: earliest.user_id }).eq('id', roomId).eq('host_id', me.id);
  }
}
async function setTurnSeconds(roomId, sec) {
  await sb.from('rooms').update({ turn_seconds: sec }).eq('id', roomId);
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
async function finishGame(roomId, token) {
  const { data, error } = await sb.rpc('rk_finish_game', { p_token: token, p_room: roomId });
  if (error) return { ok: false, error };
  return { ok: true, results: data };
}
// 호스트 부재 시 승격 (presence janitor 가 호출)
async function promoteHost(roomId, fromHostId, toUserId) {
  await sb.from('rooms').update({ host_id: toUserId }).eq('id', roomId).eq('host_id', fromHostId);
}
async function deleteMember(roomId, userId) {
  await sb.from('room_members').delete().eq('room_id', roomId).eq('user_id', userId);
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
// presence: 접속 감지. onSync(presenceState) 호출.
function joinPresence(roomId, me, info, onSync) {
  const ch = sb.channel('room-' + roomId + '-presence', { config: { presence: { key: me.id } } });
  ch.on('presence', { event: 'sync' }, () => onSync(ch.presenceState()));
  ch.on('presence', { event: 'leave' }, () => onSync(ch.presenceState()));
  ch.subscribe(async (status) => { if (status === 'SUBSCRIBED') await ch.track(info); });
  return ch;
}
function leaveChannel(ch) { if (ch) try { sb.removeChannel(ch); } catch (e) {} }
