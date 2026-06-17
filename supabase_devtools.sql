-- =====================================================================
-- 개발자 도구 — 공지 / 유저스탯 수정 / 게임 로그 (멱등). Supabase SQL Editor 에 RUN.
-- 모든 관리 RPC 는 users.is_admin 서버 검증. 공지 조회만 공개.
-- =====================================================================

-- ---- 공지 ----
create table if not exists public.announcements (
  id         int primary key default 1,
  content    text not null default '',
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.announcements(id, content, expires_at) values (1, '', null) on conflict (id) do nothing;
alter table public.announcements enable row level security;   -- RPC 전용

-- ---- 매치 로그(게임 종료 자동 기록) ----
create table if not exists public.match_log (
  id          bigint generated always as identity primary key,
  game        text,
  room_id     int,
  n           int,
  results     jsonb,
  names       jsonb,
  finished_at timestamptz not null default now()
);
create index if not exists match_log_game_idx on public.match_log(game, finished_at desc);
create index if not exists match_log_time_idx on public.match_log(finished_at desc);
alter table public.match_log enable row level security;       -- RPC 전용

-- 방이 finished 로 전이될 때 자동 기록 + 오래된 로그 정리(최근 ~1000개 유지)
create or replace function public.rooms_log_finish() returns trigger as $$
begin
  if new.status = 'finished' and (old.status is distinct from 'finished') and (new.state ? 'results') then
    insert into public.match_log(game, room_id, n, results, names)
    values (new.game, new.id, coalesce((new.state->>'n')::int, null), new.state->'results', new.state->'names');
    delete from public.match_log where id < (select max(id) from public.match_log) - 1000;
  end if;
  return new;
end; $$ language plpgsql security definer set search_path = public, extensions;
drop trigger if exists trg_rooms_log_finish on public.rooms;
create trigger trg_rooms_log_finish after update on public.rooms
  for each row execute function public.rooms_log_finish();

-- =====================================================================
-- 관리 RPC (is_admin 검증)
-- =====================================================================
-- 공지 설정: 분 단위 노출(p_minutes). 내용 빈값/0분이면 해제.
create or replace function public.rk_set_announcement(p_token uuid, p_content text, p_minutes int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_admin boolean; v_exp timestamptz;
begin
  select is_admin into v_admin from public.users where token = p_token;
  if not coalesce(v_admin,false) then raise exception 'NOT_ADMIN'; end if;
  if coalesce(btrim(p_content),'') = '' or coalesce(p_minutes,0) <= 0 then v_exp := null; p_content := coalesce(p_content,''); end if;
  if v_exp is null and coalesce(p_minutes,0) > 0 and btrim(coalesce(p_content,'')) <> '' then
    v_exp := now() + make_interval(mins => least(p_minutes, 100000));
  end if;
  update public.announcements set content = coalesce(p_content,''), expires_at = v_exp, updated_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'expires_at', v_exp);
end; $$;

-- 공지 조회(공개): 활성(만료 전)일 때만 내용 반환
create or replace function public.rk_get_announcement()
returns jsonb language sql security definer set search_path = public, extensions as $$
  select case when a.expires_at is not null and a.expires_at > now() and btrim(a.content) <> ''
              then jsonb_build_object('content', a.content, 'expires_at', a.expires_at)
              else jsonb_build_object('content', null) end
  from public.announcements a where a.id = 1;
$$;

-- 유저 목록 + 게임별 스탯(관리)
create or replace function public.rk_admin_users(p_token uuid, p_q text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_admin boolean;
begin
  select is_admin into v_admin from public.users where token = p_token;
  if not coalesce(v_admin,false) then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(row order by uname)
    from (
      select u.username::text as uname, jsonb_build_object(
        'id', u.id, 'username', u.username, 'real_name', u.real_name, 'is_admin', u.is_admin,
        'games', coalesce((select jsonb_object_agg(s.game, jsonb_build_object('score',s.score,'wins',s.wins,'losses',s.losses,'streak',s.streak))
                           from public.user_game_stats s where s.user_id = u.id), '{}'::jsonb)
      ) as row
      from public.users u
      where p_q is null or u.username ilike '%'||p_q||'%' or u.real_name ilike '%'||p_q||'%'
      order by u.username
      limit 300
    ) z
  ), '[]'::jsonb);
end; $$;

-- 유저 이름 변경(관리)
create or replace function public.rk_admin_set_name(p_token uuid, p_uid uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_admin boolean;
begin
  select is_admin into v_admin from public.users where token = p_token;
  if not coalesce(v_admin,false) then raise exception 'NOT_ADMIN'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 16 then raise exception 'NAME_LEN'; end if;
  update public.users set real_name = btrim(p_name) where id = p_uid;
  update public.room_members set name = btrim(p_name) where user_id = p_uid;   -- 표시 미러 동기화
  return jsonb_build_object('ok', true);
end; $$;

-- 유저 게임 점수 설정(관리). 0~15000 클램프.
create or replace function public.rk_admin_set_score(p_token uuid, p_uid uuid, p_game text, p_score int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_admin boolean; v_s int;
begin
  select is_admin into v_admin from public.users where token = p_token;
  if not coalesce(v_admin,false) then raise exception 'NOT_ADMIN'; end if;
  if p_game not in ('rummikub','davinci','splendor','uno','race','hunt','mafia') then raise exception 'BAD_GAME'; end if;
  v_s := greatest(0, least(15000, coalesce(p_score,0)));
  insert into public.user_game_stats(user_id, game, score) values (p_uid, p_game, v_s)
  on conflict (user_id, game) do update set score = v_s, updated_at = now();
  return jsonb_build_object('ok', true, 'score', v_s);
end; $$;

-- 게임 로그 조회(관리). p_game=null 전체.
create or replace function public.rk_admin_logs(p_token uuid, p_game text default null, p_limit int default 80)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_admin boolean;
begin
  select is_admin into v_admin from public.users where token = p_token;
  if not coalesce(v_admin,false) then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id',id,'game',game,'room',room_id,'n',n,'results',results,'names',names,'at',finished_at) order by id desc)
    from (select * from public.match_log where p_game is null or game = p_game order by id desc limit least(coalesce(p_limit,80),300)) z
  ), '[]'::jsonb);
end; $$;

grant execute on function public.rk_set_announcement(uuid,text,int)      to anon, authenticated;
grant execute on function public.rk_get_announcement()                   to anon, authenticated;
grant execute on function public.rk_admin_users(uuid,text)               to anon, authenticated;
grant execute on function public.rk_admin_set_name(uuid,uuid,text)       to anon, authenticated;
grant execute on function public.rk_admin_set_score(uuid,uuid,text,int)  to anon, authenticated;
grant execute on function public.rk_admin_logs(uuid,text,int)            to anon, authenticated;
