-- =====================================================================
-- 루미큐브 v2 — Supabase 설정 (대시보드 → SQL Editor 에 전체 붙여넣고 RUN)
-- 다시 실행해도 안전(idempotent). v1의 room/seats 테이블은 폐기됩니다.
-- =====================================================================
create extension if not exists pgcrypto;
create extension if not exists citext;

-- v1 잔재 제거
drop table if exists public.seats cascade;
drop table if exists public.room  cascade;

-- ===== 계정 (RPC 전용: anon 정책 없음 → 직접 접근 불가, pass_hash/token 비노출) =====
create table if not exists public.users (
  id         uuid primary key default gen_random_uuid(),
  username   citext unique not null,
  pass_hash  text not null,
  real_name  text not null,
  score      int  not null default 0 check (score >= 0),
  wins       int  not null default 0,
  losses     int  not null default 0,
  token      uuid,
  created_at timestamptz not null default now()
);
alter table public.users enable row level security;   -- 정책 없음 = anon 직접 접근 전면 차단

-- ===== 방 5개 (permissive + realtime: 게임 상태/호스트/상태) =====
create table if not exists public.rooms (
  id              int primary key check (id between 1 and 5),
  host_id         uuid,
  status          text not null default 'waiting',   -- waiting | playing | finished
  state           jsonb,
  turn_seconds    int  not null default 30,
  turn_started_at timestamptz,
  version         bigint not null default 0,
  updated_at      timestamptz not null default now()
);
insert into public.rooms (id) select g from generate_series(1,5) g
  on conflict (id) do nothing;

