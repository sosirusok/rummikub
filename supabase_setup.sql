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
alter table public.users add column if not exists display_game text;
alter table public.users drop constraint if exists users_display_game_check;
alter table public.users drop constraint if exists users_display_game_chk;
alter table public.users add constraint users_display_game_chk
  check (display_game is null or display_game in ('rummikub','davinci','splendor','uno','race','hunt','mafia'));
alter table public.users enable row level security;   -- 정책 없음 = anon 직접 접근 차단

-- ===== 게임별 독립 전적 (RPC 전용) =====
create table if not exists public.user_game_stats (
  user_id uuid not null references public.users(id) on delete cascade,
  game    text not null check (game in ('rummikub','davinci','race','hunt')),
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
-- 기존 설치 마이그레이션: id 1~10, game 컬럼을 nullable 로 정리
-- (구 wordbomb 잔재로 game 이 NOT NULL/기본값/구 도메인체크를 가질 수 있음 → 전부 제거)
alter table public.rooms drop constraint if exists rooms_id_check;
alter table public.rooms add constraint rooms_id_check check (id between 1 and 10);
alter table public.rooms add column if not exists game text;
alter table public.rooms alter column game drop default;        -- 구 default 'rummikub' 제거(없으면 무시)
alter table public.rooms alter column game drop not null;        -- 6~10 은 null(미설정) 허용
update public.rooms set game=null where game is not null and game not in ('rummikub','davinci','race','hunt');
alter table public.rooms drop constraint if exists rooms_game_check;
alter table public.rooms drop constraint if exists rooms_game_chk;
alter table public.rooms add constraint rooms_game_chk check (game is null or game in ('rummikub','davinci','race','hunt'));
insert into public.rooms (id, game) select g, null from generate_series(1,10) g on conflict (id) do nothing;
update public.rooms set game=null where id between 1 and 5 and status='waiting';  -- 보드 로비에서 방장이 루미/다빈치 선택

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

-- 방1~5=보드게임(rummikub/davinci), 6~10=미니게임(race/hunt). 게임 중 종류 변경 금지.
create or replace function public.rooms_game_guard() returns trigger as $$
begin
  if new.game is not null then
    if new.id between 1 and 5  and new.game not in ('rummikub','davinci') then new.game := null; end if;
    if new.id between 6 and 10 and new.game not in ('race','hunt')      then new.game := null; end if;
  end if;
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
    'davinci',  coalesce(g->'davinci',  jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
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
  where s.game = case when p_game in ('rummikub','davinci','race','hunt') then p_game else 'rummikub' end
  order by s.score desc, s.wins desc, u.real_name asc limit 100;
$$;

-- 꾸미기 저장 (표시 게임 택1/숨김). 반환: 표시 게임/점수(이름색 즉시 갱신용)
create or replace function public.rk_set_display(p_token uuid, p_game text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_score int;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  if p_game is not null and p_game not in ('rummikub','davinci','race','hunt') then raise exception 'BAD_GAME'; end if;
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
-- ⚠ 이 정의는 파일 끝 v3.2 블록의 rk_apply_score 로 override 됨(gband 저티어가산 + mafia 분기 포함). 이 섹션만 단독 RUN 금지.
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
  elsif p_game = 'davinci' then
    gm := greatest(0.42, 1 - L*0.011); lm := least(2.08, 1 + L*0.020); tx := L*0.60;
    mw := greatest(6, round(20 - L*0.34)::int); br := 0.10;
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
  v_perf numeric; v_tr text; r record; v_w int; v_l int; v_delta int; v_ns int;
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
      v_delta := greatest(-300, least(300, r.delta));      -- 루미 상한(대폭 상향)
      v_ns := greatest(0, v_curscore + v_delta);
      perform public.rk_bump_stats(v_uid, 'rummikub', v_ns, r.new_streak, v_won);
      v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='rummikub'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
      v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
        'rank',v_rank,'delta',v_delta,'bonus',r.bonus,'won',v_won,'handPoints',(v_handpts->>v_seat)::int,
        'prevScore',v_curscore,'newScore',v_ns,'streak',r.new_streak,'treatment',v_tr,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
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
  v_curscore int; v_curstreak int; v_perf numeric; v_won boolean; v_tr text; v_delta int; v_ns int; r record; v_w int; v_l int;
  CAP constant int := 200;
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
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='race'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'rank',v_rank,'delta',v_delta,'bonus',r.bonus,'won',v_won,
      'prevScore',v_curscore,'newScore',v_ns,'streak',r.new_streak,'treatment',v_tr,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  return v_results;
end; $$;

-- ===== 다빈치 코드 davinci (탈락순위 기반. 클라 보고 ranks + 새너티 + CAP) =====
create or replace function public.rk_finish_davinci(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_ranks jsonb;
  v_seats text[]; v_n int; v_results jsonb := '{}'::jsonb;
  i int; v_seat text; v_uid uuid; v_rank int; v_avgrank numeric; v_tied boolean; v_cnt int;
  v_curscore int; v_curstreak int; v_perf numeric; v_won boolean; v_tr text; v_delta int; v_ns int; r record; v_w int; v_l int;
  CAP constant int := 250;
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
  if v_n not between 2 and 8 then raise exception 'BAD_N'; end if;
  perform 1 from unnest(v_seats) s where (v_ranks->>s) is null;
  if found then raise exception 'BAD_RANKS'; end if;
  v_avgrank := (v_n + 1) / 2.0;
  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_rank := (v_ranks->>v_seat)::int;
    if v_rank < 1 or v_rank > v_n then raise exception 'BAD_RANK_VAL'; end if;
    select count(*) into v_cnt from unnest(v_seats) s where (v_ranks->>s)::int = v_rank;
    v_tied := v_cnt > 1;
    v_uid := (v_players->>v_seat)::uuid;
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak from public.user_game_stats where user_id=v_uid and game='davinci';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    v_perf := (v_avgrank - v_rank) * 9;
    v_won  := (v_rank = 1);
    v_tr   := public.rk_streak_treatment_race(v_n, v_rank, v_tied);
    select * into r from public.rk_apply_score('davinci', v_perf, v_curscore, v_curstreak, v_won, v_tr);
    v_delta := greatest(-CAP, least(CAP, r.delta));
    v_ns := greatest(0, v_curscore + v_delta);
    perform public.rk_bump_stats(v_uid, 'davinci', v_ns, r.new_streak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='davinci'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'rank',v_rank,'delta',v_delta,'bonus',r.bonus,'won',v_won,
      'prevScore',v_curscore,'newScore',v_ns,'streak',r.new_streak,'treatment',v_tr,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
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
  v_seats text[]; v_n int; v_h int; v_found int; v_results jsonb := '{}'::jsonb; v_present uuid[]; v_quit boolean;
  i int; v_seat text; v_uid uuid; v_role text; v_alivev boolean; v_caughtv boolean;
  v_curscore int; v_curstreak int; v_perf numeric; v_won boolean; v_tr text; v_delta int; v_ns int; r record; v_w int; v_l int;
  CAP constant int := 200;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if coalesce(v_room.game,'') <> 'hunt' then raise exception 'WRONG_GAME'; end if;
  if v_room.status <> 'playing' then return coalesce(v_room.state->'results', '{}'::jsonb); end if;
  v_state := v_room.state; v_players := v_state->'players';
  v_roles := v_state->'roles'; v_alive := coalesce(v_state->'alive','{}'::jsonb); v_caught := coalesce(v_state->'caughtMid','{}'::jsonb);
  select array_agg(user_id) into v_present from public.room_members where room_id = p_room;   -- 중퇴 판별
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
    v_quit := (v_uid is not null and not (v_uid = any(coalesce(v_present, array[]::uuid[]))));
    if v_quit then v_perf := -28; v_won := false; v_tr := 'break'; end if;   -- 중퇴=패배+차감
    select * into r from public.rk_apply_score('hunt', v_perf, v_curscore, v_curstreak, v_won, v_tr);
    v_delta := greatest(-CAP, least(CAP, r.delta));
    v_ns := greatest(0, v_curscore + v_delta);
    perform public.rk_bump_stats(v_uid, 'hunt', v_ns, r.new_streak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='hunt'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'role',v_role,'won',v_won,'quit',coalesce(v_quit,false),
      'found', (case when v_role='seeker' then v_found else null end),
      'survived', (case when v_role='hider' then coalesce((v_alive->>v_seat)::boolean,true) else null end),
      'delta',v_delta,'bonus',r.bonus,'prevScore',v_curscore,'newScore',v_ns,'streak',r.new_streak,'treatment',v_tr,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
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
    update public.rooms set host_id=null, status='waiting', state=null, version=0, game=null where id = p_room;
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
grant execute on function public.rk_finish_davinci(uuid,int)      to anon, authenticated;
grant execute on function public.rk_finish_hunt(uuid,int)         to anon, authenticated;
grant execute on function public.rk_take_seat(uuid,int,int)       to anon, authenticated;
grant execute on function public.rk_heartbeat(uuid,int)           to anon, authenticated;
grant execute on function public.rk_reap_stale(int,int)           to anon, authenticated;

-- =====================================================================
-- v3.2 — 마피아 추가 + 라이프사이클/캡/강퇴/개발자초기화 (아래 정의가 위를 override)
-- 멱등. 전체 파일을 다시 RUN 해도 안전.
-- =====================================================================

-- ---- 게임 도메인에 'mafia' 추가 ----
alter table public.rooms drop constraint if exists rooms_game_chk;
alter table public.rooms add  constraint rooms_game_chk
  check (game is null or game in ('rummikub','davinci','race','hunt','mafia'));
alter table public.users drop constraint if exists users_display_game_chk;
alter table public.users drop constraint if exists users_display_game_check;
alter table public.users add  constraint users_display_game_chk
  check (display_game is null or display_game in ('rummikub','davinci','splendor','uno','race','hunt','mafia'));
alter table public.user_game_stats drop constraint if exists user_game_stats_game_check;
alter table public.user_game_stats add  constraint user_game_stats_game_check
  check (game in ('rummikub','davinci','splendor','uno','race','hunt','mafia'));

-- ---- rk_leaderboard: 'mafia' 포함 (없으면 마피아 요청이 rummikub 로 폴백돼 티어가 "공유"처럼 보임) ----
create or replace function public.rk_leaderboard(p_game text default 'rummikub')
returns table(id uuid, username citext, real_name text, score int, wins int, losses int, streak int)
language sql security definer set search_path = public, extensions as $$
  select u.id, u.username, u.real_name, s.score, s.wins, s.losses, s.streak
  from public.user_game_stats s join public.users u on u.id = s.user_id
  where s.game = case when p_game in ('rummikub','davinci','race','hunt','mafia') then p_game else 'rummikub' end
  order by s.score desc, s.wins desc, u.real_name asc limit 100;
$$;

-- ---- rk_set_display: 'mafia' 꾸미기 표시 허용 ----
create or replace function public.rk_set_display(p_token uuid, p_game text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_score int;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  if p_game is not null and p_game not in ('rummikub','davinci','race','hunt','mafia') then raise exception 'BAD_GAME'; end if;
  update public.users set display_game = p_game where id = v_user;
  if p_game is null then return jsonb_build_object('game', null, 'score', 0); end if;
  select coalesce(score,0) into v_score from public.user_game_stats where user_id = v_user and game = p_game;
  return jsonb_build_object('game', p_game, 'score', coalesce(v_score,0));
end; $$;

-- ---- 비밀 역할 저장소 (realtime 미발행 — RPC 로만 접근, 누구도 남의 역할을 못 봄) ----
create table if not exists public.mafia_secrets (
  room_id      int  not null,
  seat         int  not null,
  user_id      uuid not null,
  role         text not null check (role in ('mafia','police','doctor','citizen')),
  epoch        bigint not null default 0,    -- 배정 시점의 rooms.version
  night_kind   text,                         -- 이번 밤 제출한 행동(kill|save|investigate)
  night_target int,                          -- 이번 밤 지목(해소 시 초기화)
  police_target int,                         -- 마지막 조사 대상(비공개 표시용 유지)
  police_result boolean,                     -- 그 대상이 마피아였나
  primary key (room_id, seat)
);
alter table public.mafia_secrets enable row level security;   -- 정책 없음 = RPC(SECURITY DEFINER) 로만

-- ---- rk_me: mafia 기본 stats 포함 ----
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
    'davinci',  coalesce(g->'davinci',  jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'mafia',    coalesce(g->'mafia',    jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'race',     coalesce(g->'race',     jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'hunt',     coalesce(g->'hunt',     jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)));
  if u.display_game is null then
    disp := jsonb_build_object('game', null, 'score', 0);
  else
    ds := coalesce((g->u.display_game->>'score')::int, 0);
    disp := jsonb_build_object('game', u.display_game, 'score', ds);
  end if;
  return jsonb_build_object('id',u.id,'username',u.username,'real_name',u.real_name,
                            'display_game',u.display_game,'games',g,'display',disp,'token',u.token);
end; $$;

-- ---- rooms_game_guard: 보드룸(1~5) mafia 허용 + 5명↑이면 cap<=4 게임 전환 금지 ----
create or replace function public.rooms_game_guard() returns trigger as $$
declare v_newcap int;
begin
  if new.game is not null then
    if new.id between 1 and 5  and new.game not in ('rummikub','davinci','mafia') then new.game := null; end if;
    if new.id between 6 and 10 and new.game not in ('race','hunt')               then new.game := null; end if;
  end if;
  -- 게임 중 종류 변경 금지
  if tg_op='UPDATE' and old.game is distinct from new.game and old.status <> 'waiting' then
    new.game := old.game;
  end if;
  -- 5명 이상이면 cap<=4 게임으로 전환 금지(마피아만 허용)
  if tg_op='UPDATE' and new.game is distinct from old.game and new.game is not null then
    v_newcap := case new.game when 'mafia' then 12 when 'rummikub' then 4 when 'davinci' then 4 else 8 end;
    if v_newcap <= 4 and (select count(*) from public.room_members where room_id = new.id) >= 5 then
      new.game := old.game;
    end if;
  end if;
  return new;
end; $$ language plpgsql;
drop trigger if exists trg_rooms_game_guard on public.rooms;
create trigger trg_rooms_game_guard before insert or update on public.rooms
  for each row execute function public.rooms_game_guard();

-- ---- rk_take_seat: 게임별 cap(좌석번호 + 인원수) 서버 강제 ----
create or replace function public.rk_take_seat(p_token uuid, p_room int, p_seat int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_status text; v_game text; v_cap int;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select status, game into v_status, v_game from public.rooms where id = p_room;
  if v_status is null then raise exception 'NO_ROOM'; end if;
  if v_status <> 'waiting' then return jsonb_build_object('ok',false,'reason','not_waiting'); end if;
  v_cap := case v_game when 'mafia' then 12 when 'rummikub' then 4 when 'davinci' then 4 when 'race' then 8 when 'hunt' then 8
                       else (case when p_room between 1 and 5 then 4 else 8 end) end;   -- 게임 미선택 보드룸=4
  if p_seat < 1 or p_seat > v_cap then raise exception 'BAD_SEAT'; end if;
  if exists (select 1 from public.room_members where room_id=p_room and seat=p_seat and user_id<>v_user) then
    return jsonb_build_object('ok',false,'reason','taken');
  end if;
  if (select count(*) from public.room_members where room_id=p_room and seat is not null and user_id<>v_user) >= v_cap then
    return jsonb_build_object('ok',false,'reason','full');
  end if;
  begin
    update public.room_members set seat = p_seat, role = 'player' where room_id = p_room and user_id = v_user;
    if not found then return jsonb_build_object('ok',false,'reason','not_member'); end if;
  exception when unique_violation then return jsonb_build_object('ok',false,'reason','taken');
  end;
  return jsonb_build_object('ok',true,'seat',p_seat);
end; $$;

-- ---- rk_kick_member: 방장이 다른 멤버 강퇴(대기 중에만) ----
create or replace function public.rk_kick_member(p_token uuid, p_room int, p_target uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_room public.rooms;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if v_room.host_id is distinct from v_user then raise exception 'NOT_HOST'; end if;
  if v_room.status <> 'waiting' then raise exception 'NOT_WAITING'; end if;
  if p_target = v_user then raise exception 'CANT_KICK_SELF'; end if;
  delete from public.room_members  where room_id = p_room and user_id = p_target;
  delete from public.room_presence where room_id = p_room and user_id = p_target;
  return jsonb_build_object('ok', true);
end; $$;

-- ---- rk_leave_room: 원자적 퇴장(마지막 1명이면 빈 대기방으로 리셋) ----
create or replace function public.rk_leave_room(p_token uuid, p_room int)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_left int; v_earliest uuid; v_room public.rooms;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  delete from public.room_members  where room_id = p_room and user_id = v_user;
  delete from public.room_presence where room_id = p_room and user_id = v_user;
  select count(*) into v_left from public.room_members where room_id = p_room;
  if v_left = 0 then
    delete from public.mafia_secrets where room_id = p_room;
    update public.rooms set host_id=null, status='waiting', state=null, version=0, game=null, turn_started_at=null where id = p_room;
  else
    select * into v_room from public.rooms where id = p_room;
    if v_room.host_id is null or not exists (select 1 from public.room_members where room_id=p_room and user_id=v_room.host_id) then
      select user_id into v_earliest from public.room_members where room_id=p_room order by joined_at asc limit 1;
      update public.rooms set host_id = v_earliest where id = p_room;
    end if;
  end if;
  return v_left;
end; $$;

-- ---- rk_reap_stale: finished 방의 좌석 유령도 정리(자동 빈방 복구) ----
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

-- ---- rk_admin_reset_rooms: 개발자 강제초기화(점수/연승/전적/티어 불변) ----
create or replace function public.rk_admin_reset_rooms(p_rooms int[])
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_cnt int;
begin
  if p_rooms is null or array_length(p_rooms,1) is null then return 0; end if;
  delete from public.mafia_secrets where room_id = any(p_rooms);
  delete from public.room_members  where room_id = any(p_rooms) and room_id between 1 and 10;
  delete from public.room_presence where room_id = any(p_rooms) and room_id between 1 and 10;
  update public.rooms
     set host_id=null, status='waiting', state=null, version=0, game=null, turn_started_at=null
   where id = any(p_rooms) and id between 1 and 10;
  get diagnostics v_cnt = row_count;
  return v_cnt;
end; $$;

-- ---- rk_apply_score: 'mafia' 분기 추가(다빈치와 헌트 사이 마진) ----
create or replace function public.rk_apply_score(
  p_game text, p_perf numeric, p_score int, p_prev_streak int, p_is_win boolean, p_treatment text)
returns table(delta int, bonus int, new_streak int, new_score int, lvl int)
language plpgsql immutable set search_path = public as $$
declare L int; gm numeric; lm numeric; tx numeric; mw int; br numeric; adj numeric; d int; b int; ns int; gb numeric; lb numeric;
begin
  L := public.rk_tier_level(coalesce(p_score,0));
  -- 베이스(원래값): 감소는 이 값 그대로 유지. 획득만 아래 gb 밴드로 가산.
  if p_game = 'rummikub' then
    gm := greatest(0.42, 1 - L*0.011); lm := least(2.10, 1 + L*0.020); tx := L*0.85;
    mw := greatest(8, round(28 - L*0.45)::int); br := 0.10;
  elsif p_game = 'davinci' then
    gm := greatest(0.42, 1 - L*0.011); lm := least(2.08, 1 + L*0.020); tx := L*0.60;
    mw := greatest(6, round(20 - L*0.34)::int); br := 0.10;
  elsif p_game = 'mafia' then
    gm := greatest(0.50, 1 - L*0.010); lm := least(2.00, 1 + L*0.018); tx := L*0.30;
    mw := greatest(10, round(24 - L*0.40)::int); br := 0.12;
  elsif p_game = 'race' then
    gm := greatest(0.45, 1 - L*0.011); lm := least(2.05, 1 + L*0.019); tx := L*0.32;
    mw := greatest(4, round(12 - L*0.18)::int); br := 0.08;
  else  -- hunt
    gm := greatest(0.45, 1 - L*0.011); lm := least(2.05, 1 + L*0.019); tx := L*0.30;
    mw := greatest(4, round(11 - L*0.16)::int); br := 0.08;
  end if;
  -- 획득 대폭 가산(gb): 나무~아이언 ×3.0 / 브론즈 ×2.4 / 실버 ×1.8 / 골드~플래 ×1.5 / 에메+ ×1.3
  -- 손실 축소(lb): 나무~아이언 ×0.15 / 브론즈 ×0.4 / 실버 ×0.7 / 골드+ ×1.0  → 브론즈까진 누구나 쉽게, 이후는 적당히
  gb := case when L <= 4 then 3.0 when L <= 8 then 2.4 when L <= 12 then 1.8 when L <= 20 then 1.5 else 1.3 end;
  lb := case when L <= 4 then 0.15 when L <= 8 then 0.4 when L <= 12 then 0.7 else 1.0 end;
  adj := p_perf - tx;
  if adj >= 0 then d := round(adj * gm * gb)::int; else d := round(adj * lm * lb)::int; end if;
  if p_is_win then d := greatest(d, round(mw * gb)::int); end if;
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

-- =====================================================================
-- 마피아 RPC (서버 권위 · 비밀 역할)
-- =====================================================================

-- 역할 비밀 배정 + 밤 시작(멱등: 이미 배정됐으면 already)
create or replace function public.mf_start(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb;
  v_seats int[]; v_n int; v_epoch bigint; i int; v_perm int[]; v_seed bigint; v_log jsonb;
  v_m int; v_pos int;
begin
  select id into v_user from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id=p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if v_room.status <> 'playing' or coalesce(v_room.game,'') <> 'mafia' then raise exception 'WRONG_STATE'; end if;
  v_state := v_room.state;
  if (v_state->>'phase') <> 'lobby_assign' then return jsonb_build_object('ok',true,'already',true); end if;
  v_players := v_state->'players';
  select array_agg(key::int order by key::int) into v_seats from jsonb_object_keys(v_players) key;
  v_n := coalesce(array_length(v_seats,1),0);
  if v_n < 4 or v_n > 12 then raise exception 'BAD_N'; end if;
  if exists (select 1 from public.mafia_secrets where room_id=p_room and epoch=v_room.version) then
    return jsonb_build_object('ok',true,'already',true);
  end if;
  v_epoch := v_room.version;
  v_seed := coalesce((v_state->>'seed')::bigint, v_epoch);
  perform setseed( ((v_seed % 1000000)::numeric / 1000000.0) );
  select array_agg(s order by random()) into v_perm from unnest(v_seats) s;
  delete from public.mafia_secrets where room_id=p_room;
  -- 마피아 수 인원수 스케일: floor((n-1)/3), 최소 1 (n4~6=1·n7~9=2·n10~12=3). 경찰·의사는 항상 1명씩.
  v_m := greatest(1, (v_n - 1) / 3);
  for i in 1 .. v_n loop
    v_pos := array_position(v_perm, v_seats[i]);   -- 셔플된 순번: 1~m=마피아, m+1=경찰, m+2=의사, 나머지=시민
    insert into public.mafia_secrets(room_id, seat, user_id, role, epoch)
    values (p_room, v_seats[i], (v_players->>(v_seats[i]::text))::uuid,
      case when v_pos <= v_m       then 'mafia'
           when v_pos =  v_m + 1   then 'police'
           when v_pos =  v_m + 2   then 'doctor'
           else 'citizen' end, v_epoch);
  end loop;
  v_log := coalesce(v_state->'log','[]'::jsonb) || to_jsonb(array['🌙 1일차 밤 — 마피아·경찰·의사는 행동하세요. 시민은 기다립니다.']);
  v_state := jsonb_set(v_state, '{phase}', '"night"'::jsonb);
  v_state := jsonb_set(v_state, '{day}',   '1'::jsonb);
  v_state := jsonb_set(v_state, '{log}',   v_log);
  update public.rooms set state=v_state, version=version+1 where id=p_room;
  return jsonb_build_object('ok',true);
end; $$;

-- 내 비공개 정보만 반환(내 역할 + 내 조사결과 + 이번밤 행동여부)
create or replace function public.mf_my_view(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; rec public.mafia_secrets; v_pname text; v_mates jsonb; v_names jsonb;
begin
  select id into v_user from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into rec from public.mafia_secrets where room_id=p_room and user_id=v_user;
  if not found then return jsonb_build_object('role', null); end if;
  if rec.role='mafia' then   -- 마피아는 동료 마피아를 본다
    select state->'names' into v_names from public.rooms where id=p_room;
    select coalesce(jsonb_agg(jsonb_build_object('seat',s.seat,'name',coalesce(v_names->>(s.seat::text),'')) order by s.seat),'[]'::jsonb)
      into v_mates from public.mafia_secrets s where s.room_id=p_room and s.role='mafia' and s.seat<>rec.seat;
    return jsonb_build_object('role',rec.role,'acted',(rec.night_kind is not null),'mates',v_mates);
  end if;
  if rec.role='police' and rec.police_target is not null then
    select coalesce(state->'names'->>(rec.police_target::text),'') into v_pname from public.rooms where id=p_room;
    return jsonb_build_object('role',rec.role,'acted',(rec.night_kind is not null),
      'police',jsonb_build_object('target',rec.police_target,'name',v_pname,'isMafia',rec.police_result));
  end if;
  return jsonb_build_object('role',rec.role,'acted',(rec.night_kind is not null));
end; $$;

-- 밤 행동 제출(경찰은 즉시 결과 반환). 모든 생존 특수역할이 제출하면 자동 해소.
create or replace function public.mf_night_action(p_token uuid, p_room int, p_target int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_room public.rooms; v_state jsonb; me public.mafia_secrets;
  v_kind text; v_isMafia boolean; v_tname text; v_pending int; v_res jsonb;
begin
  select id into v_user from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id=p_room for update;
  if not found or v_room.status<>'playing' or coalesce(v_room.game,'')<>'mafia' then raise exception 'WRONG_STATE'; end if;
  v_state := v_room.state;
  if (v_state->>'phase') <> 'night' then raise exception 'NOT_NIGHT'; end if;
  select * into me from public.mafia_secrets where room_id=p_room and user_id=v_user;
  if not found then raise exception 'NOT_A_PLAYER'; end if;
  if me.role = 'citizen' then raise exception 'NO_NIGHT_ROLE'; end if;
  if not coalesce((v_state->'alive'->>(me.seat::text))::boolean,false) then raise exception 'DEAD'; end if;
  if not coalesce((v_state->'alive'->>(p_target::text))::boolean,false) then raise exception 'TARGET_DEAD'; end if;
  if me.role in ('mafia','police') and p_target = me.seat then raise exception 'NO_SELF'; end if;  -- 의사는 자가보호 허용
  if me.role='mafia' and exists(select 1 from public.mafia_secrets where room_id=p_room and seat=p_target and role='mafia') then raise exception 'NO_MAFIA_TARGET'; end if;  -- 동료 마피아 지목 불가
  v_kind := case me.role when 'mafia' then 'kill' when 'doctor' then 'save' else 'investigate' end;
  update public.mafia_secrets set night_kind=v_kind, night_target=p_target where room_id=p_room and seat=me.seat;
  v_res := jsonb_build_object('ok',true);
  if me.role='police' then
    select (role='mafia') into v_isMafia from public.mafia_secrets where room_id=p_room and seat=p_target;
    select coalesce(v_state->'names'->>(p_target::text),'') into v_tname;
    update public.mafia_secrets set police_target=p_target, police_result=v_isMafia where room_id=p_room and seat=me.seat;
    v_res := jsonb_build_object('ok',true,'police',jsonb_build_object('target',p_target,'name',v_tname,'isMafia',v_isMafia));
  end if;
  -- 생존 특수역할(마피아/경찰/의사)이 전부 제출했으면 자동으로 밤 해소
  select count(*) into v_pending from public.mafia_secrets s
    where s.room_id=p_room and s.role in ('mafia','police','doctor')
      and coalesce((v_state->'alive'->>(s.seat::text))::boolean,false)
      and s.night_kind is null;
  if v_pending = 0 then perform public.mf_resolve_phase(p_token, p_room, 'night'); end if;
  return v_res;
end; $$;

-- 낮 투표(공개). target=0 = 기권. 생존자 전원 투표 시 자동 처형 해소.
create or replace function public.mf_day_vote(p_token uuid, p_room int, p_target int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_room public.rooms; v_state jsonb; me public.mafia_secrets;
  v_votes jsonb; v_count jsonb; r record; v_alive int; v_cast int;
begin
  select id into v_user from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id=p_room for update;
  if not found or v_room.status<>'playing' or coalesce(v_room.game,'')<>'mafia' then raise exception 'WRONG_STATE'; end if;
  v_state := v_room.state;
  if (v_state->>'phase') <> 'day' then raise exception 'NOT_DAY'; end if;
  select * into me from public.mafia_secrets where room_id=p_room and user_id=v_user;
  if not found then raise exception 'NOT_A_PLAYER'; end if;
  if not coalesce((v_state->'alive'->>(me.seat::text))::boolean,false) then raise exception 'DEAD'; end if;
  if p_target <> 0 and not coalesce((v_state->'alive'->>(p_target::text))::boolean,false) then raise exception 'TARGET_DEAD'; end if;
  v_votes := jsonb_set(coalesce(v_state->'votes','{}'::jsonb), array[me.seat::text], to_jsonb(p_target));
  v_count := '{}'::jsonb;
  for r in select value::text as tgt, count(*)::int as c from jsonb_each_text(v_votes) where value<>'0' group by value loop
    v_count := jsonb_set(v_count, array[r.tgt], to_jsonb(r.c));
  end loop;
  v_state := jsonb_set(v_state, '{votes}', v_votes);
  v_state := jsonb_set(v_state, '{voteCount}', v_count);
  update public.rooms set state=v_state, version=version+1 where id=p_room;
  select count(*) into v_alive from jsonb_each(v_state->'alive') where value = 'true'::jsonb;
  select count(*) into v_cast  from jsonb_object_keys(v_votes);
  if v_cast >= v_alive then perform public.mf_resolve_phase(p_token, p_room, 'day'); end if;
  return jsonb_build_object('ok',true);
end; $$;

-- 페이즈 해소(서버 권위, 멱등 CAS). 밤 행동 완료 시 또는 시간초과 리더 호출.
create or replace function public.mf_resolve_phase(p_token uuid, p_room int, p_expected text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_phase text; v_day int;
  v_kill int; v_save int; v_killed int; v_saved boolean;
  v_votes jsonb; v_exec int; v_top int; v_second int; v_execRole text; v_name text; r record;
  v_aliveMafia int; v_aliveOther int; v_winner text; v_log jsonb;
  me public.mafia_secrets; v_pending int; v_alive int; v_cast int; v_lim int; v_elapsed numeric; v_complete boolean;
begin
  select id into v_user from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id=p_room for update;
  if not found or v_room.status<>'playing' or coalesce(v_room.game,'')<>'mafia' then
    return jsonb_build_object('ok',false,'reason','wrong_state'); end if;
  select * into me from public.mafia_secrets where room_id=p_room and user_id=v_user;   -- 이 방 플레이어만 해소 가능
  if not found then raise exception 'NOT_A_PLAYER'; end if;
  v_state := v_room.state; v_phase := v_state->>'phase'; v_day := coalesce((v_state->>'day')::int,1);
  if v_phase <> p_expected then return jsonb_build_object('ok',false,'reason','phase_moved'); end if;

  -- 조기 강제해소 차단: 전원 행동 완료(complete) 또는 제한시간 경과일 때만 진행
  v_complete := false;
  if v_phase = 'night' then
    select count(*) into v_pending from public.mafia_secrets s
      where s.room_id=p_room and s.role in ('mafia','police','doctor')
        and coalesce((v_state->'alive'->>(s.seat::text))::boolean,false) and s.night_kind is null;
    v_complete := (v_pending = 0); v_lim := 60;
  elsif v_phase = 'day' then
    select count(*) into v_alive from jsonb_each(v_state->'alive') where value = 'true'::jsonb;
    select count(*) into v_cast  from jsonb_object_keys(coalesce(v_state->'votes','{}'::jsonb));
    v_complete := (v_cast >= v_alive); v_lim := 90;
  else
    return jsonb_build_object('ok',false,'reason','noop');
  end if;
  if not v_complete then
    v_elapsed := case when v_room.turn_started_at is null then 1e9
                      else extract(epoch from (now() - v_room.turn_started_at)) end;
    if v_elapsed < v_lim then return jsonb_build_object('ok',false,'reason','too_early'); end if;
  end if;

  v_log := coalesce(v_state->'log','[]'::jsonb);

  if v_phase = 'night' then
    -- 마피아 여러 명이면 가장 많이 지목된 표적을 처치(동률=낮은 좌석). 미제출 마피아는 무시.
    select night_target into v_kill from public.mafia_secrets
      where room_id=p_room and role='mafia' and night_kind='kill' and night_target is not null
      group by night_target order by count(*) desc, night_target asc limit 1;
    select night_target into v_save from public.mafia_secrets where room_id=p_room and role='doctor' and night_kind='save' limit 1;
    v_killed := null; v_saved := false;
    if v_kill is not null then
      if v_save is not null and v_save = v_kill then v_saved := true; else v_killed := v_kill; end if;
    end if;
    if v_killed is not null then
      v_state := jsonb_set(v_state, array['alive', v_killed::text], 'false'::jsonb);
      select coalesce(v_state->'names'->>(v_killed::text),'') into v_name;
      v_log := v_log || to_jsonb(array['☀️ '||v_day||'일차 아침 — '||v_name||' 님이 밤사이 살해당했습니다.']);
    elsif v_saved then
      v_log := v_log || to_jsonb(array['☀️ '||v_day||'일차 아침 — 의사가 살렸습니다! 사망자가 없습니다.']);
    else
      v_log := v_log || to_jsonb(array['☀️ '||v_day||'일차 아침 — 아무도 죽지 않았습니다.']);
    end if;
    v_state := jsonb_set(v_state, '{lastNight}', jsonb_build_object('killed', coalesce(to_jsonb(v_killed),'null'::jsonb), 'saved', v_saved));
    update public.mafia_secrets set night_kind=null, night_target=null where room_id=p_room;
  else  -- day
    v_votes := coalesce(v_state->'votes','{}'::jsonb);
    v_top := 0; v_exec := null; v_second := -1;
    for r in select value::int as tgt, count(*)::int as c from jsonb_each_text(v_votes)
             where value <> '0' group by value order by count(*) desc, value::int asc loop
      if v_exec is null then v_top := r.c; v_exec := r.tgt;
      elsif v_second = -1 then v_second := r.c;
      end if;
    end loop;
    if v_top <= 0 or v_second = v_top then v_exec := null; end if;   -- 동률/무효 → 처형 없음
    v_execRole := null;
    if v_exec is not null then
      select role into v_execRole from public.mafia_secrets where room_id=p_room and seat=v_exec;
      v_state := jsonb_set(v_state, array['alive', v_exec::text], 'false'::jsonb);
      select coalesce(v_state->'names'->>(v_exec::text),'') into v_name;
      v_log := v_log || to_jsonb(array['⚖️ '||v_name||' 님이 투표로 처형 — 정체는 '||
        (case v_execRole when 'mafia' then '🔪 마피아' when 'police' then '🚓 경찰' when 'doctor' then '🚑 의사' else '🙂 시민' end)||'!']);
    else
      v_log := v_log || to_jsonb(array['⚖️ 투표가 동률/무효여서 아무도 처형되지 않았습니다.']);
    end if;
    v_state := jsonb_set(v_state, '{lastVote}', jsonb_build_object('executed',coalesce(to_jsonb(v_exec),'null'::jsonb),'role',coalesce(to_jsonb(v_execRole),'null'::jsonb)));
  end if;

  -- 승리 판정(전환 로그보다 먼저 — "밤이 되었습니다" 뒤에 "승리"가 찍히는 순서 버그 방지)
  select count(*) into v_aliveMafia from public.mafia_secrets s
    where s.room_id=p_room and s.role='mafia' and coalesce((v_state->'alive'->>(s.seat::text))::boolean,false);
  select count(*) into v_aliveOther from public.mafia_secrets s
    where s.room_id=p_room and s.role<>'mafia' and coalesce((v_state->'alive'->>(s.seat::text))::boolean,false);
  v_winner := null;
  if v_aliveMafia = 0 then v_winner := 'citizens';
  elsif v_aliveMafia >= v_aliveOther then v_winner := 'mafia';
  end if;

  if v_winner is not null then
    v_state := jsonb_set(v_state, '{phase}', '"end"'::jsonb);
    v_state := jsonb_set(v_state, '{winner}', to_jsonb(v_winner));
    v_log := v_log || to_jsonb(array[(case when v_winner='citizens' then '🎉 시민 승리! 마피아를 처단했습니다.' else '🔪 마피아 승리! 마을이 무너졌습니다.' end)]);
  elsif v_phase = 'night' then               -- 밤 해소 → 낮
    v_state := jsonb_set(v_state, '{votes}', '{}'::jsonb);
    v_state := jsonb_set(v_state, '{voteCount}', '{}'::jsonb);
    v_state := jsonb_set(v_state, '{phase}', '"day"'::jsonb);
    v_log := v_log || to_jsonb(array['🗳️ '||v_day||'일차 낮 — 토론 후 처형할 사람을 투표하세요.']);
  else                                        -- 낮 해소 → 다음 밤
    v_state := jsonb_set(v_state, '{day}', to_jsonb(v_day+1));
    v_state := jsonb_set(v_state, '{votes}', '{}'::jsonb);
    v_state := jsonb_set(v_state, '{voteCount}', '{}'::jsonb);
    v_state := jsonb_set(v_state, '{phase}', '"night"'::jsonb);
    v_log := v_log || to_jsonb(array['🌙 '||(v_day+1)||'일차 밤이 되었습니다.']);
  end if;

  if jsonb_array_length(v_log) > 30 then
    select jsonb_agg(e order by o) into v_log
    from (select e, o from jsonb_array_elements(v_log) with ordinality t(e, o) order by o desc limit 30) z;
  end if;
  v_state := jsonb_set(v_state, '{log}', v_log);
  update public.rooms set state=v_state, version=version+1 where id=p_room;
  return jsonb_build_object('ok',true,'phase',v_state->>'phase','winner',v_winner);
end; $$;

-- 마피아 정산(진영 비대칭 점수). 멱등.
create or replace function public.rk_finish_mafia(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_winner text;
  v_seats text[]; v_n int; v_results jsonb := '{}'::jsonb; v_present uuid[]; v_quit boolean;
  i int; v_seat text; v_uid uuid; v_role text; v_camp text; v_won boolean;
  v_curscore int; v_curstreak int; v_perf numeric; v_tr text; v_delta int; v_ns int; r record; v_w int; v_l int;
  CAP constant int := 300;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if coalesce(v_room.game,'') <> 'mafia' then raise exception 'WRONG_GAME'; end if;
  if v_room.status <> 'playing' then return coalesce(v_room.state->'results','{}'::jsonb); end if;
  v_state := v_room.state; v_players := v_state->'players'; v_winner := v_state->>'winner';
  select array_agg(user_id) into v_present from public.room_members where room_id = p_room;   -- 현재 방에 남은 사람(중퇴 판별)
  if not exists (select 1 from jsonb_each_text(v_players) e where e.value=v_user::text) then raise exception 'NOT_A_PLAYER'; end if;
  if v_winner is null or (v_state->>'phase') <> 'end' then raise exception 'NOT_OVER'; end if;
  select array_agg(key) into v_seats from jsonb_object_keys(v_players) key;
  v_n := coalesce(array_length(v_seats,1),0);
  if v_n < 4 or v_n > 12 then raise exception 'BAD_N'; end if;

  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_uid := (v_players->>v_seat)::uuid;
    select role into v_role from public.mafia_secrets where room_id=p_room and seat=v_seat::int;
    v_role := coalesce(v_role,'citizen');
    v_camp := case when v_role='mafia' then 'mafia' else 'citizens' end;
    v_won  := (v_camp = v_winner);
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak
        from public.user_game_stats where user_id=v_uid and game='mafia';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    if v_camp = 'mafia' then
      v_perf := case when v_won then 45 else -10 end;   -- 마피아 승은 시민 승보다 훨씬 큼(1 vs 다수), 패배는 연착륙
      v_tr   := case when v_won then 'apply' else 'maintain' end;
    else
      v_perf := case when v_won then 13 else -9 end;     -- 시민 진영: 작고 꾸준한 변동
      v_tr   := case when v_won then 'apply' else 'break' end;
    end if;
    v_quit := (v_uid is not null and not (v_uid = any(coalesce(v_present, array[]::uuid[]))));
    if v_quit then v_perf := -28; v_won := false; v_tr := 'break'; end if;   -- 중퇴=패배+차감
    select * into r from public.rk_apply_score('mafia', v_perf, v_curscore, v_curstreak, v_won, v_tr);
    v_delta := greatest(-CAP, least(CAP, r.delta));
    v_ns := greatest(0, v_curscore + v_delta);
    perform public.rk_bump_stats(v_uid, 'mafia', v_ns, r.new_streak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='mafia'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'role',v_role,'camp',v_camp,'won',v_won,'quit',coalesce(v_quit,false),
      'delta',v_delta,'bonus',r.bonus,'prevScore',v_curscore,'newScore',v_ns,
      'streak',r.new_streak,'treatment',v_tr,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  delete from public.mafia_secrets where room_id = p_room;
  return v_results;
end; $$;

-- ---- 권한 ----
grant execute on function public.rk_kick_member(uuid,int,uuid)    to anon, authenticated;
grant execute on function public.rk_leave_room(uuid,int)          to anon, authenticated;
grant execute on function public.rk_admin_reset_rooms(int[])      to anon, authenticated;
grant execute on function public.mf_start(uuid,int)              to anon, authenticated;
grant execute on function public.mf_my_view(uuid,int)            to anon, authenticated;
grant execute on function public.mf_night_action(uuid,int,int)   to anon, authenticated;
grant execute on function public.mf_day_vote(uuid,int,int)       to anon, authenticated;
grant execute on function public.mf_resolve_phase(uuid,int,text) to anon, authenticated;
grant execute on function public.rk_finish_mafia(uuid,int)       to anon, authenticated;

-- ---- 마피아 점수 1회 초기화(새 점수체계 적용 · 재실행해도 단 한 번만) ----
create table if not exists public.app_migrations (key text primary key, applied_at timestamptz not null default now());
do $$ begin
  if not exists (select 1 from public.app_migrations where key = 'mafia_reset_20260614') then
    delete from public.user_game_stats where game = 'mafia';          -- 모두의 마피아 점수/연승/전적 0으로
    update public.users set display_game = null where display_game = 'mafia';  -- 마피아 꾸미기 표시 해제
    insert into public.app_migrations(key) values ('mafia_reset_20260614');
  end if;
end $$;

-- =====================================================================
-- v4: 점수 고정테이블(루미/다빈치/스플랜더) + 마피아 기여도 점수 + 스플랜더 보드게임
--     ⚠ 멱등. 파일 끝에 append. create-or-replace 가 위 정의를 override.
-- =====================================================================

-- ---- 게임 화이트리스트에 'splendor' 추가(없으면 스플랜더가 rummikub 으로 폴백) ----
-- ⚠ rooms.game CHECK 도 함께 갱신해야 함(빠지면 방 게임을 splendor 로 못 바꿈 = 선택 불가)
alter table public.rooms drop constraint if exists rooms_game_chk;
alter table public.rooms add  constraint rooms_game_chk
  check (game is null or game in ('rummikub','davinci','splendor','race','hunt','mafia'));
alter table public.users drop constraint if exists users_display_game_chk;
alter table public.users drop constraint if exists users_display_game_check;
alter table public.users add  constraint users_display_game_chk
  check (display_game is null or display_game in ('rummikub','davinci','splendor','uno','race','hunt','mafia'));
alter table public.user_game_stats drop constraint if exists user_game_stats_game_check;
alter table public.user_game_stats add  constraint user_game_stats_game_check
  check (game in ('rummikub','davinci','splendor','uno','race','hunt','mafia'));

create or replace function public.rk_leaderboard(p_game text default 'rummikub')
returns table(id uuid, username citext, real_name text, score int, wins int, losses int, streak int)
language sql security definer set search_path = public, extensions as $$
  select u.id, u.username, u.real_name, s.score, s.wins, s.losses, s.streak
  from public.user_game_stats s join public.users u on u.id = s.user_id
  where s.game = case when p_game in ('rummikub','davinci','splendor','race','hunt','mafia') then p_game else 'rummikub' end
  order by s.score desc, s.wins desc, u.real_name asc limit 100;
$$;

create or replace function public.rk_set_display(p_token uuid, p_game text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_score int;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  if p_game is not null and p_game not in ('rummikub','davinci','splendor','race','hunt','mafia') then raise exception 'BAD_GAME'; end if;
  update public.users set display_game = p_game where id = v_user;
  if p_game is null then return jsonb_build_object('game', null, 'score', 0); end if;
  select coalesce(score,0) into v_score from public.user_game_stats where user_id = v_user and game = p_game;
  return jsonb_build_object('game', p_game, 'score', coalesce(v_score,0));
end; $$;

-- rk_me: splendor 기본 stats 포함
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
    'davinci',  coalesce(g->'davinci',  jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'splendor', coalesce(g->'splendor', jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'mafia',    coalesce(g->'mafia',    jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'race',     coalesce(g->'race',     jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'hunt',     coalesce(g->'hunt',     jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)));
  if u.display_game is null then
    disp := jsonb_build_object('game', null, 'score', 0);
  else
    ds := coalesce((g->u.display_game->>'score')::int, 0);
    disp := jsonb_build_object('game', u.display_game, 'score', ds);
  end if;
  return jsonb_build_object('id',u.id,'username',u.username,'real_name',u.real_name,
                            'display_game',u.display_game,'games',g,'display',disp,'token',u.token);
end; $$;

-- rooms_game_guard: 보드룸(1~5) splendor 허용 + cap
create or replace function public.rooms_game_guard() returns trigger as $$
declare v_newcap int;
begin
  if new.game is not null then
    if new.id between 1 and 5  and new.game not in ('rummikub','davinci','splendor','mafia') then new.game := null; end if;
    if new.id between 6 and 10 and new.game not in ('race','hunt')                          then new.game := null; end if;
  end if;
  if tg_op='UPDATE' and old.game is distinct from new.game and old.status <> 'waiting' then
    new.game := old.game;
  end if;
  if tg_op='UPDATE' and new.game is distinct from old.game and new.game is not null then
    v_newcap := case new.game when 'mafia' then 12 when 'rummikub' then 4 when 'davinci' then 4 when 'splendor' then 4 else 8 end;
    if v_newcap <= 4 and (select count(*) from public.room_members where room_id = new.id) >= 5 then
      new.game := old.game;
    end if;
  end if;
  return new;
end; $$ language plpgsql;
drop trigger if exists trg_rooms_game_guard on public.rooms;
create trigger trg_rooms_game_guard before insert or update on public.rooms
  for each row execute function public.rooms_game_guard();

-- rk_take_seat: splendor cap=4
create or replace function public.rk_take_seat(p_token uuid, p_room int, p_seat int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_status text; v_game text; v_cap int;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select status, game into v_status, v_game from public.rooms where id = p_room;
  if v_status is null then raise exception 'NO_ROOM'; end if;
  if v_status <> 'waiting' then return jsonb_build_object('ok',false,'reason','not_waiting'); end if;
  v_cap := case v_game when 'mafia' then 12 when 'rummikub' then 4 when 'davinci' then 4 when 'splendor' then 4 when 'race' then 8 when 'hunt' then 8
                       else (case when p_room between 1 and 5 then 4 else 8 end) end;
  if p_seat < 1 or p_seat > v_cap then raise exception 'BAD_SEAT'; end if;
  if exists (select 1 from public.room_members where room_id=p_room and seat=p_seat and user_id<>v_user) then
    return jsonb_build_object('ok',false,'reason','taken');
  end if;
  if (select count(*) from public.room_members where room_id=p_room and seat is not null and user_id<>v_user) >= v_cap then
    return jsonb_build_object('ok',false,'reason','full');
  end if;
  begin
    update public.room_members set seat = p_seat, role = 'player' where room_id = p_room and user_id = v_user;
    if not found then return jsonb_build_object('ok',false,'reason','not_member'); end if;
  exception when unique_violation then return jsonb_build_object('ok',false,'reason','taken');
  end;
  return jsonb_build_object('ok',true,'seat',p_seat);
end; $$;

-- ---- 고정 점수표 룩업(서버=클라 tiers.js 동일) ----
create or replace function public.rk_tier_key(p_score int)
returns text language sql immutable set search_path = public as $$
  select case
    when s >= 15000 then 'challenger' when s >= 13500 then 'grandmaster'
    when s >= 12000 then 'master' when s >= 9000 then 'diamond'
    when s >= 7000 then 'emerald' when s >= 5400 then 'platinum'
    when s >= 3800 then 'gold' when s >= 2200 then 'silver'
    when s >= 1000 then 'bronze' when s >= 200 then 'iron' else 'wood' end
  from (select greatest(0, coalesce(p_score,0)) as s) t;
$$;

create or replace function public.rk_rank_points(p_game text, p_score int, p_n int, p_rank int)
returns int language plpgsql immutable set search_path = public as $$
declare
  t jsonb := '{"rummikub":{"wood":{"2":[110,0],"3":[120,90,0],"4":[150,100,50,0]},"iron":{"2":[100,-10],"3":[110,80,-10],"4":[130,100,40,-20]},"bronze":{"2":[90,-20],"3":[100,60,-20],"4":[120,90,20,-40]},"silver":{"2":[80,-30],"3":[90,50,-40],"4":[110,90,0,-60]},"gold":{"2":[70,-40],"3":[80,30,-60],"4":[100,80,-20,-80]},"platinum":{"2":[60,-50],"3":[80,20,-80],"4":[100,70,-40,-100]},"emerald":{"2":[50,-70],"3":[70,10,-100],"4":[90,60,-50,-120]},"diamond":{"2":[50,-90],"3":[70,0,-120],"4":[90,50,-60,-140]},"master":{"2":[40,-90],"3":[60,0,-130],"4":[80,50,-60,-150]},"grandmaster":{"2":[40,-110],"3":[60,-10,-140],"4":[80,40,-70,-160]},"challenger":{"2":[30,-110],"3":[50,-20,-140],"4":[70,40,-80,-170]}},"davinci":{"wood":{"2":[90,0],"3":[100,80,0],"4":[120,90,40,0]},"iron":{"2":[80,-10],"3":[100,70,-20],"4":[110,90,30,-20]},"bronze":{"2":[70,-20],"3":[90,70,-40],"4":[100,80,20,-30]},"silver":{"2":[70,-30],"3":[80,60,-50],"4":[90,80,10,-50]},"gold":{"2":[60,-40],"3":[70,50,-60],"4":[90,70,0,-70]},"platinum":{"2":[60,-50],"3":[70,40,-80],"4":[80,60,-10,-90]},"emerald":{"2":[50,-70],"3":[60,20,-100],"4":[70,50,-30,-110]},"diamond":{"2":[50,-90],"3":[60,10,-120],"4":[70,40,-40,-130]},"master":{"2":[40,-90],"3":[50,0,-120],"4":[70,40,-40,-150]},"grandmaster":{"2":[40,-110],"3":[50,-10,-130],"4":[60,30,-50,-150]},"challenger":{"2":[30,-110],"3":[40,-10,-130],"4":[50,30,-50,-160]}},"splendor":{"wood":{"2":[130,0],"3":[150,90,50],"4":[180,140,80,0]},"iron":{"2":[130,-10],"3":[150,80,20],"4":[170,130,60,-20]},"bronze":{"2":[120,-20],"3":[140,60,0],"4":[160,120,40,-40]},"silver":{"2":[110,-30],"3":[130,50,-20],"4":[150,110,20,-60]},"gold":{"2":[100,-40],"3":[120,30,-40],"4":[140,100,0,-80]},"platinum":{"2":[90,-50],"3":[110,20,-50],"4":[130,90,-10,-100]},"emerald":{"2":[80,-70],"3":[100,10,-70],"4":[120,80,-20,-120]},"diamond":{"2":[70,-90],"3":[90,0,-90],"4":[110,70,-30,-140]},"master":{"2":[60,-90],"3":[80,0,-110],"4":[100,60,-40,-150]},"grandmaster":{"2":[50,-110],"3":[70,-10,-120],"4":[90,50,-50,-160]},"challenger":{"2":[40,-110],"3":[60,-20,-130],"4":[80,40,-60,-170]}}}'::jsonb;
  v_tier text; nn int; rk int; arr jsonb;
begin
  v_tier := public.rk_tier_key(p_score);
  nn := least(4, greatest(2, coalesce(p_n,2)));
  arr := t -> p_game -> v_tier -> nn::text;
  if arr is null then return 0; end if;
  rk := least(jsonb_array_length(arr), greatest(1, coalesce(p_rank, jsonb_array_length(arr))));
  return coalesce((arr ->> (rk-1))::int, 0);
end; $$;

-- ---- 루미큐브: 등수(손패점수 오름차순, 동률=공동등수) → 고정표 ----
create or replace function public.rk_finish_game(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb;
  v_seats text[]; v_n int; v_handpts jsonb := '{}'::jsonb; v_results jsonb := '{}'::jsonb;
  v_over boolean := false; v_passStreak int; v_sorted text[]; i int; j int; k int;
  v_rank int; v_seat text; v_uid uuid; v_won boolean; v_hp int;
  v_cnt int; v_distinct int; v_bad int; v_pool int; v_curscore int; v_curstreak int;
  v_delta int; v_ns int; v_nstreak int; v_w int; v_l int;
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

  select array_agg(s order by (v_handpts->>s)::int, s::int) into v_sorted from unnest(v_seats) s;
  i := 1;
  while i <= v_n loop
    j := i;
    while j < v_n and (v_handpts->>v_sorted[j+1])::int = (v_handpts->>v_sorted[i])::int loop j := j + 1; end loop;
    v_rank := i;
    for k in i .. j loop
      v_seat := v_sorted[k]; v_uid := (v_players->>v_seat)::uuid;
      v_curscore := 0; v_curstreak := 0;
      if v_uid is not null then
        select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak
          from public.user_game_stats where user_id = v_uid and game = 'rummikub';
        v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
      end if;
      v_won := (v_rank = 1);
      v_delta := public.rk_rank_points('rummikub', v_curscore, v_n, v_rank);
      v_ns := greatest(0, least(15000, v_curscore + v_delta));
      v_nstreak := case when v_won then v_curstreak + 1 else 0 end;
      perform public.rk_bump_stats(v_uid, 'rummikub', v_ns, v_nstreak, v_won);
      v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='rummikub'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
      v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
        'rank',v_rank,'delta',v_delta,'bonus',0,'won',v_won,'handPoints',(v_handpts->>v_seat)::int,
        'prevScore',v_curscore,'newScore',v_ns,'streak',v_nstreak,'treatment',case when v_won then 'apply' else 'break' end,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
    end loop;
    i := j + 1;
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  return v_results;
end; $$;

-- ---- 다빈치: 탈락순위(클라 ranks) → 고정표 ----
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
  if found then raise exception 'BAD_RANKS'; end if;
  for i in 1 .. v_n loop
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

-- ---- 스플랜더: 점수순위(클라 ranks: 명성↓→카드수↑ 타이브레이크) → 고정표 ----
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
  if found then raise exception 'BAD_RANKS'; end if;
  for i in 1 .. v_n loop
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

-- ---- 마피아 기여도 누적 컬럼 ----
alter table public.mafia_secrets add column if not exists kills int not null default 0;
alter table public.mafia_secrets add column if not exists saves int not null default 0;
alter table public.mafia_secrets add column if not exists hits  int not null default 0;

-- ---- mf_resolve_phase: 밤 해소 시 기여도(성공살인/세이브/정답조사) 누적 추가 ----
create or replace function public.mf_resolve_phase(p_token uuid, p_room int, p_expected text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_phase text; v_day int;
  v_kill int; v_save int; v_killed int; v_saved boolean;
  v_votes jsonb; v_exec int; v_top int; v_second int; v_execRole text; v_name text; r record;
  v_aliveMafia int; v_aliveOther int; v_winner text; v_log jsonb;
  me public.mafia_secrets; v_pending int; v_alive int; v_cast int; v_lim int; v_elapsed numeric; v_complete boolean;
begin
  select id into v_user from public.users where token=p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id=p_room for update;
  if not found or v_room.status<>'playing' or coalesce(v_room.game,'')<>'mafia' then
    return jsonb_build_object('ok',false,'reason','wrong_state'); end if;
  select * into me from public.mafia_secrets where room_id=p_room and user_id=v_user;
  if not found then raise exception 'NOT_A_PLAYER'; end if;
  v_state := v_room.state; v_phase := v_state->>'phase'; v_day := coalesce((v_state->>'day')::int,1);
  if v_phase <> p_expected then return jsonb_build_object('ok',false,'reason','phase_moved'); end if;

  v_complete := false;
  if v_phase = 'night' then
    select count(*) into v_pending from public.mafia_secrets s
      where s.room_id=p_room and s.role in ('mafia','police','doctor')
        and coalesce((v_state->'alive'->>(s.seat::text))::boolean,false) and s.night_kind is null;
    v_complete := (v_pending = 0); v_lim := 60;
  elsif v_phase = 'day' then
    select count(*) into v_alive from jsonb_each(v_state->'alive') where value = 'true'::jsonb;
    select count(*) into v_cast  from jsonb_object_keys(coalesce(v_state->'votes','{}'::jsonb));
    v_complete := (v_cast >= v_alive); v_lim := 90;
  else
    return jsonb_build_object('ok',false,'reason','noop');
  end if;
  if not v_complete then
    v_elapsed := case when v_room.turn_started_at is null then 1e9
                      else extract(epoch from (now() - v_room.turn_started_at)) end;
    if v_elapsed < v_lim then return jsonb_build_object('ok',false,'reason','too_early'); end if;
  end if;

  v_log := coalesce(v_state->'log','[]'::jsonb);

  if v_phase = 'night' then
    -- 마피아 여러 명이면 가장 많이 지목된 표적을 처치(동률=낮은 좌석). 미제출 마피아는 무시.
    select night_target into v_kill from public.mafia_secrets
      where room_id=p_room and role='mafia' and night_kind='kill' and night_target is not null
      group by night_target order by count(*) desc, night_target asc limit 1;
    select night_target into v_save from public.mafia_secrets where room_id=p_room and role='doctor' and night_kind='save' limit 1;
    v_killed := null; v_saved := false;
    if v_kill is not null then
      if v_save is not null and v_save = v_kill then v_saved := true; else v_killed := v_kill; end if;
    end if;
    if v_killed is not null then
      v_state := jsonb_set(v_state, array['alive', v_killed::text], 'false'::jsonb);
      select coalesce(v_state->'names'->>(v_killed::text),'') into v_name;
      v_log := v_log || to_jsonb(array['☀️ '||v_day||'일차 아침 — '||v_name||' 님이 밤사이 살해당했습니다.']);
    elsif v_saved then
      v_log := v_log || to_jsonb(array['☀️ '||v_day||'일차 아침 — 의사가 살렸습니다! 사망자가 없습니다.']);
    else
      v_log := v_log || to_jsonb(array['☀️ '||v_day||'일차 아침 — 아무도 죽지 않았습니다.']);
    end if;
    v_state := jsonb_set(v_state, '{lastNight}', jsonb_build_object('killed', coalesce(to_jsonb(v_killed),'null'::jsonb), 'saved', v_saved));
    -- 기여도 누적: 성공한 마피아 살인 / 의사 세이브 / 경찰 정답조사
    if v_killed is not null then
      update public.mafia_secrets set kills = kills + 1 where room_id=p_room and role='mafia' and night_kind='kill' and night_target=v_killed;
    end if;
    if v_saved then
      update public.mafia_secrets set saves = saves + 1 where room_id=p_room and role='doctor' and night_kind='save';
    end if;
    update public.mafia_secrets set hits = hits + 1
      where room_id=p_room and role='police' and night_kind='investigate' and police_result is true;
    update public.mafia_secrets set night_kind=null, night_target=null where room_id=p_room;
  else  -- day
    v_votes := coalesce(v_state->'votes','{}'::jsonb);
    v_top := 0; v_exec := null; v_second := -1;
    for r in select value::int as tgt, count(*)::int as c from jsonb_each_text(v_votes)
             where value <> '0' group by value order by count(*) desc, value::int asc loop
      if v_exec is null then v_top := r.c; v_exec := r.tgt;
      elsif v_second = -1 then v_second := r.c;
      end if;
    end loop;
    if v_top <= 0 or v_second = v_top then v_exec := null; end if;
    v_execRole := null;
    if v_exec is not null then
      select role into v_execRole from public.mafia_secrets where room_id=p_room and seat=v_exec;
      v_state := jsonb_set(v_state, array['alive', v_exec::text], 'false'::jsonb);
      select coalesce(v_state->'names'->>(v_exec::text),'') into v_name;
      v_log := v_log || to_jsonb(array['⚖️ '||v_name||' 님이 투표로 처형 — 정체는 '||
        (case v_execRole when 'mafia' then '🔪 마피아' when 'police' then '🚓 경찰' when 'doctor' then '🚑 의사' else '🙂 시민' end)||'!']);
    else
      v_log := v_log || to_jsonb(array['⚖️ 투표가 동률/무효여서 아무도 처형되지 않았습니다.']);
    end if;
    v_state := jsonb_set(v_state, '{lastVote}', jsonb_build_object('executed',coalesce(to_jsonb(v_exec),'null'::jsonb),'role',coalesce(to_jsonb(v_execRole),'null'::jsonb)));
  end if;

  select count(*) into v_aliveMafia from public.mafia_secrets s
    where s.room_id=p_room and s.role='mafia' and coalesce((v_state->'alive'->>(s.seat::text))::boolean,false);
  select count(*) into v_aliveOther from public.mafia_secrets s
    where s.room_id=p_room and s.role<>'mafia' and coalesce((v_state->'alive'->>(s.seat::text))::boolean,false);
  v_winner := null;
  if v_aliveMafia = 0 then v_winner := 'citizens';
  elsif v_aliveMafia >= v_aliveOther then v_winner := 'mafia';
  end if;

  if v_winner is not null then
    v_state := jsonb_set(v_state, '{phase}', '"end"'::jsonb);
    v_state := jsonb_set(v_state, '{winner}', to_jsonb(v_winner));
    v_log := v_log || to_jsonb(array[(case when v_winner='citizens' then '🎉 시민 승리! 마피아를 처단했습니다.' else '🔪 마피아 승리! 마을이 무너졌습니다.' end)]);
  elsif v_phase = 'night' then
    v_state := jsonb_set(v_state, '{votes}', '{}'::jsonb);
    v_state := jsonb_set(v_state, '{voteCount}', '{}'::jsonb);
    v_state := jsonb_set(v_state, '{phase}', '"day"'::jsonb);
    v_log := v_log || to_jsonb(array['🗳️ '||v_day||'일차 낮 — 토론 후 처형할 사람을 투표하세요.']);
  else
    v_state := jsonb_set(v_state, '{day}', to_jsonb(v_day+1));
    v_state := jsonb_set(v_state, '{votes}', '{}'::jsonb);
    v_state := jsonb_set(v_state, '{voteCount}', '{}'::jsonb);
    v_state := jsonb_set(v_state, '{phase}', '"night"'::jsonb);
    v_log := v_log || to_jsonb(array['🌙 '||(v_day+1)||'일차 밤이 되었습니다.']);
  end if;

  if jsonb_array_length(v_log) > 30 then
    select jsonb_agg(e order by o) into v_log
    from (select e, o from jsonb_array_elements(v_log) with ordinality t(e, o) order by o desc limit 30) z;
  end if;
  v_state := jsonb_set(v_state, '{log}', v_log);
  update public.rooms set state=v_state, version=version+1 where id=p_room;
  return jsonb_build_object('ok',true,'phase',v_state->>'phase','winner',v_winner);
end; $$;

-- ---- 마피아 정산: 기여도 기반(진영 베이스 + 역할기여), 승리진영 무조건 +1 이상 ----
create or replace function public.rk_finish_mafia(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_winner text;
  v_seats text[]; v_n int; v_results jsonb := '{}'::jsonb; v_present uuid[]; v_quit boolean;
  i int; v_seat text; v_uid uuid; v_role text; v_camp text; v_won boolean;
  v_curscore int; v_curstreak int; v_delta int; v_ns int; v_nstreak int; v_w int; v_l int;
  v_tierkey text; v_base int; v_contrib int; v_kills int; v_saves int; v_hits int; v_survived boolean;
  v_mbase jsonb := '{"wood":{"mwin":150,"cwin":75,"loss":0},"iron":{"mwin":135,"cwin":67,"loss":-10},"bronze":{"mwin":120,"cwin":58,"loss":-20},"silver":{"mwin":102,"cwin":47,"loss":-33},"gold":{"mwin":84,"cwin":36,"loss":-46},"platinum":{"mwin":74,"cwin":30,"loss":-59},"emerald":{"mwin":64,"cwin":24,"loss":-73},"diamond":{"mwin":54,"cwin":18,"loss":-86},"master":{"mwin":47,"cwin":15,"loss":-96},"grandmaster":{"mwin":41,"cwin":13,"loss":-106},"challenger":{"mwin":34,"cwin":10,"loss":-116}}'::jsonb;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if coalesce(v_room.game,'') <> 'mafia' then raise exception 'WRONG_GAME'; end if;
  if v_room.status <> 'playing' then return coalesce(v_room.state->'results','{}'::jsonb); end if;
  v_state := v_room.state; v_players := v_state->'players'; v_winner := v_state->>'winner';
  select array_agg(user_id) into v_present from public.room_members where room_id = p_room;
  if not exists (select 1 from jsonb_each_text(v_players) e where e.value=v_user::text) then raise exception 'NOT_A_PLAYER'; end if;
  if v_winner is null or (v_state->>'phase') <> 'end' then raise exception 'NOT_OVER'; end if;
  select array_agg(key) into v_seats from jsonb_object_keys(v_players) key;
  v_n := coalesce(array_length(v_seats,1),0);
  if v_n < 4 or v_n > 12 then raise exception 'BAD_N'; end if;

  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_uid := (v_players->>v_seat)::uuid;
    select role, kills, saves, hits into v_role, v_kills, v_saves, v_hits
      from public.mafia_secrets where room_id=p_room and seat=v_seat::int;
    v_role := coalesce(v_role,'citizen'); v_kills:=coalesce(v_kills,0); v_saves:=coalesce(v_saves,0); v_hits:=coalesce(v_hits,0);
    v_camp := case when v_role='mafia' then 'mafia' else 'citizens' end;
    v_won  := (v_camp = v_winner);
    v_survived := coalesce((v_state->'alive'->>v_seat)::boolean, false);
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak
        from public.user_game_stats where user_id=v_uid and game='mafia';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    v_tierkey := public.rk_tier_key(v_curscore);
    v_quit := (v_uid is not null and not (v_uid = any(coalesce(v_present, array[]::uuid[]))));

    if v_won and v_camp='mafia' then v_base := (v_mbase->v_tierkey->>'mwin')::int;
    elsif v_won then v_base := (v_mbase->v_tierkey->>'cwin')::int;
    else v_base := (v_mbase->v_tierkey->>'loss')::int; end if;

    if v_quit then
      v_contrib := 0; v_won := false; v_delta := (v_mbase->v_tierkey->>'loss')::int;   -- 중퇴=기여 무효+패배 손실
    else
      if v_role='mafia' then v_contrib := v_kills * 8;
      elsif v_role='police' then v_contrib := v_hits * 10;
      elsif v_role='doctor' then v_contrib := v_saves * 12;
      elsif v_survived then v_contrib := 6;
      else v_contrib := 0; end if;
      v_delta := v_base + v_contrib;
      if v_won then v_delta := greatest(v_delta, 1);    -- 승리진영 무조건 +1 이상
      else v_delta := least(v_delta, 0); end if;          -- 패배는 최대 0(기여로 손실만 경감)
    end if;

    v_ns := greatest(0, least(15000, v_curscore + v_delta));
    v_nstreak := case when v_won then v_curstreak + 1 else 0 end;
    perform public.rk_bump_stats(v_uid, 'mafia', v_ns, v_nstreak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='mafia'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'role',v_role,'camp',v_camp,'won',v_won,'quit',coalesce(v_quit,false),
      'kills',v_kills,'saves',v_saves,'hits',v_hits,'survived',v_survived,'contrib',v_contrib,
      'delta',v_delta,'bonus',0,'prevScore',v_curscore,'newScore',v_ns,
      'streak',v_nstreak,'treatment',case when v_won then 'apply' else 'break' end,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  delete from public.mafia_secrets where room_id = p_room;
  return v_results;
end; $$;

-- ---- 권한(신규 함수) ----
grant execute on function public.rk_tier_key(int)                to anon, authenticated;
grant execute on function public.rk_rank_points(text,int,int,int) to anon, authenticated;
grant execute on function public.rk_finish_splendor(uuid,int)    to anon, authenticated;

-- =====================================================================
-- v5: 'uno' 보드게임 추가 (멱등, 파일 끝에 append, create-or-replace override)
-- 우노 점수제 = 다빈치 코드와 동일(고정표). 4인까지.
-- =====================================================================
alter table public.rooms drop constraint if exists rooms_game_chk;
alter table public.rooms add  constraint rooms_game_chk
  check (game is null or game in ('rummikub','davinci','splendor','uno','race','hunt','mafia'));
alter table public.users drop constraint if exists users_display_game_chk;
alter table public.users drop constraint if exists users_display_game_check;
alter table public.users add  constraint users_display_game_chk
  check (display_game is null or display_game in ('rummikub','davinci','splendor','uno','race','hunt','mafia'));
alter table public.user_game_stats drop constraint if exists user_game_stats_game_check;
alter table public.user_game_stats add  constraint user_game_stats_game_check
  check (game in ('rummikub','davinci','splendor','uno','race','hunt','mafia'));

create or replace function public.rk_leaderboard(p_game text default 'rummikub')
returns table(id uuid, username citext, real_name text, score int, wins int, losses int, streak int)
language sql security definer set search_path = public, extensions as $$
  select u.id, u.username, u.real_name, s.score, s.wins, s.losses, s.streak
  from public.user_game_stats s join public.users u on u.id = s.user_id
  where s.game = case when p_game in ('rummikub','davinci','splendor','uno','race','hunt','mafia') then p_game else 'rummikub' end
  order by s.score desc, s.wins desc, u.real_name asc limit 100;
$$;

create or replace function public.rk_set_display(p_token uuid, p_game text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_score int;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  if p_game is not null and p_game not in ('rummikub','davinci','splendor','uno','race','hunt','mafia') then raise exception 'BAD_GAME'; end if;
  update public.users set display_game = p_game where id = v_user;
  if p_game is null then return jsonb_build_object('game', null, 'score', 0); end if;
  select coalesce(score,0) into v_score from public.user_game_stats where user_id = v_user and game = p_game;
  return jsonb_build_object('game', p_game, 'score', coalesce(v_score,0));
end; $$;

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
    'davinci',  coalesce(g->'davinci',  jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'splendor', coalesce(g->'splendor', jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'uno',      coalesce(g->'uno',      jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'mafia',    coalesce(g->'mafia',    jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'race',     coalesce(g->'race',     jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)),
    'hunt',     coalesce(g->'hunt',     jsonb_build_object('score',0,'wins',0,'losses',0,'streak',0)));
  if u.display_game is null then
    disp := jsonb_build_object('game', null, 'score', 0);
  else
    ds := coalesce((g->u.display_game->>'score')::int, 0);
    disp := jsonb_build_object('game', u.display_game, 'score', ds);
  end if;
  return jsonb_build_object('id',u.id,'username',u.username,'real_name',u.real_name,
                            'display_game',u.display_game,'games',g,'display',disp,'token',u.token);
end; $$;

create or replace function public.rooms_game_guard() returns trigger as $$
declare v_newcap int;
begin
  if new.game is not null then
    if new.id between 1 and 5  and new.game not in ('rummikub','davinci','splendor','uno','mafia') then new.game := null; end if;
    if new.id between 6 and 10 and new.game not in ('race','hunt')                                then new.game := null; end if;
  end if;
  if tg_op='UPDATE' and old.game is distinct from new.game and old.status <> 'waiting' then
    new.game := old.game;
  end if;
  if tg_op='UPDATE' and new.game is distinct from old.game and new.game is not null then
    v_newcap := case new.game when 'mafia' then 12 when 'rummikub' then 4 when 'davinci' then 4 when 'splendor' then 4 when 'uno' then 4 else 8 end;
    if v_newcap <= 4 and (select count(*) from public.room_members where room_id = new.id) >= 5 then
      new.game := old.game;
    end if;
  end if;
  return new;
end; $$ language plpgsql;
drop trigger if exists trg_rooms_game_guard on public.rooms;
create trigger trg_rooms_game_guard before insert or update on public.rooms
  for each row execute function public.rooms_game_guard();

create or replace function public.rk_take_seat(p_token uuid, p_room int, p_seat int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_status text; v_game text; v_cap int;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select status, game into v_status, v_game from public.rooms where id = p_room;
  if v_status is null then raise exception 'NO_ROOM'; end if;
  if v_status <> 'waiting' then return jsonb_build_object('ok',false,'reason','not_waiting'); end if;
  v_cap := case v_game when 'mafia' then 12 when 'rummikub' then 4 when 'davinci' then 4 when 'splendor' then 4 when 'uno' then 4 when 'race' then 8 when 'hunt' then 8
                       else (case when p_room between 1 and 5 then 4 else 8 end) end;
  if p_seat < 1 or p_seat > v_cap then raise exception 'BAD_SEAT'; end if;
  if exists (select 1 from public.room_members where room_id=p_room and seat=p_seat and user_id<>v_user) then
    return jsonb_build_object('ok',false,'reason','taken');
  end if;
  if (select count(*) from public.room_members where room_id=p_room and seat is not null and user_id<>v_user) >= v_cap then
    return jsonb_build_object('ok',false,'reason','full');
  end if;
  begin
    update public.room_members set seat = p_seat, role = 'player' where room_id = p_room and user_id = v_user;
    if not found then return jsonb_build_object('ok',false,'reason','not_member'); end if;
  exception when unique_violation then return jsonb_build_object('ok',false,'reason','taken');
  end;
  return jsonb_build_object('ok',true,'seat',p_seat);
end; $$;

create or replace function public.rk_rank_points(p_game text, p_score int, p_n int, p_rank int)
returns int language plpgsql immutable set search_path = public as $$
declare
  t jsonb := '{"rummikub":{"wood":{"2":[110,0],"3":[120,90,0],"4":[150,100,50,0]},"iron":{"2":[100,-10],"3":[110,80,-10],"4":[130,100,40,-20]},"bronze":{"2":[90,-20],"3":[100,60,-20],"4":[120,90,20,-40]},"silver":{"2":[80,-30],"3":[90,50,-40],"4":[110,90,0,-60]},"gold":{"2":[70,-40],"3":[80,30,-60],"4":[100,80,-20,-80]},"platinum":{"2":[60,-50],"3":[80,20,-80],"4":[100,70,-40,-100]},"emerald":{"2":[50,-70],"3":[70,10,-100],"4":[90,60,-50,-120]},"diamond":{"2":[50,-90],"3":[70,0,-120],"4":[90,50,-60,-140]},"master":{"2":[40,-90],"3":[60,0,-130],"4":[80,50,-60,-150]},"grandmaster":{"2":[40,-110],"3":[60,-10,-140],"4":[80,40,-70,-160]},"challenger":{"2":[30,-110],"3":[50,-20,-140],"4":[70,40,-80,-170]}},"davinci":{"wood":{"2":[90,0],"3":[100,80,0],"4":[120,90,40,0]},"iron":{"2":[80,-10],"3":[100,70,-20],"4":[110,90,30,-20]},"bronze":{"2":[70,-20],"3":[90,70,-40],"4":[100,80,20,-30]},"silver":{"2":[70,-30],"3":[80,60,-50],"4":[90,80,10,-50]},"gold":{"2":[60,-40],"3":[70,50,-60],"4":[90,70,0,-70]},"platinum":{"2":[60,-50],"3":[70,40,-80],"4":[80,60,-10,-90]},"emerald":{"2":[50,-70],"3":[60,20,-100],"4":[70,50,-30,-110]},"diamond":{"2":[50,-90],"3":[60,10,-120],"4":[70,40,-40,-130]},"master":{"2":[40,-90],"3":[50,0,-120],"4":[70,40,-40,-150]},"grandmaster":{"2":[40,-110],"3":[50,-10,-130],"4":[60,30,-50,-150]},"challenger":{"2":[30,-110],"3":[40,-10,-130],"4":[50,30,-50,-160]}},"splendor":{"wood":{"2":[130,0],"3":[150,90,50],"4":[180,140,80,0]},"iron":{"2":[130,-10],"3":[150,80,20],"4":[170,130,60,-20]},"bronze":{"2":[120,-20],"3":[140,60,0],"4":[160,120,40,-40]},"silver":{"2":[110,-30],"3":[130,50,-20],"4":[150,110,20,-60]},"gold":{"2":[100,-40],"3":[120,30,-40],"4":[140,100,0,-80]},"platinum":{"2":[90,-50],"3":[110,20,-50],"4":[130,90,-10,-100]},"emerald":{"2":[80,-70],"3":[100,10,-70],"4":[120,80,-20,-120]},"diamond":{"2":[70,-90],"3":[90,0,-90],"4":[110,70,-30,-140]},"master":{"2":[60,-90],"3":[80,0,-110],"4":[100,60,-40,-150]},"grandmaster":{"2":[50,-110],"3":[70,-10,-120],"4":[90,50,-50,-160]},"challenger":{"2":[40,-110],"3":[60,-20,-130],"4":[80,40,-60,-170]}},"uno":{"wood":{"2":[90,0],"3":[100,80,0],"4":[120,90,40,0]},"iron":{"2":[80,-10],"3":[100,70,-20],"4":[110,90,30,-20]},"bronze":{"2":[70,-20],"3":[90,70,-40],"4":[100,80,20,-30]},"silver":{"2":[70,-30],"3":[80,60,-50],"4":[90,80,10,-50]},"gold":{"2":[60,-40],"3":[70,50,-60],"4":[90,70,0,-70]},"platinum":{"2":[60,-50],"3":[70,40,-80],"4":[80,60,-10,-90]},"emerald":{"2":[50,-70],"3":[60,20,-100],"4":[70,50,-30,-110]},"diamond":{"2":[50,-90],"3":[60,10,-120],"4":[70,40,-40,-130]},"master":{"2":[40,-90],"3":[50,0,-120],"4":[70,40,-40,-150]},"grandmaster":{"2":[40,-110],"3":[50,-10,-130],"4":[60,30,-50,-150]},"challenger":{"2":[30,-110],"3":[40,-10,-130],"4":[50,30,-50,-160]}}}'::jsonb;
  v_tier text; nn int; rk int; arr jsonb;
begin
  v_tier := public.rk_tier_key(p_score);
  nn := least(4, greatest(2, coalesce(p_n,2)));
  arr := t -> p_game -> v_tier -> nn::text;
  if arr is null then return 0; end if;
  rk := least(jsonb_array_length(arr), greatest(1, coalesce(p_rank, jsonb_array_length(arr))));
  return coalesce((arr ->> (rk-1))::int, 0);
end; $$;

-- 우노 정산: 손패점수 오름차순 순위(클라 ranks) → 고정표 (rk_finish_davinci 클론, game='uno')
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
  if found then raise exception 'BAD_RANKS'; end if;
  for i in 1 .. v_n loop
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

grant execute on function public.rk_finish_uno(uuid,int) to anon, authenticated;

-- =====================================================================
-- v6: 보안 전면 보강 (멱등 · 파일 끝 append · create-or-replace override)
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

-- =====================================================================
-- v7: 연승(streak) 보너스 + 등수·인원별 처리 (멱등 · create-or-replace override)
--   2인 +- / 3인 +=- / 4인 ++=- / 5인 ++=-- / 6인 ++==-- / 7인 +++=--- / 8인 +++==---
--   + = 연승+1 & 보너스 / = = 유지(보너스X) / - = 0. 보너스 = 증가분×20%×(연승-1), 최대 +100%, 증가분 + 일 때만.
--   적용: 루미/다빈치/스플렌더/우노(2~4인) + 마피아(승=+, 패=-). (전체 내용은 supabase_streak.sql 과 동일)
-- =====================================================================

create or replace function public.rk_streak_treatment(p_n int, p_rank int, p_tied boolean)
returns text language sql immutable set search_path = public as $$
  select case
    when p_rank = 1 then 'apply'
    when p_tied   then 'maintain'
    when p_n <= 2 then 'break'
    when p_n = 3 then (case p_rank when 2 then 'maintain' else 'break' end)
    when p_n = 4 then (case p_rank when 2 then 'apply' when 3 then 'maintain' else 'break' end)
    when p_n = 5 then (case p_rank when 2 then 'apply' when 3 then 'maintain' else 'break' end)
    when p_n = 6 then (case when p_rank=2 then 'apply' when p_rank in (3,4) then 'maintain' else 'break' end)
    when p_n = 7 then (case when p_rank in (2,3) then 'apply' when p_rank=4 then 'maintain' else 'break' end)
    when p_n = 8 then (case when p_rank in (2,3) then 'apply' when p_rank in (4,5) then 'maintain' else 'break' end)
    else (case when p_rank <= ceil(p_n/3.0) then 'apply'
               when p_rank <= ceil(2*p_n/3.0) then 'maintain' else 'break' end)
  end;
$$;

create or replace function public.rk_win_bonus(p_base int, p_streak int)
returns int language sql immutable set search_path = public as $$
  select case when coalesce(p_base,0) > 0 and coalesce(p_streak,0) >= 2
              then round(p_base * 0.20 * least(p_streak - 1, 5))::int else 0 end;
$$;

grant execute on function public.rk_streak_treatment(int,int,boolean) to anon, authenticated;
grant execute on function public.rk_win_bonus(int,int)                 to anon, authenticated;

create or replace function public.rk_finish_game(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb;
  v_seats text[]; v_n int; v_handpts jsonb := '{}'::jsonb; v_results jsonb := '{}'::jsonb;
  v_over boolean := false; v_passStreak int; v_sorted text[]; i int; j int; k int;
  v_rank int; v_seat text; v_uid uuid; v_won boolean; v_hp int; v_tied boolean; v_tr text; v_bonus int;
  v_cnt int; v_distinct int; v_bad int; v_pool int; v_curscore int; v_curstreak int;
  v_delta int; v_ns int; v_nstreak int; v_w int; v_l int;
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
      v_won := (v_rank = 1);
      v_tr  := public.rk_streak_treatment(v_n, v_rank, v_tied);
      v_delta := public.rk_rank_points('rummikub', v_curscore, v_n, v_rank);
      v_nstreak := case v_tr when 'apply' then v_curstreak + 1 when 'maintain' then v_curstreak else 0 end;
      v_bonus := case when v_tr = 'apply' then public.rk_win_bonus(v_delta, v_nstreak) else 0 end;
      v_delta := v_delta + v_bonus;
      v_ns := greatest(0, least(15000, v_curscore + v_delta));
      perform public.rk_bump_stats(v_uid, 'rummikub', v_ns, v_nstreak, v_won);
      v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='rummikub'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
      v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
        'rank',v_rank,'delta',v_delta,'bonus',v_bonus,'won',v_won,'handPoints',(v_handpts->>v_seat)::int,
        'prevScore',v_curscore,'newScore',v_ns,'streak',v_nstreak,'treatment',v_tr,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
    end loop;
    i := j + 1;
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  return v_results;
end; $$;

create or replace function public.rk_finish_davinci(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_ranks jsonb;
  v_seats text[]; v_n int; v_results jsonb := '{}'::jsonb;
  i int; v_seat text; v_uid uuid; v_rank int; v_curscore int; v_curstreak int; v_tied boolean; v_tr text; v_bonus int;
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
  if found then raise exception 'BAD_RANKS'; end if;
  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_rank := (v_ranks->>v_seat)::int;
    if v_rank < 1 or v_rank > v_n then raise exception 'BAD_RANK_VAL'; end if;
    v_tied := (select count(*) from unnest(v_seats) s where (v_ranks->>s)::int = v_rank) > 1;
    v_uid := (v_players->>v_seat)::uuid;
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak from public.user_game_stats where user_id=v_uid and game='davinci';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    v_won := (v_rank = 1);
    v_tr  := public.rk_streak_treatment(v_n, v_rank, v_tied);
    v_delta := public.rk_rank_points('davinci', v_curscore, v_n, v_rank);
    v_nstreak := case v_tr when 'apply' then v_curstreak + 1 when 'maintain' then v_curstreak else 0 end;
    v_bonus := case when v_tr = 'apply' then public.rk_win_bonus(v_delta, v_nstreak) else 0 end;
    v_delta := v_delta + v_bonus;
    v_ns := greatest(0, least(15000, v_curscore + v_delta));
    perform public.rk_bump_stats(v_uid, 'davinci', v_ns, v_nstreak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='davinci'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'rank',v_rank,'delta',v_delta,'bonus',v_bonus,'won',v_won,
      'prevScore',v_curscore,'newScore',v_ns,'streak',v_nstreak,'treatment',v_tr,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
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
  i int; v_seat text; v_uid uuid; v_rank int; v_curscore int; v_curstreak int; v_tied boolean; v_tr text; v_bonus int;
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
  if found then raise exception 'BAD_RANKS'; end if;
  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_rank := (v_ranks->>v_seat)::int;
    if v_rank < 1 or v_rank > v_n then raise exception 'BAD_RANK_VAL'; end if;
    v_tied := (select count(*) from unnest(v_seats) s where (v_ranks->>s)::int = v_rank) > 1;
    v_uid := (v_players->>v_seat)::uuid;
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak from public.user_game_stats where user_id=v_uid and game='uno';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    v_won := (v_rank = 1);
    v_tr  := public.rk_streak_treatment(v_n, v_rank, v_tied);
    v_delta := public.rk_rank_points('uno', v_curscore, v_n, v_rank);
    v_nstreak := case v_tr when 'apply' then v_curstreak + 1 when 'maintain' then v_curstreak else 0 end;
    v_bonus := case when v_tr = 'apply' then public.rk_win_bonus(v_delta, v_nstreak) else 0 end;
    v_delta := v_delta + v_bonus;
    v_ns := greatest(0, least(15000, v_curscore + v_delta));
    perform public.rk_bump_stats(v_uid, 'uno', v_ns, v_nstreak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='uno'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'rank',v_rank,'delta',v_delta,'bonus',v_bonus,'won',v_won,
      'prevScore',v_curscore,'newScore',v_ns,'streak',v_nstreak,'treatment',v_tr,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
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
  i int; v_seat text; v_uid uuid; v_rank int; v_curscore int; v_curstreak int; v_tied boolean; v_tr text; v_bonus int;
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
  if found then raise exception 'BAD_RANKS'; end if;
  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_rank := (v_ranks->>v_seat)::int;
    if v_rank < 1 or v_rank > v_n then raise exception 'BAD_RANK_VAL'; end if;
    v_tied := (select count(*) from unnest(v_seats) s where (v_ranks->>s)::int = v_rank) > 1;
    v_uid := (v_players->>v_seat)::uuid;
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak from public.user_game_stats where user_id=v_uid and game='splendor';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    v_won := (v_rank = 1);
    v_tr  := public.rk_streak_treatment(v_n, v_rank, v_tied);
    v_delta := public.rk_rank_points('splendor', v_curscore, v_n, v_rank);
    v_nstreak := case v_tr when 'apply' then v_curstreak + 1 when 'maintain' then v_curstreak else 0 end;
    v_bonus := case when v_tr = 'apply' then public.rk_win_bonus(v_delta, v_nstreak) else 0 end;
    v_delta := v_delta + v_bonus;
    v_ns := greatest(0, least(15000, v_curscore + v_delta));
    perform public.rk_bump_stats(v_uid, 'splendor', v_ns, v_nstreak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='splendor'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'rank',v_rank,'delta',v_delta,'bonus',v_bonus,'won',v_won,
      'points',coalesce((v_pts->>v_seat)::int,0),'cards',coalesce((v_cards->>v_seat)::int,0),
      'prevScore',v_curscore,'newScore',v_ns,'streak',v_nstreak,'treatment',v_tr,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  return v_results;
end; $$;

create or replace function public.rk_finish_mafia(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_winner text;
  v_seats text[]; v_n int; v_results jsonb := '{}'::jsonb; v_present uuid[]; v_quit boolean;
  i int; v_seat text; v_uid uuid; v_role text; v_camp text; v_won boolean;
  v_curscore int; v_curstreak int; v_delta int; v_ns int; v_nstreak int; v_w int; v_l int; v_bonus int;
  v_tierkey text; v_base int; v_contrib int; v_kills int; v_saves int; v_hits int; v_survived boolean;
  v_mbase jsonb := '{"wood":{"mwin":150,"cwin":75,"loss":0},"iron":{"mwin":135,"cwin":67,"loss":-10},"bronze":{"mwin":120,"cwin":58,"loss":-20},"silver":{"mwin":102,"cwin":47,"loss":-33},"gold":{"mwin":84,"cwin":36,"loss":-46},"platinum":{"mwin":74,"cwin":30,"loss":-59},"emerald":{"mwin":64,"cwin":24,"loss":-73},"diamond":{"mwin":54,"cwin":18,"loss":-86},"master":{"mwin":47,"cwin":15,"loss":-96},"grandmaster":{"mwin":41,"cwin":13,"loss":-106},"challenger":{"mwin":34,"cwin":10,"loss":-116}}'::jsonb;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if coalesce(v_room.game,'') <> 'mafia' then raise exception 'WRONG_GAME'; end if;
  if v_room.status <> 'playing' then return coalesce(v_room.state->'results','{}'::jsonb); end if;
  v_state := v_room.state; v_players := v_state->'players'; v_winner := v_state->>'winner';
  select array_agg(user_id) into v_present from public.room_members where room_id = p_room;
  if not exists (select 1 from jsonb_each_text(v_players) e where e.value=v_user::text) then raise exception 'NOT_A_PLAYER'; end if;
  if v_winner is null or (v_state->>'phase') <> 'end' then raise exception 'NOT_OVER'; end if;
  select array_agg(key) into v_seats from jsonb_object_keys(v_players) key;
  v_n := coalesce(array_length(v_seats,1),0);
  if v_n < 4 or v_n > 12 then raise exception 'BAD_N'; end if;

  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_uid := (v_players->>v_seat)::uuid;
    select role, kills, saves, hits into v_role, v_kills, v_saves, v_hits
      from public.mafia_secrets where room_id=p_room and seat=v_seat::int;
    v_role := coalesce(v_role,'citizen'); v_kills:=coalesce(v_kills,0); v_saves:=coalesce(v_saves,0); v_hits:=coalesce(v_hits,0);
    v_camp := case when v_role='mafia' then 'mafia' else 'citizens' end;
    v_won  := (v_camp = v_winner);
    v_survived := coalesce((v_state->'alive'->>v_seat)::boolean, false);
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak
        from public.user_game_stats where user_id=v_uid and game='mafia';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    v_tierkey := public.rk_tier_key(v_curscore);
    v_quit := (v_uid is not null and not (v_uid = any(coalesce(v_present, array[]::uuid[]))));

    if v_won and v_camp='mafia' then v_base := (v_mbase->v_tierkey->>'mwin')::int;
    elsif v_won then v_base := (v_mbase->v_tierkey->>'cwin')::int;
    else v_base := (v_mbase->v_tierkey->>'loss')::int; end if;

    if v_quit then
      v_contrib := 0; v_won := false; v_delta := (v_mbase->v_tierkey->>'loss')::int;
    else
      if v_role='mafia' then v_contrib := v_kills * 8;
      elsif v_role='police' then v_contrib := v_hits * 10;
      elsif v_role='doctor' then v_contrib := v_saves * 12;
      elsif v_survived then v_contrib := 6;
      else v_contrib := 0; end if;
      v_delta := v_base + v_contrib;
      if v_won then v_delta := greatest(v_delta, 1);
      else v_delta := least(v_delta, 0); end if;
    end if;

    v_nstreak := case when v_won then v_curstreak + 1 else 0 end;
    v_bonus := case when v_won then public.rk_win_bonus(v_delta, v_nstreak) else 0 end;
    v_delta := v_delta + v_bonus;
    v_ns := greatest(0, least(15000, v_curscore + v_delta));
    perform public.rk_bump_stats(v_uid, 'mafia', v_ns, v_nstreak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='mafia'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'role',v_role,'camp',v_camp,'won',v_won,'quit',coalesce(v_quit,false),
      'kills',v_kills,'saves',v_saves,'hits',v_hits,'survived',v_survived,'contrib',v_contrib,
      'delta',v_delta,'bonus',v_bonus,'prevScore',v_curscore,'newScore',v_ns,
      'streak',v_nstreak,'treatment',case when v_won then 'apply' else 'break' end,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  delete from public.mafia_secrets where room_id = p_room;
  return v_results;
end; $$;

-- =====================================================================
-- v8: 보안 잠금 내장 (멱등) — ⚠ 파일 맨 끝. 단일 supabase_setup.sql RUN = 항상 잠긴 최종상태.
--   위쪽(115~120행)의 permissive 정책과 구 무인증 rk_admin_reset_rooms(int[])/grant 가 무엇이든
--   여기서 읽기전용 정책 + 직접쓰기 revoke + 구 함수 drop 으로 덮어, 재실행/재설치 시 보안 회귀를 막음.
--   (supabase_lock_rls.sql 와 동일 내용. 신규 클라가 배포된 상태에서만 RUN — 현재 운영 DB는 이미 적용됨)
-- =====================================================================
drop policy if exists rooms_all     on public.rooms;
drop policy if exists members_all   on public.room_members;
drop policy if exists presence_all  on public.room_presence;
drop policy if exists rooms_read    on public.rooms;
drop policy if exists members_read  on public.room_members;
drop policy if exists presence_read on public.room_presence;
create policy rooms_read    on public.rooms        for select using (true);
create policy members_read  on public.room_members for select using (true);
create policy presence_read on public.room_presence for select using (true);
revoke insert, update, delete on public.rooms         from anon, authenticated;
revoke insert, update, delete on public.room_members  from anon, authenticated;
revoke insert, update, delete on public.room_presence from anon, authenticated;
drop function if exists public.rk_admin_reset_rooms(int[]);


-- =====================================================================
-- v9: 점수표 재설계(티어별 기댓값 기준, 10의배수.꼴등<=0.1위메리트) — 루미/다빈치/우노/스플렌더
-- =====================================================================
create or replace function public.rk_rank_points(p_game text, p_score int, p_n int, p_rank int)
returns int language plpgsql immutable set search_path = public as $$
declare
  t jsonb := '{"rummikub":{"wood":{"2":[260,0],"3":[210,180,0],"4":[200,160,160,0]},"iron":{"2":[240,0],"3":[200,160,0],"4":[180,160,140,0]},"bronze":{"2":[220,0],"3":[180,150,0],"4":[170,140,130,0]},"silver":{"2":[200,0],"3":[170,130,0],"4":[160,120,120,0]},"gold":{"2":[180,0],"3":[150,120,0],"4":[140,120,100,0]},"platinum":{"2":[120,0],"3":[110,70,0],"4":[100,80,60,0]},"emerald":{"2":[80,0],"3":[80,40,0],"4":[80,40,40,0]},"diamond":{"2":[40,0],"3":[50,10,0],"4":[50,20,10,0]},"master":{"2":[20,0],"3":[30,0,0],"4":[40,0,0,0]},"grandmaster":{"2":[10,-30],"3":[10,-10,-30],"4":[20,0,-20,-40]},"challenger":{"2":[-20,-60],"3":[-20,-40,-60],"4":[-10,-30,-50,-70]}},"davinci":{"wood":{"2":[240,0],"3":[200,160,0],"4":[180,160,140,0]},"iron":{"2":[200,0],"3":[170,130,0],"4":[160,120,120,0]},"bronze":{"2":[160,0],"3":[140,100,0],"4":[130,100,90,0]},"silver":{"2":[160,0],"3":[140,100,0],"4":[130,100,90,0]},"gold":{"2":[140,0],"3":[120,90,0],"4":[120,80,80,0]},"platinum":{"2":[100,0],"3":[90,60,0],"4":[90,60,50,0]},"emerald":{"2":[60,0],"3":[60,30,0],"4":[60,40,20,0]},"diamond":{"2":[20,0],"3":[30,0,0],"4":[40,0,0,0]},"master":{"2":[20,0],"3":[30,0,0],"4":[40,0,0,0]},"grandmaster":{"2":[10,-30],"3":[10,-10,-30],"4":[20,0,-20,-40]},"challenger":{"2":[-20,-60],"3":[-20,-40,-60],"4":[-10,-30,-50,-70]}},"splendor":{"wood":{"2":[300,0],"3":[240,210,0],"4":[220,200,180,0]},"iron":{"2":[260,0],"3":[210,180,0],"4":[200,160,160,0]},"bronze":{"2":[240,0],"3":[200,160,0],"4":[180,160,140,0]},"silver":{"2":[220,0],"3":[180,150,0],"4":[170,140,130,0]},"gold":{"2":[180,0],"3":[150,120,0],"4":[140,120,100,0]},"platinum":{"2":[140,0],"3":[120,90,0],"4":[120,80,80,0]},"emerald":{"2":[100,0],"3":[90,60,0],"4":[90,60,50,0]},"diamond":{"2":[60,0],"3":[60,30,0],"4":[60,40,20,0]},"master":{"2":[10,-30],"3":[10,-10,-30],"4":[20,0,-20,-40]},"grandmaster":{"2":[10,-30],"3":[10,-10,-30],"4":[20,0,-20,-40]},"challenger":{"2":[-20,-60],"3":[-20,-40,-60],"4":[-10,-30,-50,-70]}},"uno":{"wood":{"2":[220,0],"3":[180,150,0],"4":[170,140,130,0]},"iron":{"2":[180,0],"3":[150,120,0],"4":[140,120,100,0]},"bronze":{"2":[140,0],"3":[120,90,0],"4":[120,80,80,0]},"silver":{"2":[100,0],"3":[90,60,0],"4":[90,60,50,0]},"gold":{"2":[80,0],"3":[80,40,0],"4":[80,40,40,0]},"platinum":{"2":[60,0],"3":[60,30,0],"4":[60,40,20,0]},"emerald":{"2":[40,0],"3":[50,10,0],"4":[50,20,10,0]},"diamond":{"2":[20,0],"3":[30,0,0],"4":[40,0,0,0]},"master":{"2":[10,-30],"3":[10,-10,-30],"4":[20,0,-20,-40]},"grandmaster":{"2":[0,-40],"3":[0,-20,-40],"4":[10,-10,-30,-50]},"challenger":{"2":[-20,-60],"3":[-20,-40,-60],"4":[-10,-30,-50,-70]}}}'::jsonb;
  v_tier text; nn int; rk int; arr jsonb;
begin
  v_tier := public.rk_tier_key(p_score);
  nn := least(4, greatest(2, coalesce(p_n,2)));
  arr := t -> p_game -> v_tier -> nn::text;
  if arr is null then return 0; end if;
  rk := least(jsonb_array_length(arr), greatest(1, coalesce(p_rank, jsonb_array_length(arr))));
  return coalesce((arr ->> (rk-1))::int, 0);
end; $$;
grant execute on function public.rk_rank_points(text,int,int,int) to anon, authenticated;


-- =====================================================================
-- v10: 점수표 재설계(등수·티어·인원 규칙) — 보드4종 rk_rank_points + 운빨대시 표기반 rk_finish_race
-- =====================================================================
create or replace function public.rk_rank_points(p_game text, p_score int, p_n int, p_rank int)
returns int language plpgsql immutable set search_path = public as $$
declare
  t jsonb := '{"rummikub":{"wood":{"2":[120,0],"3":[150,90,0],"4":[220,160,140,0]},"iron":{"2":[130,-10],"3":[160,90,-10],"4":[210,160,130,-20]},"bronze":{"2":[120,-20],"3":[150,90,-30],"4":[210,140,130,-40]},"silver":{"2":[130,-30],"3":[160,90,-40],"4":[200,140,120,-60]},"gold":{"2":[120,-40],"3":[150,90,-60],"4":[190,140,110,-80]},"platinum":{"2":[110,-50],"3":[130,60,-70],"4":[160,100,80,-100]},"emerald":{"2":[100,-60],"3":[120,50,-80],"4":[140,80,60,-120]},"diamond":{"2":[90,-70],"3":[100,30,-100],"4":[120,60,40,-140]},"master":{"2":[70,-70],"3":[100,30,-100],"4":[110,50,30,-150]},"grandmaster":{"2":[60,-80],"3":[70,10,-110],"4":[90,20,10,-160]},"challenger":{"2":[40,-80],"3":[50,-20,-120],"4":[50,-10,-30,-170]}},"davinci":{"wood":{"2":[120,0],"3":[150,90,0],"4":[210,140,130,0]},"iron":{"2":[110,-10],"3":[140,80,-10],"4":[190,120,110,-20]},"bronze":{"2":[100,-20],"3":[120,60,-30],"4":[170,100,90,-40]},"silver":{"2":[110,-30],"3":[130,60,-40],"4":[170,120,90,-60]},"gold":{"2":[100,-40],"3":[140,70,-60],"4":[170,100,90,-80]},"platinum":{"2":[90,-50],"3":[110,50,-70],"4":[150,80,70,-100]},"emerald":{"2":[80,-60],"3":[100,40,-80],"4":[130,60,50,-120]},"diamond":{"2":[70,-70],"3":[100,30,-100],"4":[110,40,30,-140]},"master":{"2":[70,-70],"3":[100,30,-100],"4":[110,50,30,-150]},"grandmaster":{"2":[60,-80],"3":[70,10,-110],"4":[90,20,10,-160]},"challenger":{"2":[40,-80],"3":[50,-20,-120],"4":[50,-10,-30,-170]}},"splendor":{"wood":{"2":[140,0],"3":[180,120,0],"4":[250,180,170,0]},"iron":{"2":[130,-10],"3":[160,90,-10],"4":[230,160,150,-20]},"bronze":{"2":[140,-20],"3":[170,100,-30],"4":[220,160,140,-40]},"silver":{"2":[130,-30],"3":[160,90,-40],"4":[210,160,130,-60]},"gold":{"2":[120,-40],"3":[150,90,-60],"4":[190,140,110,-80]},"platinum":{"2":[110,-50],"3":[140,80,-70],"4":[170,120,90,-100]},"emerald":{"2":[100,-60],"3":[120,50,-80],"4":[150,100,70,-120]},"diamond":{"2":[90,-70],"3":[110,50,-100],"4":[130,80,50,-140]},"master":{"2":[50,-70],"3":[70,0,-100],"4":[80,30,0,-150]},"grandmaster":{"2":[60,-80],"3":[70,10,-110],"4":[90,20,10,-160]},"challenger":{"2":[40,-80],"3":[50,-20,-120],"4":[50,-10,-30,-170]}},"uno":{"wood":{"2":[100,0],"3":[140,70,0],"4":[190,140,110,0]},"iron":{"2":[90,-10],"3":[130,60,-10],"4":[170,120,90,-20]},"bronze":{"2":[80,-20],"3":[120,60,-30],"4":[150,100,70,-40]},"silver":{"2":[70,-30],"3":[100,30,-40],"4":[130,80,50,-60]},"gold":{"2":[80,-40],"3":[110,40,-60],"4":[130,60,50,-80]},"platinum":{"2":[70,-50],"3":[100,30,-70],"4":[120,60,40,-100]},"emerald":{"2":[80,-60],"3":[90,20,-80],"4":[110,60,30,-120]},"diamond":{"2":[70,-70],"3":[100,30,-100],"4":[110,40,30,-140]},"master":{"2":[50,-70],"3":[70,0,-100],"4":[80,30,0,-150]},"grandmaster":{"2":[60,-80],"3":[70,10,-110],"4":[70,20,-10,-160]},"challenger":{"2":[40,-80],"3":[50,-20,-120],"4":[50,-10,-30,-170]}},"race":{"wood":{"2":[100,0],"3":[140,70,0],"4":[180,120,100,0],"5":[190,110,110,90,0],"6":[190,140,110,90,70,0],"7":[200,140,120,100,80,60,0],"8":[210,140,130,110,90,70,50,0]},"iron":{"2":[90,-10],"3":[110,50,-10],"4":[160,100,80,-20],"5":[170,90,90,70,-20],"6":[170,120,90,70,50,-20],"7":[180,120,100,80,60,40,-20],"8":[190,120,110,90,70,50,30,-20]},"bronze":{"2":[80,-20],"3":[110,40,-30],"4":[140,80,60,-40],"5":[150,70,70,50,-40],"6":[150,100,70,50,30,-40],"7":[160,100,80,60,40,20,-40],"8":[170,100,90,70,50,30,10,-40]},"silver":{"2":[70,-30],"3":[100,30,-40],"4":[120,60,40,-60],"5":[130,50,50,30,-60],"6":[130,80,50,30,10,-60],"7":[140,80,60,40,20,0,-60],"8":[150,80,70,50,30,10,-10,-60]},"gold":{"2":[60,-40],"3":[90,30,-60],"4":[110,60,30,-80],"5":[120,50,40,20,-80],"6":[120,80,40,20,0,-80],"7":[130,80,50,30,10,-10,-80],"8":[140,80,60,40,20,0,-20,-80]},"platinum":{"2":[70,-50],"3":[80,20,-70],"4":[110,40,30,-100],"5":[110,50,30,10,-100],"6":[120,40,40,20,0,-100],"7":[120,80,40,20,0,-20,-100],"8":[130,80,50,30,10,-10,-30,-100]},"emerald":{"2":[60,-60],"3":[90,20,-80],"4":[100,40,20,-120],"5":[100,50,20,0,-120],"6":[110,40,30,10,-10,-120],"7":[120,30,30,20,0,-20,-120],"8":[120,80,40,20,0,-20,-40,-120]},"diamond":{"2":[70,-70],"3":[80,20,-100],"4":[90,40,10,-140],"5":[100,20,20,0,-140],"6":[100,40,20,0,-20,-140],"7":[110,30,30,10,-10,-30,-140],"8":[110,80,30,10,-10,-30,-50,-140]},"master":{"2":[50,-70],"3":[70,0,-100],"4":[80,30,0,-150],"5":[90,10,10,-10,-150],"6":[90,30,10,-10,-30,-150],"7":[100,20,20,0,-20,-40,-150],"8":[100,70,20,0,-20,-40,-60,-150]},"grandmaster":{"2":[60,-80],"3":[70,10,-110],"4":[70,20,-10,-160],"5":[80,0,0,-20,-160],"6":[80,20,0,-20,-40,-160],"7":[90,10,10,-10,-30,-50,-160],"8":[90,60,10,-10,-30,-50,-70,-160]},"challenger":{"2":[40,-80],"3":[50,-20,-120],"4":[50,-10,-30,-170],"5":[50,0,-30,-50,-170],"6":[60,-10,-20,-40,-60,-170],"7":[70,-20,-20,-30,-50,-70,-170],"8":[70,30,-10,-30,-50,-70,-90,-170]}}}'::jsonb;
  v_tier text; nn int; rk int; arr jsonb;
begin
  v_tier := public.rk_tier_key(p_score);
  nn := least(8, greatest(2, coalesce(p_n,2)));
  arr := t -> p_game -> v_tier -> nn::text;
  if arr is null then return 0; end if;
  rk := least(jsonb_array_length(arr), greatest(1, coalesce(p_rank, jsonb_array_length(arr))));
  return coalesce((arr ->> (rk-1))::int, 0);
end; $$;
grant execute on function public.rk_rank_points(text,int,int,int) to anon, authenticated;

create or replace function public.rk_finish_race(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_ranks jsonb;
  v_seats text[]; v_n int; v_results jsonb := '{}'::jsonb;
  i int; v_seat text; v_uid uuid; v_rank int; v_tied boolean; v_cnt int;
  v_curscore int; v_curstreak int; v_won boolean; v_tr text; v_delta int; v_bonus int; v_ns int; v_nstreak int; v_w int; v_l int;
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
  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_rank := (v_ranks->>v_seat)::int;
    if v_rank < 1 or v_rank > v_n then raise exception 'BAD_RANK_VAL'; end if;
    select count(*) into v_cnt from unnest(v_seats) s where (v_ranks->>s)::int = v_rank; v_tied := v_cnt > 1;
    v_uid := (v_players->>v_seat)::uuid;
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then
      select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak from public.user_game_stats where user_id=v_uid and game='race';
      v_curscore := coalesce(v_curscore,0); v_curstreak := coalesce(v_curstreak,0);
    end if;
    v_won := (v_rank = 1);
    v_tr  := public.rk_streak_treatment(v_n, v_rank, v_tied);
    v_delta := public.rk_rank_points('race', v_curscore, v_n, v_rank);
    v_nstreak := case v_tr when 'apply' then v_curstreak+1 when 'maintain' then v_curstreak else 0 end;
    v_bonus := case when v_tr='apply' then public.rk_win_bonus(v_delta, v_nstreak) else 0 end;
    v_delta := v_delta + v_bonus;
    v_ns := greatest(0, least(15000, v_curscore + v_delta));
    perform public.rk_bump_stats(v_uid, 'race', v_ns, v_nstreak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='race'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object(
      'rank',v_rank,'delta',v_delta,'bonus',v_bonus,'won',v_won,
      'prevScore',v_curscore,'newScore',v_ns,'streak',v_nstreak,'treatment',v_tr,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  return v_results;
end; $$;
grant execute on function public.rk_finish_race(uuid,int) to anon, authenticated;


-- =====================================================================
-- v11: 점수표 재설계(등수 분포 규칙·5배수·티어 단조) — rk_rank_points(보드4종+운빨대시)
-- =====================================================================
create or replace function public.rk_rank_points(p_game text, p_score int, p_n int, p_rank int)
returns int language plpgsql immutable set search_path = public as $$
declare
  t jsonb := '{"rummikub":{"wood":{"2":[220,0],"3":[220,65,0],"4":[275,230,15,0]},"iron":{"2":[210,-20],"3":[210,60,-20],"4":[265,225,10,-20]},"bronze":{"2":[205,-40],"3":[205,55,-40],"4":[255,220,5,-40]},"silver":{"2":[205,-65],"3":[205,40,-65],"4":[255,220,-10,-65]},"gold":{"2":[205,-90],"3":[205,25,-90],"4":[255,220,-25,-90]},"platinum":{"2":[200,-155],"3":[200,-20,-155],"4":[250,215,-70,-155]},"emerald":{"2":[195,-195],"3":[195,-50,-195],"4":[245,210,-100,-195]},"diamond":{"2":[190,-235],"3":[190,-80,-235],"4":[240,205,-130,-235]},"master":{"2":[190,-260],"3":[190,-95,-260],"4":[240,205,-145,-260]},"grandmaster":{"2":[190,-300],"3":[190,-125,-300],"4":[235,200,-175,-300]},"challenger":{"2":[185,-365],"3":[185,-170,-365],"4":[230,195,-220,-365]}},"davinci":{"wood":{"2":[200,0],"3":[200,65,0],"4":[250,215,15,0]},"iron":{"2":[180,-40],"3":[180,60,-40],"4":[225,205,10,-40]},"bronze":{"2":[160,-80],"3":[160,55,-80],"4":[200,195,5,-80]},"silver":{"2":[160,-80],"3":[160,55,-80],"4":[200,195,5,-80]},"gold":{"2":[160,-105],"3":[160,40,-105],"4":[200,195,-10,-105]},"platinum":{"2":[155,-145],"3":[155,10,-145],"4":[195,190,-40,-145]},"emerald":{"2":[150,-185],"3":[150,-20,-185],"4":[190,185,-70,-185]},"diamond":{"2":[150,-225],"3":[150,-50,-225],"4":[185,180,-100,-225]},"master":{"2":[150,-225],"3":[150,-50,-225],"4":[185,180,-100,-225]},"grandmaster":{"2":[145,-265],"3":[145,-80,-265],"4":[180,175,-130,-265]},"challenger":{"2":[140,-330],"3":[140,-125,-330],"4":[175,170,-175,-330]}},"uno":{"wood":{"2":[185,0],"3":[185,65,0],"4":[230,195,15,0]},"iron":{"2":[165,-40],"3":[165,60,-40],"4":[205,185,10,-40]},"bronze":{"2":[145,-80],"3":[145,55,-80],"4":[180,175,5,-80]},"silver":{"2":[140,-120],"3":[140,25,-120],"4":[175,170,-25,-120]},"gold":{"2":[140,-145],"3":[140,10,-145],"4":[175,170,-40,-145]},"platinum":{"2":[140,-170],"3":[140,-5,-170],"4":[175,170,-55,-170]},"emerald":{"2":[140,-195],"3":[140,-20,-195],"4":[175,170,-70,-195]},"diamond":{"2":[140,-220],"3":[140,-35,-220],"4":[175,170,-85,-220]},"master":{"2":[135,-260],"3":[135,-65,-260],"4":[170,165,-115,-260]},"grandmaster":{"2":[135,-285],"3":[135,-80,-285],"4":[170,165,-130,-285]},"challenger":{"2":[130,-325],"3":[130,-110,-325],"4":[165,160,-160,-325]}},"splendor":{"wood":{"2":[250,0],"3":[250,65,0],"4":[315,270,15,0]},"iron":{"2":[230,-40],"3":[230,60,-40],"4":[290,260,10,-40]},"bronze":{"2":[225,-60],"3":[225,55,-60],"4":[280,255,5,-60]},"silver":{"2":[225,-85],"3":[225,40,-85],"4":[280,255,-10,-85]},"gold":{"2":[220,-125],"3":[220,10,-125],"4":[275,250,-40,-125]},"platinum":{"2":[215,-165],"3":[215,-20,-165],"4":[270,245,-70,-165]},"emerald":{"2":[210,-205],"3":[210,-50,-205],"4":[265,240,-100,-205]},"diamond":{"2":[210,-245],"3":[210,-80,-245],"4":[260,235,-130,-245]},"master":{"2":[205,-330],"3":[205,-140,-330],"4":[255,225,-190,-330]},"grandmaster":{"2":[205,-330],"3":[205,-140,-330],"4":[255,225,-190,-330]},"challenger":{"2":[200,-395],"3":[200,-185,-395],"4":[250,220,-235,-395]}},"race":{"wood":{"2":[170,0],"3":[170,65,0],"4":[210,175,15,0],"5":[260,225,10,5,0],"6":[310,260,15,10,5,0],"7":[350,300,20,15,10,5,0],"8":[390,335,25,20,15,10,5,0]},"iron":{"2":[150,-40],"3":[150,60,-40],"4":[185,165,10,-40],"5":[255,215,-10,-25,-35],"6":[305,250,0,-15,-25,-35],"7":[345,290,5,-5,-15,-25,-35],"8":[385,325,10,0,-5,-15,-25,-35]},"bronze":{"2":[130,-80],"3":[130,55,-80],"4":[160,155,5,-80],"5":[250,205,-30,-55,-70],"6":[300,240,-15,-40,-55,-70],"7":[340,280,-10,-25,-40,-55,-70],"8":[380,315,-5,-20,-25,-40,-55,-70]},"silver":{"2":[125,-120],"3":[125,25,-120],"4":[155,150,-25,-120],"5":[245,200,-55,-85,-105],"6":[295,235,-35,-65,-85,-105],"7":[335,275,-30,-45,-65,-85,-105],"8":[375,310,-20,-40,-50,-65,-85,-105]},"gold":{"2":[125,-145],"3":[125,10,-145],"4":[155,150,-40,-145],"5":[245,200,-65,-100,-130],"6":[295,235,-45,-80,-100,-125],"7":[335,275,-40,-55,-80,-100,-125],"8":[375,310,-30,-50,-60,-80,-100,-125]},"platinum":{"2":[125,-170],"3":[125,-5,-170],"4":[155,150,-55,-170],"5":[245,200,-75,-115,-155],"6":[295,235,-55,-95,-115,-145],"7":[335,275,-50,-65,-95,-115,-145],"8":[375,310,-40,-60,-70,-95,-115,-145]},"emerald":{"2":[125,-195],"3":[125,-20,-195],"4":[155,150,-70,-195],"5":[245,200,-85,-130,-180],"6":[295,235,-65,-110,-130,-165],"7":[335,275,-60,-75,-110,-130,-165],"8":[375,310,-50,-70,-80,-110,-130,-165]},"diamond":{"2":[125,-220],"3":[125,-35,-220],"4":[155,150,-85,-220],"5":[245,200,-95,-145,-205],"6":[295,235,-75,-125,-145,-185],"7":[335,275,-70,-85,-125,-145,-185],"8":[375,310,-60,-80,-90,-125,-145,-185]},"master":{"2":[125,-245],"3":[125,-50,-245],"4":[155,150,-100,-245],"5":[245,200,-105,-160,-230],"6":[295,235,-85,-140,-160,-205],"7":[335,275,-80,-95,-140,-160,-205],"8":[375,310,-70,-90,-100,-140,-160,-205]},"grandmaster":{"2":[125,-270],"3":[125,-65,-270],"4":[155,150,-115,-270],"5":[245,200,-115,-175,-255],"6":[295,235,-95,-155,-175,-225],"7":[335,275,-90,-105,-155,-175,-225],"8":[375,310,-80,-100,-110,-155,-175,-225]},"challenger":{"2":[120,-310],"3":[120,-95,-310],"4":[150,145,-145,-310],"5":[240,195,-140,-205,-290],"6":[290,230,-115,-180,-205,-260],"7":[330,270,-105,-125,-180,-205,-265],"8":[375,305,-95,-120,-135,-185,-205,-260]}}}'::jsonb;
  v_tier text; nn int; rk int; arr jsonb;
begin
  v_tier := public.rk_tier_key(p_score);
  nn := least(8, greatest(2, coalesce(p_n,2)));
  arr := t -> p_game -> v_tier -> nn::text;
  if arr is null then return 0; end if;
  rk := least(jsonb_array_length(arr), greatest(1, coalesce(p_rank, jsonb_array_length(arr))));
  return coalesce((arr ->> (rk-1))::int, 0);
end; $$;
grant execute on function public.rk_rank_points(text,int,int,int) to anon, authenticated;


-- =====================================================================
-- v12: 2인1위<3인1위<4인1위 + 마피아 단조 win/패(고티어 역전 제거)
-- =====================================================================
create or replace function public.rk_rank_points(p_game text, p_score int, p_n int, p_rank int)
returns int language plpgsql immutable set search_path = public as $$
declare
  t jsonb := '{"rummikub":{"wood":{"2":[165,0],"3":[220,65,0],"4":[275,230,15,0]},"iron":{"2":[160,-20],"3":[210,60,-20],"4":[265,225,10,-20]},"bronze":{"2":[155,-40],"3":[205,55,-40],"4":[255,220,5,-40]},"silver":{"2":[155,-65],"3":[205,40,-65],"4":[255,220,-10,-65]},"gold":{"2":[155,-90],"3":[205,25,-90],"4":[255,220,-25,-90]},"platinum":{"2":[150,-155],"3":[200,-20,-155],"4":[250,215,-70,-155]},"emerald":{"2":[145,-195],"3":[195,-50,-195],"4":[245,210,-100,-195]},"diamond":{"2":[145,-235],"3":[190,-80,-235],"4":[240,205,-130,-235]},"master":{"2":[145,-260],"3":[190,-95,-260],"4":[240,205,-145,-340]},"grandmaster":{"2":[140,-300],"3":[190,-125,-300],"4":[235,200,-175,-340]},"challenger":{"2":[140,-365],"3":[185,-170,-365],"4":[230,195,-220,-365]}},"davinci":{"wood":{"2":[150,0],"3":[200,65,0],"4":[250,215,15,0]},"iron":{"2":[135,-40],"3":[180,60,-40],"4":[225,185,10,-20]},"bronze":{"2":[120,-80],"3":[160,55,-80],"4":[200,160,5,-45]},"silver":{"2":[120,-80],"3":[160,55,-80],"4":[200,160,5,-45]},"gold":{"2":[120,-105],"3":[160,40,-105],"4":[200,160,-10,-70]},"platinum":{"2":[115,-145],"3":[155,10,-145],"4":[195,155,-40,-110]},"emerald":{"2":[115,-185],"3":[150,-20,-185],"4":[190,150,-70,-150]},"diamond":{"2":[110,-225],"3":[150,-50,-225],"4":[185,145,-100,-190]},"master":{"2":[110,-225],"3":[150,-50,-225],"4":[185,145,-100,-270]},"grandmaster":{"2":[110,-265],"3":[145,-80,-265],"4":[180,140,-130,-270]},"challenger":{"2":[105,-330],"3":[140,-125,-330],"4":[175,135,-175,-295]}},"uno":{"wood":{"2":[140,0],"3":[185,65,0],"4":[230,195,15,0]},"iron":{"2":[125,-40],"3":[165,60,-40],"4":[205,165,10,-20]},"bronze":{"2":[110,-80],"3":[145,55,-80],"4":[180,140,5,-45]},"silver":{"2":[105,-120],"3":[140,25,-120],"4":[175,135,-25,-85]},"gold":{"2":[105,-145],"3":[140,10,-145],"4":[175,135,-40,-110]},"platinum":{"2":[105,-170],"3":[140,-5,-170],"4":[175,135,-55,-135]},"emerald":{"2":[105,-195],"3":[140,-20,-195],"4":[175,135,-70,-160]},"diamond":{"2":[105,-220],"3":[140,-35,-220],"4":[175,135,-85,-185]},"master":{"2":[100,-260],"3":[135,-65,-260],"4":[170,130,-115,-185]},"grandmaster":{"2":[100,-285],"3":[135,-80,-285],"4":[170,130,-130,-210]},"challenger":{"2":[100,-325],"3":[130,-110,-325],"4":[165,125,-160,-290]}},"splendor":{"wood":{"2":[190,0],"3":[250,65,0],"4":[315,270,15,0]},"iron":{"2":[175,-40],"3":[230,60,-40],"4":[290,250,10,-30]},"bronze":{"2":[170,-60],"3":[225,55,-60],"4":[280,240,5,-45]},"silver":{"2":[170,-85],"3":[225,40,-85],"4":[280,240,-10,-70]},"gold":{"2":[165,-125],"3":[220,10,-125],"4":[275,235,-40,-110]},"platinum":{"2":[160,-165],"3":[215,-20,-165],"4":[270,230,-70,-150]},"emerald":{"2":[160,-205],"3":[210,-50,-205],"4":[265,225,-100,-190]},"diamond":{"2":[155,-245],"3":[210,-80,-245],"4":[260,220,-130,-230]},"master":{"2":[155,-330],"3":[205,-140,-330],"4":[255,215,-190,-320]},"grandmaster":{"2":[155,-330],"3":[205,-140,-330],"4":[255,215,-190,-320]},"challenger":{"2":[150,-395],"3":[200,-185,-395],"4":[250,210,-235,-385]}},"race":{"wood":{"2":[125,0],"3":[170,65,0],"4":[210,175,15,0],"5":[260,225,10,5,0],"6":[310,260,15,10,5,0],"7":[350,300,20,15,10,5,0],"8":[390,335,25,20,15,10,5,0]},"iron":{"2":[110,-40],"3":[150,60,-40],"4":[185,145,10,-20],"5":[255,215,-10,-25,-35],"6":[305,250,0,-15,-25,-35],"7":[345,290,5,-5,-15,-25,-35],"8":[385,325,10,0,-5,-15,-25,-35]},"bronze":{"2":[95,-80],"3":[130,55,-80],"4":[160,120,5,-45],"5":[250,205,-30,-55,-70],"6":[300,240,-15,-40,-55,-70],"7":[340,280,-10,-25,-40,-55,-70],"8":[380,315,-5,-20,-25,-40,-55,-70]},"silver":{"2":[95,-120],"3":[125,25,-120],"4":[155,115,-25,-85],"5":[245,200,-55,-85,-105],"6":[295,235,-35,-65,-85,-105],"7":[335,275,-30,-45,-65,-85,-105],"8":[375,310,-20,-40,-50,-65,-85,-105]},"gold":{"2":[95,-145],"3":[125,10,-145],"4":[155,115,-40,-110],"5":[245,200,-65,-100,-130],"6":[295,235,-45,-80,-100,-125],"7":[335,275,-40,-55,-80,-100,-125],"8":[375,310,-30,-50,-60,-80,-100,-125]},"platinum":{"2":[95,-170],"3":[125,-5,-170],"4":[155,115,-55,-135],"5":[245,200,-75,-115,-155],"6":[295,235,-55,-95,-115,-145],"7":[335,275,-50,-65,-95,-115,-145],"8":[375,310,-40,-60,-70,-95,-115,-145]},"emerald":{"2":[95,-195],"3":[125,-20,-195],"4":[155,115,-70,-160],"5":[245,200,-85,-130,-180],"6":[295,235,-65,-110,-130,-165],"7":[335,275,-60,-75,-110,-130,-165],"8":[375,310,-50,-70,-80,-110,-130,-165]},"diamond":{"2":[95,-220],"3":[125,-35,-220],"4":[155,115,-85,-185],"5":[245,200,-95,-145,-205],"6":[295,235,-75,-125,-145,-185],"7":[335,275,-70,-85,-125,-145,-185],"8":[375,310,-60,-80,-90,-125,-145,-185]},"master":{"2":[95,-245],"3":[125,-50,-245],"4":[155,115,-100,-210],"5":[245,200,-105,-160,-230],"6":[295,235,-85,-140,-160,-205],"7":[335,275,-80,-95,-140,-160,-205],"8":[375,310,-70,-90,-100,-140,-160,-205]},"grandmaster":{"2":[95,-270],"3":[125,-65,-270],"4":[155,115,-115,-235],"5":[245,200,-115,-175,-255],"6":[295,235,-95,-155,-175,-225],"7":[335,275,-90,-105,-155,-175,-225],"8":[375,310,-80,-100,-110,-155,-175,-225]},"challenger":{"2":[90,-310],"3":[120,-95,-310],"4":[150,110,-145,-275],"5":[240,195,-140,-205,-290],"6":[290,230,-115,-180,-205,-260],"7":[330,270,-105,-125,-180,-205,-265],"8":[375,305,-95,-120,-135,-185,-205,-260]}}}'::jsonb;
  v_tier text; nn int; rk int; arr jsonb;
begin
  v_tier := public.rk_tier_key(p_score);
  nn := least(8, greatest(2, coalesce(p_n,2)));
  arr := t -> p_game -> v_tier -> nn::text;
  if arr is null then return 0; end if;
  rk := least(jsonb_array_length(arr), greatest(1, coalesce(p_rank, jsonb_array_length(arr))));
  return coalesce((arr ->> (rk-1))::int, 0);
end; $$;
grant execute on function public.rk_rank_points(text,int,int,int) to anon, authenticated;

create or replace function public.rk_finish_mafia(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_winner text;
  v_seats text[]; v_n int; v_results jsonb := '{}'::jsonb; v_present uuid[]; v_quit boolean;
  i int; v_seat text; v_uid uuid; v_role text; v_camp text; v_won boolean;
  v_curscore int; v_curstreak int; v_delta int; v_ns int; v_nstreak int; v_w int; v_l int; v_bonus int;
  v_tierkey text; v_base int; v_contrib int; v_kills int; v_saves int; v_hits int; v_survived boolean;
  v_ev4 numeric; v_kc numeric; v_evn numeric; v_p numeric; v_pc numeric;
  -- 확률가중 EV 모델: EV4=4인 기준 기대값, K=티어별 변동폭, pmaf=마피아 진영 승률(인원수별)
  v_ev jsonb := '{"wood":120,"iron":100,"bronze":90,"silver":80,"gold":70,"platinum":50,"emerald":30,"diamond":10,"master":10,"grandmaster":-10,"challenger":-40}'::jsonb;
  v_kk jsonb := '{"wood":240,"iron":260,"bronze":280,"silver":280,"gold":290,"platinum":310,"emerald":330,"diamond":350,"master":350,"grandmaster":370,"challenger":400}'::jsonb;
  v_pmaf jsonb := '{"4":0.48,"5":0.46,"6":0.44,"7":0.42,"8":0.40,"9":0.38,"10":0.36,"11":0.35,"12":0.33}'::jsonb;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then raise exception 'BAD_TOKEN'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'NO_ROOM'; end if;
  if coalesce(v_room.game,'') <> 'mafia' then raise exception 'WRONG_GAME'; end if;
  if v_room.status <> 'playing' then return coalesce(v_room.state->'results','{}'::jsonb); end if;
  v_state := v_room.state; v_players := v_state->'players'; v_winner := v_state->>'winner';
  select array_agg(user_id) into v_present from public.room_members where room_id = p_room;
  if not exists (select 1 from jsonb_each_text(v_players) e where e.value=v_user::text) then raise exception 'NOT_A_PLAYER'; end if;
  if v_winner is null or (v_state->>'phase') <> 'end' then raise exception 'NOT_OVER'; end if;
  select array_agg(key) into v_seats from jsonb_object_keys(v_players) key;
  v_n := coalesce(array_length(v_seats,1),0);
  if v_n < 4 or v_n > 12 then raise exception 'BAD_N'; end if;
  v_p := coalesce((v_pmaf->>v_n::text)::numeric, 0.40);   -- 마피아 진영 승률(인원수별)
  for i in 1 .. v_n loop
    v_seat := v_seats[i]; v_uid := (v_players->>v_seat)::uuid;
    select role, kills, saves, hits into v_role, v_kills, v_saves, v_hits from public.mafia_secrets where room_id=p_room and seat=v_seat::int;
    v_role := coalesce(v_role,'citizen'); v_kills:=coalesce(v_kills,0); v_saves:=coalesce(v_saves,0); v_hits:=coalesce(v_hits,0);
    v_camp := case when v_role='mafia' then 'mafia' else 'citizens' end;
    v_won  := (v_camp = v_winner);
    v_survived := coalesce((v_state->'alive'->>v_seat)::boolean, false);
    v_curscore := 0; v_curstreak := 0;
    if v_uid is not null then select coalesce(score,0), coalesce(streak,0) into v_curscore, v_curstreak from public.user_game_stats where user_id=v_uid and game='mafia'; v_curscore:=coalesce(v_curscore,0); v_curstreak:=coalesce(v_curstreak,0); end if;
    v_tierkey := public.rk_tier_key(v_curscore);
    v_quit := (v_uid is not null and not (v_uid = any(coalesce(v_present, array[]::uuid[]))));
    -- 확률가중 EV: EV_n=(n/4)·EV4, pc=진영 승률(마피아=p, 시민=1-p), 승=EV_n+K(1-pc)·패=EV_n-K·pc
    v_ev4 := (v_ev->>v_tierkey)::numeric; v_kc := (v_kk->>v_tierkey)::numeric;
    v_evn := round( (v_n::numeric / 4.0) * v_ev4 );
    v_pc  := case when v_camp='mafia' then v_p else 1.0 - v_p end;
    if v_quit then
      v_contrib := 0; v_won := false;
      v_delta := round( v_evn - v_kc * v_pc )::int;          -- 중퇴=진영 패점 처리
    else
      if v_won then v_base := round( v_evn + v_kc * (1.0 - v_pc) )::int;
      else           v_base := round( v_evn - v_kc * v_pc )::int; end if;
      if v_role='mafia' then v_contrib := v_kills * 8; elsif v_role='police' then v_contrib := v_hits * 10; elsif v_role='doctor' then v_contrib := v_saves * 12; elsif v_survived then v_contrib := 6; else v_contrib := 0; end if;
      v_delta := v_base + v_contrib;
      if v_won then v_delta := greatest(v_delta, 1); end if;  -- 승리진영 최소 +1(패배는 EV 정확성 위해 미클램프)
    end if;
    v_nstreak := case when v_won then v_curstreak + 1 else 0 end;
    v_bonus := case when v_won then public.rk_win_bonus(v_delta, v_nstreak) else 0 end;
    v_delta := v_delta + v_bonus;
    v_ns := greatest(0, least(15000, v_curscore + v_delta));
    perform public.rk_bump_stats(v_uid, 'mafia', v_ns, v_nstreak, v_won);
    v_w:=0; v_l:=0; if v_uid is not null then select wins,losses into v_w,v_l from public.user_game_stats where user_id=v_uid and game='mafia'; v_w:=coalesce(v_w,0); v_l:=coalesce(v_l,0); end if;
    v_results := jsonb_set(v_results, array[v_seat], jsonb_build_object('role',v_role,'camp',v_camp,'won',v_won,'quit',coalesce(v_quit,false),'kills',v_kills,'saves',v_saves,'hits',v_hits,'survived',v_survived,'contrib',v_contrib,'delta',v_delta,'bonus',v_bonus,'prevScore',v_curscore,'newScore',v_ns,'streak',v_nstreak,'treatment',case when v_won then 'apply' else 'break' end,'prevStreak',v_curstreak,'wins',v_w,'losses',v_l));
  end loop;
  v_state := jsonb_set(v_state, '{results}', v_results);
  v_state := jsonb_set(v_state, '{status}',  '"finished"'::jsonb);
  update public.rooms set status='finished', state=v_state, version=version+1 where id=p_room;
  delete from public.mafia_secrets where room_id = p_room;
  return v_results;
end; $$;
