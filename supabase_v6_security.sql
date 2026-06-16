-- =====================================================================
-- v6 보안 전면 보강 — 단독 실행용 (supabase_setup.sql 끝 v6 블록과 동일)
-- 이것만 Supabase SQL Editor 에 붙여넣고 RUN. 멱등(재실행 안전).
-- 전체 supabase_setup.sql 재실행은 옛 제약 버그가 있어 권장 안 함(이 파일이면 충분).
--   1) 방/멤버 쓰기 전부를 토큰검증 SECURITY DEFINER RPC 로 (RLS 잠금 대비)
--   2) 개발자 강제초기화에 서버 admin 인증(users.is_admin)
--   3) 정산 단일승자 검증(다빈치/스플렌더/우노) — '전원 1등' 위조 차단
--   4) rk_reap_stale TTL 하한 클램프(ttl=0 악용 차단)
--   ⚠ 이 블록은 RLS 를 잠그지 않음(무중단). 잠금은 신규 클라 배포 후 supabase_lock_rls.sql 로 RUN.
-- =====================================================================

-- ---- 관리자 플래그(본인 계정에 수동 부여: update public.users set is_admin=true where username='내아이디';) ----
alter table public.users add column if not exists is_admin boolean not null default false;

-- ---- 입장: 멤버행 upsert(이름·스냅샷은 서버 권위) + 방장 공석이면 차지 ----
create or replace function public.rk_enter_room(p_token uuid, p_room int, p_game text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_name text; v_dispgame text;
        v_score int; v_wins int; v_losses int; v_streak int; v_dispscore int;
begin
  select id, real_name, display_game into v_user, v_name, v_dispgame from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  if p_room < 1 or p_room > 10 then raise exception 'NO_ROOM'; end if;
  v_score:=0; v_wins:=0; v_losses:=0; v_streak:=0;
  if p_game is not null then
    select coalesce(score,0),coalesce(wins,0),coalesce(losses,0),coalesce(streak,0)
      into v_score,v_wins,v_losses,v_streak from public.user_game_stats where user_id=v_user and game=p_game;
    v_score:=coalesce(v_score,0); v_wins:=coalesce(v_wins,0); v_losses:=coalesce(v_losses,0); v_streak:=coalesce(v_streak,0);
  end if;
  v_dispscore := 0;
  if v_dispgame is not null then
    select coalesce(score,0) into v_dispscore from public.user_game_stats where user_id=v_user and game=v_dispgame;
    v_dispscore := coalesce(v_dispscore,0);
  end if;
  insert into public.room_members(room_id,user_id,seat,role,name,score,wins,losses,streak,display_game,display_score,joined_at)
    values (p_room,v_user,null,'player',v_name,v_score,v_wins,v_losses,v_streak,v_dispgame,v_dispscore,now())
  on conflict (room_id,user_id) do update set
    seat=null, role='player', name=excluded.name, score=excluded.score, wins=excluded.wins,
    losses=excluded.losses, streak=excluded.streak, display_game=excluded.display_game,
    display_score=excluded.display_score, joined_at=now();
  update public.rooms set host_id = v_user where id = p_room and host_id is null;
end; $$;

-- ---- 표시 스냅샷 갱신(방 게임 변경 시) ----
create or replace function public.rk_update_snapshot(p_token uuid, p_room int, p_game text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_dispgame text; v_score int; v_wins int; v_losses int; v_streak int; v_dispscore int;
begin
  select id, display_game into v_user, v_dispgame from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  v_score:=0; v_wins:=0; v_losses:=0; v_streak:=0;
  if p_game is not null then
    select coalesce(score,0),coalesce(wins,0),coalesce(losses,0),coalesce(streak,0)
      into v_score,v_wins,v_losses,v_streak from public.user_game_stats where user_id=v_user and game=p_game;
  end if;
  v_dispscore:=0;
  if v_dispgame is not null then
    select coalesce(score,0) into v_dispscore from public.user_game_stats where user_id=v_user and game=v_dispgame;
  end if;
  update public.room_members
     set score=coalesce(v_score,0), wins=coalesce(v_wins,0), losses=coalesce(v_losses,0),
         streak=coalesce(v_streak,0), display_game=v_dispgame, display_score=coalesce(v_dispscore,0)
   where room_id=p_room and user_id=v_user;
end; $$;

-- ---- 착석 해제 / 관전 (본인 행만) ----
create or replace function public.rk_unseat(p_token uuid, p_room int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid;
begin
  select id into v_user from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  update public.room_members set seat=null where room_id=p_room and user_id=v_user;
end; $$;

create or replace function public.rk_spectate(p_token uuid, p_room int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid;
begin
  select id into v_user from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  update public.room_members set role='spectator', seat=null where room_id=p_room and user_id=v_user;
end; $$;

-- ---- 턴 시간 / 방 게임 종류(멤버만; 트리거가 도메인·cap 강제) ----
create or replace function public.rk_set_turn_seconds(p_token uuid, p_room int, p_sec int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid;
begin
  select id into v_user from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  if not exists (select 1 from public.room_members where room_id=p_room and user_id=v_user) then raise exception 'NOT_MEMBER'; end if;
  update public.rooms set turn_seconds = least(180, greatest(5, coalesce(p_sec,30))) where id=p_room;
end; $$;

create or replace function public.rk_set_room_game(p_token uuid, p_room int, p_game text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid;
begin
  select id into v_user from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  if not exists (select 1 from public.room_members where room_id=p_room and user_id=v_user) then raise exception 'NOT_MEMBER'; end if;
  update public.rooms set game = p_game where id=p_room and status='waiting';
end; $$;

-- ---- 게임 시작: 멤버만, 대기→플레이(CAS), state 크기 상한 ----
create or replace function public.rk_start_game(p_token uuid, p_room int, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_ver bigint;
begin
  select id into v_user from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  if not exists (select 1 from public.room_members where room_id=p_room and user_id=v_user) then raise exception 'NOT_MEMBER'; end if;
  if pg_column_size(p_state) > 200000 then raise exception 'STATE_TOO_BIG'; end if;
  update public.rooms set status='playing', state=p_state, version=1
     where id=p_room and status='waiting'
     returning version into v_ver;
  if v_ver is null then return jsonb_build_object('ok',false); end if;
  return jsonb_build_object('ok',true,'version',v_ver);
end; $$;

-- ---- 상태 푸시: 멤버만, 버전 CAS, state 크기 상한, status 화이트리스트 ----
create or replace function public.rk_push_state(p_token uuid, p_room int, p_expected bigint, p_state jsonb, p_status text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_ver bigint; v_st text; v_room public.rooms;
begin
  select id into v_user from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  if not exists (select 1 from public.room_members where room_id=p_room and user_id=v_user) then raise exception 'NOT_MEMBER'; end if;
  if pg_column_size(p_state) > 200000 then raise exception 'STATE_TOO_BIG'; end if;
  v_st := case when p_status in ('waiting','playing','finished') then p_status else 'playing' end;
  update public.rooms set status=v_st, state=p_state, version=version+1
     where id=p_room and version=p_expected
     returning version into v_ver;
  if v_ver is null then return jsonb_build_object('ok',false); end if;
  select * into v_room from public.rooms where id=p_room;
  return jsonb_build_object('ok',true,'version',v_ver,'room',to_jsonb(v_room));
end; $$;

-- ---- 개발자 강제초기화: 서버 admin 인증(토큰 필수). 구 무인증 버전은 잠금 단계에서 제거 ----
create or replace function public.rk_admin_reset_rooms(p_token uuid, p_rooms int[])
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_admin boolean; v_cnt int;
begin
  select id, is_admin into v_user, v_admin from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  if not coalesce(v_admin,false) then raise exception 'NOT_ADMIN'; end if;
  if p_rooms is null or array_length(p_rooms,1) is null then return 0; end if;
  delete from public.mafia_secrets where room_id = any(p_rooms);
  delete from public.room_members  where room_id = any(p_rooms) and room_id between 1 and 10;
  delete from public.room_presence where room_id = any(p_rooms) and room_id between 1 and 10;
  update public.rooms set host_id=null, status='waiting', state=null, version=0, game=null, turn_started_at=null
   where id = any(p_rooms) and id between 1 and 10;
  get diagnostics v_cnt = row_count;
  return v_cnt;
end; $$;

-- ---- rk_reap_stale: TTL 하한 클램프(외부에서 0/음수로 생존자 강제퇴출 차단) ----
create or replace function public.rk_reap_stale(p_room int, p_ttl_seconds int default 25)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_deleted int; v_left int; v_earliest uuid; v_room public.rooms; v_ttl int;
begin
  v_ttl := greatest(8, coalesce(p_ttl_seconds, 25));   -- 하한 8초
  select * into v_room from public.rooms where id = p_room;
  if not found then return 0; end if;
  delete from public.room_members m
   where m.room_id = p_room
     and m.joined_at < now() - make_interval(secs => v_ttl)
     and not exists (select 1 from public.room_presence p
                     where p.room_id=p_room and p.user_id=m.user_id and p.last_seen >= now() - make_interval(secs => v_ttl))
     and (v_room.status in ('waiting','finished') or m.seat is null);
  get diagnostics v_deleted = row_count;
  delete from public.room_presence p
   where p.room_id = p_room
     and not exists (select 1 from public.room_members m where m.room_id=p_room and m.user_id=p.user_id);
  select count(*) into v_left from public.room_members where room_id = p_room;
  if v_left = 0 then
    delete from public.mafia_secrets where room_id = p_room;
    update public.rooms set host_id=null, status='waiting', state=null, version=0, game=null where id = p_room;
  else
    if v_room.host_id is null or not exists (select 1 from public.room_members where room_id=p_room and user_id=v_room.host_id) then
      select user_id into v_earliest from public.room_members where room_id=p_room order by joined_at asc limit 1;
      update public.rooms set host_id = v_earliest where id = p_room;
    end if;
  end if;
  return v_deleted;
end; $$;

-- ---- 정산 단일승자 검증: 다빈치/스플렌더/우노 (1등은 정확히 1명 — '전원 1등' 위조 차단) ----
create or replace function public.rk_finish_davinci(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_ranks jsonb;
  v_seats text[]; v_n int; v_results jsonb := '{}'::jsonb;
  i int; v_seat text; v_uid uuid; v_rank int; v_curscore int; v_curstreak int;
  v_won boolean; v_delta int; v_ns int; v_nstreak int; v_w int; v_l int;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if coalesce(v_room.game,'') <> 'davinci' then raise exception 'WRONG_GAME'; end if;
  if v_room.status <> 'playing' then return coalesce(v_room.state->'results','{}'::jsonb); end if;
  v_state := v_room.state; v_players := v_state->'players'; v_ranks := v_state->'ranks';
  if not exists (select 1 from jsonb_each_text(v_players) e where e.value=v_user::text) then raise exception 'NOT_A_PLAYER'; end if;
  if v_ranks is null then raise exception 'NO_RANKS'; end if;
  select array_agg(key) into v_seats from jsonb_object_keys(v_players) key;
  v_n := coalesce(array_length(v_seats,1),0);
  if v_n not between 2 and 4 then raise exception 'BAD_N'; end if;
  perform 1 from unnest(v_seats) s where (v_ranks->>s) is null;
  if found then raise exception 'BAD_RANKS'; end if;  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_rank := (v_ranks->>v_seat)::int;
    if v_rank < 1 or v_rank > v_n then raise exception 'BAD_RANK_VAL'; end if;
    v_uid := (v_players->>v_seat)::uuid;
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak from public.user_game_stats where user_id=v_uid and game='davinci';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    v_won := (v_rank = 1);
    v_delta := public.rk_rank_points('davinci', v_curscore, v_n, v_rank);
    v_ns := greatest(0, least(15000, v_curscore + v_delta));
    v_nstreak := case when v_won then v_curstreak + 1 else 0 end;
    perform public.rk_bump_stats(v_uid, 'davinci', v_ns, v_nstreak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='davinci'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'rank',v_rank,'delta',v_delta,'bonus',0,'won',v_won,
      'prevScore',v_curscore,'newScore',v_ns,'streak',v_nstreak,'treatment',case when v_won then 'apply' else 'break' end,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  return v_results;
end; $$;

create or replace function public.rk_finish_splendor(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_ranks jsonb; v_pts jsonb; v_cards jsonb;
  v_seats text[]; v_n int; v_results jsonb := '{}'::jsonb;
  i int; v_seat text; v_uid uuid; v_rank int; v_curscore int; v_curstreak int;
  v_won boolean; v_delta int; v_ns int; v_nstreak int; v_w int; v_l int;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if coalesce(v_room.game,'') <> 'splendor' then raise exception 'WRONG_GAME'; end if;
  if v_room.status <> 'playing' then return coalesce(v_room.state->'results','{}'::jsonb); end if;
  v_state := v_room.state; v_players := v_state->'players'; v_ranks := v_state->'ranks';
  v_pts := coalesce(v_state->'points','{}'::jsonb); v_cards := coalesce(v_state->'cardCounts','{}'::jsonb);
  if not exists (select 1 from jsonb_each_text(v_players) e where e.value=v_user::text) then raise exception 'NOT_A_PLAYER'; end if;
  if v_ranks is null then raise exception 'NO_RANKS'; end if;
  select array_agg(key) into v_seats from jsonb_object_keys(v_players) key;
  v_n := coalesce(array_length(v_seats,1),0);
  if v_n not between 2 and 4 then raise exception 'BAD_N'; end if;
  perform 1 from unnest(v_seats) s where (v_ranks->>s) is null;
  if found then raise exception 'BAD_RANKS'; end if;  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_rank := (v_ranks->>v_seat)::int;
    if v_rank < 1 or v_rank > v_n then raise exception 'BAD_RANK_VAL'; end if;
    v_uid := (v_players->>v_seat)::uuid;
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak from public.user_game_stats where user_id=v_uid and game='splendor';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    v_won := (v_rank = 1);
    v_delta := public.rk_rank_points('splendor', v_curscore, v_n, v_rank);
    v_ns := greatest(0, least(15000, v_curscore + v_delta));
    v_nstreak := case when v_won then v_curstreak + 1 else 0 end;
    perform public.rk_bump_stats(v_uid, 'splendor', v_ns, v_nstreak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='splendor'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'rank',v_rank,'delta',v_delta,'bonus',0,'won',v_won,
      'points',coalesce((v_pts->>v_seat)::int,0),'cards',coalesce((v_cards->>v_seat)::int,0),
      'prevScore',v_curscore,'newScore',v_ns,'streak',v_nstreak,'treatment',case when v_won then 'apply' else 'break' end,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  return v_results;
end; $$;

create or replace function public.rk_finish_uno(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_ranks jsonb;
  v_seats text[]; v_n int; v_results jsonb := '{}'::jsonb;
  i int; v_seat text; v_uid uuid; v_rank int; v_curscore int; v_curstreak int;
  v_won boolean; v_delta int; v_ns int; v_nstreak int; v_w int; v_l int;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if coalesce(v_room.game,'') <> 'uno' then raise exception 'WRONG_GAME'; end if;
  if v_room.status <> 'playing' then return coalesce(v_room.state->'results','{}'::jsonb); end if;
  v_state := v_room.state; v_players := v_state->'players'; v_ranks := v_state->'ranks';
  if not exists (select 1 from jsonb_each_text(v_players) e where e.value=v_user::text) then raise exception 'NOT_A_PLAYER'; end if;
  if v_ranks is null then raise exception 'NO_RANKS'; end if;
  select array_agg(key) into v_seats from jsonb_object_keys(v_players) key;
  v_n := coalesce(array_length(v_seats,1),0);
  if v_n not between 2 and 4 then raise exception 'BAD_N'; end if;
  perform 1 from unnest(v_seats) s where (v_ranks->>s) is null;
  if found then raise exception 'BAD_RANKS'; end if;  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_rank := (v_ranks->>v_seat)::int;
    if v_rank < 1 or v_rank > v_n then raise exception 'BAD_RANK_VAL'; end if;
    v_uid := (v_players->>v_seat)::uuid;
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak from public.user_game_stats where user_id=v_uid and game='uno';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    v_won := (v_rank = 1);
    v_delta := public.rk_rank_points('uno', v_curscore, v_n, v_rank);
    v_ns := greatest(0, least(15000, v_curscore + v_delta));
    v_nstreak := case when v_won then v_curstreak + 1 else 0 end;
    perform public.rk_bump_stats(v_uid, 'uno', v_ns, v_nstreak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='uno'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'rank',v_rank,'delta',v_delta,'bonus',0,'won',v_won,
      'prevScore',v_curscore,'newScore',v_ns,'streak',v_nstreak,'treatment',case when v_won then 'apply' else 'break' end,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  return v_results;
end; $$;

-- ---- v6 권한 ----
grant execute on function public.rk_enter_room(uuid,int,text)            to anon, authenticated;
grant execute on function public.rk_update_snapshot(uuid,int,text)       to anon, authenticated;
grant execute on function public.rk_unseat(uuid,int)                     to anon, authenticated;
grant execute on function public.rk_spectate(uuid,int)                   to anon, authenticated;
grant execute on function public.rk_set_turn_seconds(uuid,int,int)       to anon, authenticated;
grant execute on function public.rk_set_room_game(uuid,int,text)         to anon, authenticated;
grant execute on function public.rk_start_game(uuid,int,jsonb)           to anon, authenticated;
grant execute on function public.rk_push_state(uuid,int,bigint,jsonb,text) to anon, authenticated;
grant execute on function public.rk_admin_reset_rooms(uuid,int[])        to anon, authenticated;