-- ===== 방 멤버 (permissive + realtime: 좌석/관전/방 입장) =====
create table if not exists public.room_members (
  room_id   int  not null references public.rooms(id),
  user_id   uuid not null,
  seat      int,                                -- null = 미착석/관전
  role      text not null default 'player',     -- player | spectator
  name      text not null,
  score     int  not null default 0,            -- 표시용 스냅샷
  wins      int  not null default 0,
  losses    int  not null default 0,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create unique index if not exists room_members_seat_uniq
  on public.room_members(room_id, seat) where seat is not null;

alter table public.rooms        enable row level security;
alter table public.room_members enable row level security;
drop policy if exists rooms_all   on public.rooms;
drop policy if exists members_all on public.room_members;
create policy rooms_all   on public.rooms        for all using (true) with check (true);
create policy members_all on public.room_members for all using (true) with check (true);
alter table public.room_members replica identity full;

-- updated_at 갱신 + 턴이 바뀌면 서버시각으로 turn_started_at 스탬프(시계 오차 방지)
create or replace function public.rooms_touch() returns trigger as $$
begin
  new.updated_at = now();
  if (new.state is not null) and (
       old.state is null
       or (old.state->>'turn') is distinct from (new.state->>'turn')
       or (old.status is distinct from new.status and new.status = 'playing')
     ) then
    new.turn_started_at = now();
  end if;
  return new;
end; $$ language plpgsql;
drop trigger if exists trg_rooms_touch on public.rooms;
create trigger trg_rooms_touch before update on public.rooms
  for each row execute function public.rooms_touch();

-- realtime 발행 (중복 실행 안전)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rooms') then
    alter publication supabase_realtime add table public.rooms; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_members') then
    alter publication supabase_realtime add table public.room_members; end if;
end $$;

-- =====================================================================
-- RPC (SECURITY DEFINER: RLS 우회. users 는 오직 이 함수들로만 접근)
-- =====================================================================

-- 회원가입: 아이디+비번+본명. 점수 0 시작.
create or replace function public.rk_signup(p_username text, p_password text, p_real_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u public.users; t uuid;
begin
  if char_length(btrim(coalesce(p_username,''))) not between 2 and 20 then raise exception 'USERNAME_LEN'; end if;
  if char_length(coalesce(p_password,'')) < 4 then raise exception 'PW_LEN'; end if;
  if btrim(coalesce(p_real_name,'')) !~ '^[가-힣]{1,10}$' then raise exception 'NAME_KR'; end if;
  t := gen_random_uuid();
  begin
    insert into public.users(username, pass_hash, real_name, token)
    values (btrim(p_username), crypt(p_password, gen_salt('bf')), btrim(p_real_name), t)
    returning * into u;
  exception when unique_violation then raise exception 'USERNAME_TAKEN';
  end;
  return jsonb_build_object('id',u.id,'username',u.username,'real_name',u.real_name,
    'score',u.score,'wins',u.wins,'losses',u.losses,'token',u.token);
end; $$;

-- 로그인: 아이디+비번. 토큰 회전(단일 세션).
create or replace function public.rk_login(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u public.users; t uuid;
begin
  select * into u from public.users where username = btrim(p_username);
  if not found or u.pass_hash <> crypt(p_password, u.pass_hash) then
    perform pg_sleep(0.15);  -- 미세한 brute-force 완화
    raise exception 'BAD_CREDENTIALS';
  end if;
  t := gen_random_uuid();
  update public.users set token = t where id = u.id;
  return jsonb_build_object('id',u.id,'username',u.username,'real_name',u.real_name,
    'score',u.score,'wins',u.wins,'losses',u.losses,'token',t);
end; $$;

-- 토큰으로 내 프로필 (token 미노출)
create or replace function public.rk_me(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u public.users;
begin
  if p_token is null then return null; end if;
  select * into u from public.users where token = p_token;
  if not found then return null; end if;
  return jsonb_build_object('id',u.id,'username',u.username,'real_name',u.real_name,
    'score',u.score,'wins',u.wins,'losses',u.losses);
end; $$;

-- 랭킹 (안전 필드만)
create or replace function public.rk_leaderboard()
returns table(id uuid, username citext, real_name text, score int, wins int, losses int)
language sql security definer set search_path = public as $$
  select id, username, real_name, score, wins, losses
  from public.users order by score desc, wins desc, real_name asc limit 100;
$$;

-- 서버 시각 (클라 시계 오차 보정용)
create or replace function public.rk_now() returns timestamptz
language sql security definer set search_path = public as $$ select now(); $$;

-- 게임 종료 처리: 서버가 보드 state로 점수를 직접 산정/적용(점수 조작 차단).
-- state.players = {seat: user_id}, state.hands = {seat: [tileId..]}, state.passStreak, state.names.
create or replace function public.rk_finish_game(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb;
  v_seats text[]; v_n int; v_base int[];
  v_handpts jsonb := '{}'::jsonb; v_results jsonb := '{}'::jsonb;
  v_over boolean := false; v_passStreak int;
  v_sorted text[]; i int; j int; k int;
  v_sum int; v_delta int; v_rank int; v_gsize int;
  v_seat text; v_uid uuid; v_won boolean; v_hp int; v_newscore int; v_prev int;
  v_cnt int; v_distinct int; v_bad int; v_pool int;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;

  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if v_room.status <> 'playing' then            -- 이미 끝남 → 멱등 반환
    return coalesce(v_room.state->'results', '{}'::jsonb);
  end if;

  v_state := v_room.state;
  v_players := v_state->'players';
  if not exists (select 1 from jsonb_each_text(v_players) e where e.value = v_user::text) then
    raise exception 'NOT_A_PLAYER';
  end if;

  select array_agg(key) into v_seats from jsonb_object_keys(v_state->'hands') key;
  v_n := coalesce(array_length(v_seats,1),0);
  v_base := case v_n when 2 then array[60,-20] when 3 then array[80,20,-40]
                     when 4 then array[100,40,0,-60] else null end;
  if v_base is null then raise exception 'BAD_N'; end if;

  -- 덱 무결성: hands ∪ board ∪ pool 이 정확히 106장(중복·위조·삭제 없음)이어야 점수 인정.
  -- (정상 게임은 항상 통과 — 타일은 시스템을 떠나지 않음. 조작 state 만 거부.)
  with allids as (
    select e.val from jsonb_each(v_state->'hands') h
      cross join lateral jsonb_array_elements_text(h.value) as e(val)
    union all
    select e.val from jsonb_array_elements(v_state->'board') as setj
      cross join lateral jsonb_array_elements_text(setj.value) as e(val)
    union all
    select e.val from jsonb_array_elements_text(v_state->'pool') as e(val)
  )
  select count(*), count(distinct val),
         count(*) filter (where val !~ '^(black|red|blue|orange)_([1-9]|1[0-3])_[01]$' and val !~ '^joker_[01]$')
    into v_cnt, v_distinct, v_bad from allids;
  if v_cnt <> 106 or v_distinct <> 106 or v_bad > 0 then raise exception 'NOT_CONSERVED'; end if;
  v_pool := coalesce(jsonb_array_length(v_state->'pool'), 0);
  if v_pool > 106 - 14 * v_n then raise exception 'BAD_POOL'; end if;

  -- 좌석별 남은 점수 (joker=30, 그 외 숫자), 빈 손 = 종료
  for i in 1 .. v_n loop
    select coalesce(sum(case when t like 'joker%' then 30 else split_part(t,'_',2)::int end),0)
      into v_hp from jsonb_array_elements_text(v_state->'hands'->(v_seats[i])) t;
    v_handpts := jsonb_set(v_handpts, array[v_seats[i]], to_jsonb(v_hp));
    if v_hp = 0 then v_over := true; end if;
  end loop;
  v_passStreak := coalesce((v_state->>'passStreak')::int, 0);
  if v_passStreak >= v_n then v_over := true; end if;
  if not v_over then raise exception 'NOT_OVER'; end if;

  -- 남은 점수 오름차순 정렬(적을수록 상위), 동점은 seat로 안정화
  select array_agg(s order by (v_handpts->>s)::int, s::int) into v_sorted from unnest(v_seats) s;

  -- 슬롯 평균으로 동점 처리
  i := 1;
  while i <= v_n loop
    j := i;
    while j < v_n and (v_handpts->>v_sorted[j+1])::int = (v_handpts->>v_sorted[i])::int loop j := j + 1; end loop;
    v_gsize := j - i + 1;
    v_sum := 0; for k in i .. j loop v_sum := v_sum + v_base[k]; end loop;
    v_delta := round(v_sum::numeric / v_gsize);
    v_rank := i;                       -- 1-based 슬롯 시작 = 표준 경쟁 순위
    for k in i .. j loop
      v_seat := v_sorted[k];
      v_won  := (v_rank = 1);
      v_uid  := (v_players->>v_seat)::uuid;
      v_newscore := null; v_prev := null;
      if v_uid is not null then
        select score into v_prev from public.users where id = v_uid;
        update public.users
           set score  = greatest(0, score + v_delta),
               wins   = wins   + (case when v_won then 1 else 0 end),
               losses = losses + (case when v_won then 0 else 1 end)
         where id = v_uid
        returning score into v_newscore;
      end if;
      v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
        'rank', v_rank, 'delta', v_delta, 'won', v_won,
        'handPoints', (v_handpts->>v_seat)::int, 'prevScore', v_prev, 'newScore', v_newscore));
    end loop;
    i := j + 1;
  end loop;

  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}', '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  return v_results;
end; $$;

-- 필요한 RPC 에만 실행 권한 부여 (트리거 함수 등은 제외)
grant execute on function public.rk_signup(text,text,text)        to anon, authenticated;
grant execute on function public.rk_login(text,text)              to anon, authenticated;
grant execute on function public.rk_me(uuid)                      to anon, authenticated;
grant execute on function public.rk_leaderboard()                 to anon, authenticated;
grant execute on function public.rk_now()                         to anon, authenticated;
grant execute on function public.rk_finish_game(uuid,int)         to anon, authenticated;
