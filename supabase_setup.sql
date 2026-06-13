-- =====================================================================
-- 게임 허브 v3 — Supabase 설정 (대시보드 → SQL Editor 에 전체 붙여넣고 RUN)
-- 다시 실행해도 안전(idempotent). 3게임(루미큐브 / 운빨 대시 / 나도 사람이야)
-- 각 게임 독립 점수·티어·연승. 방 1~5=루미큐브, 6~10=미니게임(방장이 종류 선택).
-- 신규 천장 15000 티어 사다리. 유령멤버 자동정리(presence + heartbeat + reap).
-- =====================================================================
create extension if not exists pgcrypto;
create extension if not exists citext;

-- v1 잔재 제거
drop table if exists public.seats cascade;
drop table if exists public.room  cascade;

-- ============================ 계정 (RPC 전용) =========================
create table if not exists public.users (
  id         uuid primary key default gen_random_uuid(),
  username   citext unique not null,
  pass_hash  text not null,
  real_name  text not null,
  score      int  not null default 0 check (score >= 0),   -- (구) 루미큐브 단일컬럼 — 이관 후 동결(읽지 않음)
  wins       int  not null default 0,
  losses     int  not null default 0,
  streak     int  not null default 0,
  token      uuid,
  created_at timestamptz not null default now()
);
alter table public.users add column if not exists streak int not null default 0;
-- 꾸미기: 이름색·대표 티어로 보여줄 게임 (null = 숨김)
alter table public.users add column if not exists display_game text
  check (display_game is null or display_game in ('rummikub','race','hunt'));
alter table public.users enable row level security;   -- 정책 없음 = anon 직접 접근 차단

-- ===== 게임별 독립 전적 (RPC 전용) =====
create table if not exists public.user_game_stats (
  user_id uuid not null references public.users(id) on delete cascade,
  game    text not null check (game in ('rummikub','race','hunt')),
  score   int  not null default 0 check (score >= 0),
  wins    int  not null default 0,
  losses  int  not null default 0,
  streak  int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);
alter table public.user_game_stats enable row level security;   -- 정책 없음 = RPC(SECURITY DEFINER)로만
create index if not exists ugs_game_rank_idx on public.user_game_stats (game, score desc, wins desc);

-- ===== 데이터 이관: 기존 users 전적 → user_game_stats(rummikub). 멱등(중복 가산 없음) =====
insert into public.user_game_stats (user_id, game, score, wins, losses, streak)
  select id, 'rummikub', score, wins, losses, streak from public.users
  on conflict (user_id, game) do nothing;

-- ============================ 방 1~10 =================================
create table if not exists public.rooms (
  id              int primary key check (id between 1 and 10),
  host_id         uuid,
  status          text not null default 'waiting',   -- waiting | playing | finished
  state           jsonb,
  game            text check (game is null or game in ('rummikub','race','hunt')),  -- 6~10은 방장이 선택(null=미선택)
  turn_seconds    int  not null default 30,
  turn_started_at timestamptz,
  version         bigint not null default 0,
  updated_at      timestamptz not null default now()
);
-- 기존 설치 마이그레이션: id 체크 1~5 → 1~10, game 컬럼 추가
alter table public.rooms drop constraint if exists rooms_id_check;
alter table public.rooms add constraint rooms_id_check check (id between 1 and 10);
alter table public.rooms add column if not exists game text
  check (game is null or game in ('rummikub','race','hunt'));
insert into public.rooms (id, game) select g, 'rummikub' from generate_series(1,5)  g on conflict (id) do nothing;
insert into public.rooms (id, game) select g, null       from generate_series(6,10) g on conflict (id) do nothing;
update public.rooms set game='rummikub' where id between 1 and 5 and game is distinct from 'rummikub';

