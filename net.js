/* =========================================================================
   net.js — Supabase Realtime 동기화 계층
   - 좌석(seats): 기본키 = seat(1~4). INSERT 충돌로 중복 선택 원천 차단.
   - 방(room): 단일 행 id='main'. state(JSONB) + version 으로 낙관적 동시성 제어.
   ========================================================================= */

let sb = null;
function configReady() {
  return window.SUPABASE_URL && !String(window.SUPABASE_URL).includes('YOUR_') &&
         window.SUPABASE_ANON_KEY && !String(window.SUPABASE_ANON_KEY).includes('YOUR_');
}
function initSupabase() {
  sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  return sb;
}

async function fetchAll() {
  const [roomRes, seatRes] = await Promise.all([
    sb.from('room').select('*').eq('id', 'main').maybeSingle(),
    sb.from('seats').select('*').order('seat'),
  ]);
  return { room: roomRes.data, seats: seatRes.data || [] };
}

function subscribeAll(cb) {
  return sb.channel('rk-room')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room' }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seats' }, cb)
    .subscribe();
}

async function claimSeat(seat, playerId, name) {
  const { error } = await sb.from('seats').insert({ seat, player_id: playerId, name });
  return { ok: !error, error };
}

async function startGame(state) {
  // status가 아직 waiting일 때만 성공 → 4명이 동시에 시도해도 1명만 반영됨
  const { data } = await sb.from('room')
    .update({ status: 'playing', state, version: 1 })
    .eq('id', 'main').eq('status', 'waiting').select();
  return { ok: !!(data && data.length) };
}

async function pushState(state, expectedVersion) {
  // version이 기대값과 같을 때만 성공 (덮어쓰기 방지)
  const { data } = await sb.from('room')
    .update({ status: state.status, state, version: expectedVersion + 1 })
    .eq('id', 'main').eq('version', expectedVersion).select();
  return { ok: !!(data && data.length) };
}

async function resetGame() {
  await sb.from('seats').delete().gte('seat', 1);
  await sb.from('room').update({ status: 'waiting', state: null, version: 0 }).eq('id', 'main');
}