-- ===== 방 멤버 (좌석 1~8, 표시 스냅샷, 꾸미기 미러) =====
create table if not exists public.room_members (
  room_id   int  not null references public.rooms(id),
  user_id   uuid not null,
  seat      int,                                -- null = 미착석/관전 (1~8)
  role      text not null default 'player',     -- player | spectator
  name      text not null,
  score     int  not null default 0,            -- 현재 게임 표시 스냅샷
  wins      int  not null default 0,
  losses    int  not null default 0,
  streak    int  not null default 0,
  display_game  text,                            -- 꾸미기 미러(이름색용)
  display_score int  not null default 0,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.room_members add column if not exists streak int not null default 0;
alter table public.room_members add column if not exists display_game  text;
alter table public.room_members add column if not exists display_score int not null default 0;
create unique index if not exists room_members_seat_uniq
  on public.room_members(room_id, seat) where seat is not null;

-- ===== 접속 하트비트 (realtime 미발행 — 유령정리 전용, 렉 유발 안 함) =====
create table if not exists public.room_presence (
  room_id   int  not null,
  user_id   uuid not null,
  last_seen timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.room_presence enable row level security;

-- ===== RLS 정책 (permissive: rooms/members/presence. user_game_stats 는 정책 없음) =====
alter table public.rooms         enable row level security;
alter table public.room_members  enable row level security;
drop policy if exists rooms_all    on public.rooms;
drop policy if exists members_all  on public.room_members;
drop policy if exists presence_all on public.room_presence;
create policy rooms_all    on public.rooms        for all using (true) with check (true);
create policy members_all  on public.room_members for all using (true) with check (true);
create policy presence_all on public.room_presence for all using (true) with check (true);
alter table public.room_members replica identity full;

-- ===== 트리거 =====
-- updated_at + 턴/페이즈 전환 시 서버시각 스탬프(시계오차 보정)
create or replace function public.rooms_touch() returns trigger as $$
begin
  new.updated_at = now();
  if (new.state is not null) and (
       old.state is null
       or (old.state->>'turn')  is distinct from (new.state->>'turn')
       or (old.state->>'phase') is distinct from (new.state->>'phase')
       or (old.status is distinct from new.status and new.status = 'playing')
     ) then
    new.turn_started_at = now();
  end if;
  return new;
end; $$ language plpgsql;
drop trigger if exists trg_rooms_touch on public.rooms;
create trigger trg_rooms_touch before update on public.rooms
  for each row execute function public.rooms_touch();

-- 방1~5는 rummikub 고정, 게임 중에는 종류 변경 금지(클라 우회 차단)
create or replace function public.rooms_game_guard() returns trigger as $$
begin
  if new.id between 1 and 5 then new.game := 'rummikub'; end if;
  if tg_op='UPDATE' and old.game is distinct from new.game and old.status <> 'waiting' then
    new.game := old.game;
  end if;
  return new;
end; $$ language plpgsql;
drop trigger if exists trg_rooms_game_guard on public.rooms;
create trigger trg_rooms_game_guard before insert or update on public.rooms
  for each row execute function public.rooms_game_guard();

-- realtime 발행 (rooms, room_members 만 — room_presence/user_game_stats 는 미발행)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rooms') then
    alter publication supabase_realtime add table public.rooms; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_members') then
    alter publication supabase_realtime add table public.room_members; end if;
end $$;

-- =====================================================================
-- RPC (SECURITY DEFINER: RLS 우회)
-- (참고) 클라 mapErr 는 raise exception 의 토큰 문자열로 사용자 메시지를 매핑한다.
-- =====================================================================

-- ===== 계정 =====
create or replace function public.rk_signup(p_username text, p_password text, p_real_name text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
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
  return public.rk_me(t);
end; $$;

create or replace function public.rk_login(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.users; t uuid;
begin
  select * into u from public.users where username = btrim(p_username);
  if not found or u.pass_hash <> crypt(p_password, u.pass_hash) then
    perform pg_sleep(0.15);
    raise exception 'BAD_CREDENTIALS';
  end if;
  t := gen_random_uuid();
  update public.users set token = t where id = u.id;
  return public.rk_me(t);
end; $$;

-- 토큰 → 내 프로필 + 게임별 stats + 꾸미기(표시 게임/점수). token 미노출.
create or replace function public.rk_me(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.users; g jsonb; disp jsonb; ds int;
begin
  if p_token is null then return null; end if;
  select * into u from public.users where token = p_token;
  if not found then return null; end if;
  select coalesce(jsonb_object_agg(game, jsonb_build_object('score',score,'wins',wins,'losses',losses,'streak',streak)), '{}'::jsonb)
    into g from public.user_game_stats where user_id = u.id;
  g := jsonb_build_object(
    'rummikub', coalesce(g->'rummikub', jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'race',     coalesce(g->'race',     jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'hunt',     coalesce(g->'hunt',     jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)));
  if u.display_game is null then
    disp := jsonb_build_object('game', null, 'score', 0);
  else
    ds := coalesce((g->u.display_game->>'score')::int, 0);
    disp := jsonb_build_object('game', u.display_game, 'score', ds);
  end if;
  -- token 은 신규 로그인/가입 시에만 클라가 이미 가지고 있으므로 여기선 미반환(보안). 단 가입/로그인 래퍼는 아래에서 token 합성.
  return jsonb_build_object('id',u.id,'username',u.username,'real_name',u.real_name,
                            'display_game',u.display_game,'games',g,'display',disp,'token',u.token);
end; $$;

-- 게임별 랭킹 (안전 필드만)
drop function if exists public.rk_leaderboard();
drop function if exists public.rk_leaderboard(text);
create or replace function public.rk_leaderboard(p_game text default 'rummikub')
returns table(id uuid, username citext, real_name text, score int, wins int, losses int, streak int)
language sql security definer set search_path = public, extensions as $$
  select u.id, u.username, u.real_name, s.score, s.wins, s.losses, s.streak
  from public.user_game_stats s join public.users u on u.id = s.user_id
  where s.game = case when p_game in ('rummikub','race','hunt') then p_game else 'rummikub' end
  order by s.score desc, s.wins desc, u.real_name asc limit 100;
$$;

-- 꾸미기 저장 (표시 게임 택1/숨김). 반환: 표시 게임/점수(이름색 즉시 갱신용)
create or replace function public.rk_set_display(p_token uuid, p_game text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_score int;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  if p_game is not null and p_game not in ('rummikub','race','hunt') then raise exception 'BAD_GAME'; end if;
  update public.users set display_game = p_game where id = v_user;
  if p_game is null then return jsonb_build_object('game', null, 'score', 0); end if;
  select coalesce(score,0) into v_score from public.user_game_stats where user_id = v_user and game = p_game;
  return jsonb_build_object('game', p_game, 'score', coalesce(v_score,0));
end; $$;

create or replace function public.rk_now() returns timestamptz
language sql security definer set search_path = public, extensions as $$ select now(); $$;

-- ===== 점수 헬퍼 =====
-- 점수 → 티어 레벨 (0=나무 ... 28=다이아I, 29 마스터, 30 그마, 31 챌린저). 신규 천장 15000.
create or replace function public.rk_tier_level(p_score int)
returns int language sql immutable set search_path = public as $$
  select greatest(0, (select count(*) from unnest(array[
    0, 200,400,600,800, 1000,1300,1600,1900, 2200,2600,3000,3400,
    3800,4200,4600,5000, 5400,5800,6200,6600, 7000,7500,8000,8500,
    9000,9500,10000,10500, 12000,13500,15000]) m
    where coalesce(p_score,0) >= m) - 1);
$$;

-- 연승 처리: 루미큐브(인원수 n별)
create or replace function public.rk_streak_treatment(p_n int, p_rank int, p_tied boolean)
returns text language sql immutable set search_path = public as $$
  select case
    when p_rank = 1 then 'apply'
    when p_tied   then 'maintain'
    when p_n = 2 then (case p_rank when 2 then 'break' end)
    when p_n = 3 then (case p_rank when 2 then 'maintain' when 3 then 'break' end)
    when p_n = 4 then (case p_rank when 2 then 'apply' when 3 then 'maintain' when 4 then 'break' end)
  end;
$$;

-- 연승 처리: 레이스(상위 1/3 apply · 중 1/3 maintain · 하위 break)
create or replace function public.rk_streak_treatment_race(p_n int, p_rank int, p_tied boolean)
returns text language sql immutable set search_path = public as $$
  select case
    when p_rank = 1 then 'apply'
    when p_tied   then 'maintain'
    when (p_rank-1)::numeric / greatest(1, p_n-1) <= 1.0/3 then 'apply'
    when (p_rank-1)::numeric / greatest(1, p_n-1) <= 2.0/3 then 'maintain'
    else 'break' end;
$$;

-- 공용 델타 계산 (게임별 마진×티어×연승). 클라 tiers.js applyScore 와 동일 식.
create or replace function public.rk_apply_score(
  p_game text, p_perf numeric, p_score int, p_prev_streak int, p_is_win boolean, p_treatment text)
returns table(delta int, bonus int, new_streak int, new_score int, lvl int)
language plpgsql immutable set search_path = public as $$
declare L int; gm numeric; lm numeric; tx numeric; mw int; br numeric; adj numeric; d int; b int; ns int;
begin
  L := public.rk_tier_level(coalesce(p_score,0));
  if p_game = 'rummikub' then
    gm := greatest(0.42, 1 - L*0.011); lm := least(2.10, 1 + L*0.020); tx := L*0.85;
    mw := greatest(8, round(28 - L*0.45)::int); br := 0.10;
  elsif p_game = 'race' then
    gm := greatest(0.45, 1 - L*0.011); lm := least(2.05, 1 + L*0.019); tx := L*0.32;
    mw := greatest(4, round(12 - L*0.18)::int); br := 0.08;
  else  -- hunt
    gm := greatest(0.45, 1 - L*0.011); lm := least(2.05, 1 + L*0.019); tx := L*0.30;
    mw := greatest(4, round(11 - L*0.16)::int); br := 0.08;
  end if;
  adj := p_perf - tx;
  if adj >= 0 then d := round(adj * gm)::int; else d := round(adj * lm)::int; end if;
  if p_is_win then d := greatest(d, mw); end if;
  ns := case p_treatment when 'apply' then coalesce(p_prev_streak,0)+1
                         when 'maintain' then coalesce(p_prev_streak,0)
                         else 0 end;
  b := 0;
  if p_treatment = 'apply' and L <= 28 and ns >= 2 and d > 0 then
    b := round(d * ns * br)::int; d := d + b;
  end if;
  delta := d; bonus := b; new_streak := ns; new_score := greatest(0, coalesce(p_score,0) + d); lvl := L;
  return next;
end; $$;

-- 게임별 stats upsert (점수/연승/승패)
create or replace function public.rk_bump_stats(p_uid uuid, p_game text, p_new_score int, p_new_streak int, p_won boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_uid is null then return; end if;
  insert into public.user_game_stats(user_id, game, score, streak, wins, losses)
  values (p_uid, p_game, p_new_score, p_new_streak, (case when p_won then 1 else 0 end), (case when p_won then 0 else 1 end))
  on conflict (user_id, game) do update
    set score = excluded.score, streak = excluded.streak,
        wins   = public.user_game_stats.wins   + (case when p_won then 1 else 0 end),
        losses = public.user_game_stats.losses + (case when p_won then 0 else 1 end),
        updated_at = now();
end; $$;

-- =====================================================================
-- 정산 RPC (서버 권위)
-- =====================================================================

-- ===== 루미큐브 (보드 무결성 106장 검증 + 마진×티어×연승, 재스케일) =====
create or replace function public.rk_finish_game(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb;
  v_seats text[]; v_n int; v_handpts jsonb := '{}'::jsonb; v_results jsonb := '{}'::jsonb;
  v_over boolean := false; v_passStreak int; v_sorted text[]; i int; j int; k int;
  v_rank int; v_avg numeric; v_tied boolean; v_seat text; v_uid uuid; v_won boolean; v_hp int;
  v_cnt int; v_distinct int; v_bad int; v_pool int; v_curscore int; v_curstreak int;
  v_perf numeric; v_tr text; r record;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if v_room.status <> 'playing' then return coalesce(v_room.state->'results', '{}'::jsonb); end if;
  v_state := v_room.state; v_players := v_state->'players';
  if not exists (select 1 from jsonb_each_text(v_players) e where e.value = v_user::text) then raise exception 'NOT_A_PLAYER'; end if;
  select array_agg(key) into v_seats from jsonb_object_keys(v_state->'hands') key;
  v_n := coalesce(array_length(v_seats,1),0);
  if v_n not between 2 and 4 then raise exception 'BAD_N'; end if;

  with allids as (
    select e.val from jsonb_each(v_state->'hands') h cross join lateral jsonb_array_elements_text(h.value) as e(val)
    union all
    select e.val from jsonb_array_elements(v_state->'board') as setj cross join lateral jsonb_array_elements_text(setj.value) as e(val)
    union all
    select e.val from jsonb_array_elements_text(v_state->'pool') as e(val))
  select count(*), count(distinct val),
         count(*) filter (where val !~ '^(black|red|blue|orange)_([1-9]|1[0-3])_[01]$' and val !~ '^joker_[01]$')
    into v_cnt, v_distinct, v_bad from allids;
  if v_cnt <> 106 or v_distinct <> 106 or v_bad > 0 then raise exception 'NOT_CONSERVED'; end if;
  v_pool := coalesce(jsonb_array_length(v_state->'pool'), 0);
  if v_pool > 106 - 14 * v_n then raise exception 'BAD_POOL'; end if;

  for i in 1 .. v_n loop
    select coalesce(sum(case when t like 'joker%' then 30 else split_part(t,'_',2)::int end),0)
      into v_hp from jsonb_array_elements_text(v_state->'hands'->(v_seats[i])) t;
    v_handpts := jsonb_set(v_handpts, array[v_seats[i]], to_jsonb(v_hp));
    if v_hp = 0 then v_over := true; end if;
  end loop;
  v_passStreak := coalesce((v_state->>'passStreak')::int, 0);
  if v_passStreak >= v_n then v_over := true; end if;
  if not v_over then raise exception 'NOT_OVER'; end if;

  select avg((v_handpts->>s)::int) into v_avg from unnest(v_seats) s;
  select array_agg(s order by (v_handpts->>s)::int, s::int) into v_sorted from unnest(v_seats) s;
  i := 1;
  while i <= v_n loop
    j := i;
    while j < v_n and (v_handpts->>v_sorted[j+1])::int = (v_handpts->>v_sorted[i])::int loop j := j + 1; end loop;
    v_rank := i; v_tied := (j > i);
    for k in i .. j loop
      v_seat := v_sorted[k]; v_uid := (v_players->>v_seat)::uuid;
      v_curscore := 0; v_curstreak := 0;
      if v_uid is not null then
        select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak
          from public.user_game_stats where user_id = v_uid and game = 'rummikub';
        v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
      end if;
      v_perf := v_avg - (v_handpts->>v_seat)::int;
      v_won := (v_rank = 1);
      v_tr := public.rk_streak_treatment(v_n, v_rank, v_tied);
      select * into r from public.rk_apply_score('rummikub', v_perf, v_curscore, v_curstreak, v_won, v_tr);
      perform public.rk_bump_stats(v_uid, 'rummikub', r.new_score, r.new_streak, v_won);
      v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
        'rank',v_rank,'delta',r.delta,'bonus',r.bonus,'won',v_won,'handPoints',(v_handpts->>v_seat)::int,
        'prevScore',v_curscore,'newScore',r.new_score,'streak',r.new_streak,'treatment',v_tr));
    end loop;
    i := j + 1;
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  return v_results;
end; $$;

-- ===== 운빨 대시 race (도착순위 기반. 클라 보고 ranks + 새너티 + CAP 클램프) =====
create or replace function public.rk_finish_race(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_ranks jsonb;
  v_seats text[]; v_n int; v_results jsonb := '{}'::jsonb;
  i int; v_seat text; v_uid uuid; v_rank int; v_avgrank numeric; v_tied boolean; v_cnt int;
  v_curscore int; v_curstreak int; v_perf numeric; v_won boolean; v_tr text; v_delta int; v_ns int; r record;
  CAP constant int := 80;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if coalesce(v_room.game,'') <> 'race' then raise exception 'WRONG_GAME'; end if;
  if v_room.status <> 'playing' then return coalesce(v_room.state->'results', '{}'::jsonb); end if;
  v_state := v_room.state; v_players := v_state->'players'; v_ranks := v_state->'ranks';
  if not exists (select 1 from jsonb_each_text(v_players) e where e.value = v_user::text) then raise exception 'NOT_A_PLAYER'; end if;
  if v_ranks is null then raise exception 'NO_RANKS'; end if;
  select array_agg(key) into v_seats from jsonb_object_keys(v_players) key;
  v_n := coalesce(array_length(v_seats,1),0);
  if v_n not between 2 and 8 then raise exception 'BAD_N'; end if;
  perform 1 from unnest(v_seats) s where (v_ranks->>s) is null;
  if found then raise exception 'BAD_RANKS'; end if;

  v_avgrank := (v_n + 1) / 2.0;
  for i in 1 .. v_n loop
    v_seat := v_seats[i];
    v_rank := (v_ranks->>v_seat)::int;
    if v_rank < 1 or v_rank > v_n then raise exception 'BAD_RANK_VAL'; end if;
    select count(*) into v_cnt from unnest(v_seats) s where (v_ranks->>s)::int = v_rank;
    v_tied := v_cnt > 1;
    v_uid := (v_players->>v_seat)::uuid;
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak
        from public.user_game_stats where user_id = v_uid and game = 'race';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    v_perf := (v_avgrank - v_rank) * 6;
    v_won  := (v_rank = 1);
    v_tr   := public.rk_streak_treatment_race(v_n, v_rank, v_tied);
    select * into r from public.rk_apply_score('race', v_perf, v_curscore, v_curstreak, v_won, v_tr);
    v_delta := greatest(-CAP, least(CAP, r.delta));
    v_ns := greatest(0, v_curscore + v_delta);
    perform public.rk_bump_stats(v_uid, 'race', v_ns, r.new_streak, v_won);
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'rank',v_rank,'delta',v_delta,'bonus',r.bonus,'won',v_won,
      'prevScore',v_curscore,'newScore',v_ns,'streak',r.new_streak,'treatment',v_tr));
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  return v_results;
end; $$;

-- ===== 나도 사람이야 hunt (비대칭: 술래 vs 숨은측. 역할/생존/색출 파생 + CAP) =====
create or replace function public.rk_finish_hunt(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_roles jsonb; v_alive jsonb; v_caught jsonb;
  v_seats text[]; v_n int; v_h int; v_found int; v_results jsonb := '{}'::jsonb;
  i int; v_seat text; v_uid uuid; v_role text; v_alivev boolean; v_caughtv boolean;
  v_curscore int; v_curstreak int; v_perf numeric; v_won boolean; v_tr text; v_delta int; v_ns int; r record;
  CAP constant int := 80;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if coalesce(v_room.game,'') <> 'hunt' then raise exception 'WRONG_GAME'; end if;
  if v_room.status <> 'playing' then return coalesce(v_room.state->'results', '{}'::jsonb); end if;
  v_state := v_room.state; v_players := v_state->'players';
  v_roles := v_state->'roles'; v_alive := coalesce(v_state->'alive','{}'::jsonb); v_caught := coalesce(v_state->'caughtMid','{}'::jsonb);
  if not exists (select 1 from jsonb_each_text(v_players) e where e.value = v_user::text) then raise exception 'NOT_A_PLAYER'; end if;
  select array_agg(key) into v_seats from jsonb_object_keys(v_players) key;
  v_n := coalesce(array_length(v_seats,1),0);
  if v_n not between 2 and 8 then raise exception 'BAD_N'; end if;

  v_h := 0; v_found := 0;
  for i in 1 .. v_n loop
    if coalesce(v_roles->>v_seats[i],'hider') = 'hider' then
      v_h := v_h + 1;
      if not coalesce((v_alive->>v_seats[i])::boolean, true) then v_found := v_found + 1; end if;
    end if;
  end loop;
  if v_h < 1 then raise exception 'NO_HIDERS'; end if;

  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_role := coalesce(v_roles->>v_seat,'hider'); v_uid := (v_players->>v_seat)::uuid;
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak
        from public.user_game_stats where user_id = v_uid and game = 'hunt';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    if v_role = 'seeker' then
      v_perf := (v_found - v_h/2.0) * 7;
      v_won  := (v_found >= v_h);
      v_tr   := case when v_found >= ceil(v_h/2.0) then 'apply' when v_found >= 1 then 'maintain' else 'break' end;
    else
      v_alivev  := coalesce((v_alive->>v_seat)::boolean, true);
      v_caughtv := coalesce((v_caught->>v_seat)::boolean, false);
      v_perf := case when v_alivev then 7 else -7 end;
      v_won  := v_alivev;
      v_tr   := case when v_alivev then 'apply' when v_caughtv then 'maintain' else 'break' end;
    end if;
    select * into r from public.rk_apply_score('hunt', v_perf, v_curscore, v_curstreak, v_won, v_tr);
    v_delta := greatest(-CAP, least(CAP, r.delta));
    v_ns := greatest(0, v_curscore + v_delta);
    perform public.rk_bump_stats(v_uid, 'hunt', v_ns, r.new_streak, v_won);
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'role',v_role,'won',v_won,
      'found', (case when v_role='seeker' then v_found else null end),
      'survived', (case when v_role='hider' then coalesce((v_alive->>v_seat)::boolean,true) else null end),
      'delta',v_delta,'bonus',r.bonus,'prevScore',v_curscore,'newScore',v_ns,'streak',r.new_streak,'treatment',v_tr));
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  return v_results;
end; $$;

-- =====================================================================
-- 좌석 / 유령정리 / 하트비트
-- =====================================================================

-- 원자적 착석 (유령좌석·동시경합 차단). 반환 {ok, seat|reason}
create or replace function public.rk_take_seat(p_token uuid, p_room int, p_seat int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_status text;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  if p_seat < 1 or p_seat > 8 then raise exception 'BAD_SEAT'; end if;
  select status into v_status from public.rooms where id = p_room;
  if v_status is null then raise exception 'NO_ROOM'; end if;
  if v_status <> 'waiting' then return jsonb_build_object('ok',false,'reason','not_waiting'); end if;
  if exists (select 1 from public.room_members where room_id=p_room and seat=p_seat and user_id<>v_user) then
    return jsonb_build_object('ok',false,'reason','taken');
  end if;
  begin
    update public.room_members set seat = p_seat, role = 'player' where room_id = p_room and user_id = v_user;
    if not found then return jsonb_build_object('ok',false,'reason','not_member'); end if;
  exception when unique_violation then return jsonb_build_object('ok',false,'reason','taken');
  end;
  return jsonb_build_object('ok',true,'seat',p_seat);
end; $$;

-- 접속 하트비트 (room_presence 갱신 — realtime 미발행이라 렉 無)
create or replace function public.rk_heartbeat(p_token uuid, p_room int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then return; end if;
  insert into public.room_presence(room_id, user_id, last_seen) values (p_room, v_user, now())
  on conflict (room_id, user_id) do update set last_seen = now();
end; $$;

-- 유령멤버 TTL 정리 (누구나 호출 가능 — 셀프힐). 반환 삭제 건수.
create or replace function public.rk_reap_stale(p_room int, p_ttl_seconds int default 25)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_deleted int; v_left int; v_earliest uuid; v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room;
  if not found then return 0; end if;
  delete from public.room_members m
   where m.room_id = p_room
     and m.joined_at < now() - make_interval(secs => p_ttl_seconds)
     and not exists (select 1 from public.room_presence p
                     where p.room_id=p_room and p.user_id=m.user_id and p.last_seen >= now() - make_interval(secs => p_ttl_seconds))
     and (v_room.status = 'waiting' or m.seat is null);
  get diagnostics v_deleted = row_count;
  delete from public.room_presence p
   where p.room_id = p_room
     and not exists (select 1 from public.room_members m where m.room_id=p_room and m.user_id=p.user_id);
  select count(*) into v_left from public.room_members where room_id = p_room;
  if v_left = 0 then
    update public.rooms set host_id=null, status='waiting', state=null, version=0, game = (case when p_room between 1 and 5 then 'rummikub' else null end)
     where id = p_room;
  else
    if v_room.host_id is null or not exists (select 1 from public.room_members where room_id=p_room and user_id=v_room.host_id) then
      select user_id into v_earliest from public.room_members where room_id=p_room order by joined_at asc limit 1;
      update public.rooms set host_id = v_earliest where id = p_room;
    end if;
  end if;
  return v_deleted;
end; $$;

-- =====================================================================
-- 실행 권한
-- =====================================================================
grant execute on function public.rk_signup(text,text,text)        to anon, authenticated;
grant execute on function public.rk_login(text,text)              to anon, authenticated;
grant execute on function public.rk_me(uuid)                      to anon, authenticated;
grant execute on function public.rk_leaderboard(text)             to anon, authenticated;
grant execute on function public.rk_set_display(uuid,text)        to anon, authenticated;
grant execute on function public.rk_now()                         to anon, authenticated;
grant execute on function public.rk_finish_game(uuid,int)         to anon, authenticated;
grant execute on function public.rk_finish_race(uuid,int)         to anon, authenticated;
grant execute on function public.rk_finish_hunt(uuid,int)         to anon, authenticated;
grant execute on function public.rk_take_seat(uuid,int,int)       to anon, authenticated;
grant execute on function public.rk_heartbeat(uuid,int)           to anon, authenticated;
grant execute on function public.rk_reap_stale(int,int)           to anon, authenticated;
