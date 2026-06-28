-- =========================================================================
-- supabase_adventure.sql — 모험 탭(2D 마인크래프트) 백엔드
--   · adv_settings : 전역 설정(비밀번호 / cfg 배수). 개발자(관리자)만 쓰기, 모두 읽기.
--   · adv_players  : 유저별 진행 세이브(jsonb). 본인만 읽기/쓰기.
-- 클라이언트는 모두 graceful-degrade: 이 SQL 미적용 시 로컬 저장으로만 동작.
-- Supabase SQL Editor 에 통째로 실행하세요. (users.token uuid / users.is_admin 전제)
-- =========================================================================

-- ----------------------------- 테이블 -----------------------------
create table if not exists public.adv_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.adv_players (
  user_id    uuid primary key references public.users(id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

-- 전역 설정은 RPC(SECURITY DEFINER)로만 변경 → 직접 쓰기 차단, 읽기는 RPC로 노출.
alter table public.adv_settings enable row level security;
alter table public.adv_players  enable row level security;
-- (정책 미부여 = 익명 직접 접근 불가. 모든 접근은 아래 SECURITY DEFINER 함수 경유)

-- ----------------------------- 설정 읽기(공개) -----------------------------
-- 비밀번호는 평문 그대로가 아니라, 클라가 입력값과 비교만 하도록 노출(요구사항: 암호만 알면 입장).
create or replace function public.adv_get_settings()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.adv_settings;
$$;

-- ----------------------------- 설정 쓰기(관리자) -----------------------------
create or replace function public.adv_set_setting(p_token uuid, p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin boolean;
begin
  select is_admin into v_admin from public.users where token = p_token;
  if v_admin is distinct from true then return jsonb_build_object('ok', false, 'error', 'NOT_ADMIN'); end if;
  if p_key not in ('pw','cfg') then return jsonb_build_object('ok', false, 'error', 'BAD_KEY'); end if;
  insert into public.adv_settings(key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------- 플레이어 세이브 -----------------------------
create or replace function public.adv_save_player(p_token uuid, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'NO_AUTH'); end if;
  insert into public.adv_players(user_id, state, updated_at) values (v_user, p_state, now())
    on conflict (user_id) do update set state = excluded.state, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.adv_load_player(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_state jsonb;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then return null; end if;
  select state into v_state from public.adv_players where user_id = v_user;
  return v_state;
end;
$$;

create or replace function public.adv_reset_player(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then return jsonb_build_object('ok', false); end if;
  delete from public.adv_players where user_id = v_user;
  return jsonb_build_object('ok', true);
end;
$$;

-- 권한
grant execute on function public.adv_get_settings()                    to anon, authenticated;
grant execute on function public.adv_set_setting(uuid, text, jsonb)    to anon, authenticated;
grant execute on function public.adv_save_player(uuid, jsonb)          to anon, authenticated;
grant execute on function public.adv_load_player(uuid)                 to anon, authenticated;
grant execute on function public.adv_reset_player(uuid)                to anon, authenticated;

-- 초기 비밀번호 (관리자 설정 전 기본값은 클라이언트 '1234qwer'. 여기 넣으면 전역 동기.)
insert into public.adv_settings(key, value) values ('pw', '"1234qwer"'::jsonb)
  on conflict (key) do nothing;

-- =========================================================================
-- 서버 권위 공유 월드 (모든 유저가 '하나의 서버 월드'에서만 플레이)
--   · adv_world  : 블록 편집 전역 영속(좌표 PK). 누구나 RPC 로 변경, 모두 같은 결과를 봄.
--   · adv_chests : 상자 내용물 전역 영속.
-- 클라는 입장 시 전체 편집을 로드하고, 변경을 서버에 영속(+실시간 브로드캐스트로 즉시 동기).
-- =========================================================================
create table if not exists public.adv_world (
  x          int  not null,
  y          int  not null,
  block      text not null,
  updated_at timestamptz not null default now(),
  primary key (x, y)
);
create table if not exists public.adv_chests (
  x          int  not null,
  y          int  not null,
  items      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (x, y)
);
alter table public.adv_world  enable row level security;
alter table public.adv_chests enable row level security;

-- 전체 월드 편집 로드(입장 시 1회). { "x,y": "block", ... }
create or replace function public.adv_world_get_all()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(x || ',' || y, block), '{}'::jsonb) from public.adv_world;
$$;

-- 블록 편집 일괄 영속. p_edits = { "x,y": "block" }. 'air' 도 블록값으로 저장(부순 상태 영속).
create or replace function public.adv_world_set_batch(p_token uuid, p_edits jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; k text; v text; px int; py int; n int := 0;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'NO_AUTH'); end if;
  for k, v in select key, value::text from jsonb_each_text(p_edits) loop
    px := split_part(k, ',', 1)::int; py := split_part(k, ',', 2)::int;
    insert into public.adv_world(x, y, block, updated_at) values (px, py, btrim(v, '"'), now())
      on conflict (x, y) do update set block = excluded.block, updated_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'n', n);
end;
$$;

-- 상자 읽기/쓰기
create or replace function public.adv_chest_get(p_x int, p_y int)
returns jsonb language sql security definer set search_path = public as $$
  select items from public.adv_chests where x = p_x and y = p_y;
$$;
create or replace function public.adv_chest_set(p_token uuid, p_x int, p_y int, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'NO_AUTH'); end if;
  insert into public.adv_chests(x, y, items, updated_at) values (p_x, p_y, p_items, now())
    on conflict (x, y) do update set items = excluded.items, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- 관리자: 서버 월드 전체 초기화
create or replace function public.adv_world_reset(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin boolean;
begin
  select is_admin into v_admin from public.users where token = p_token;
  if v_admin is distinct from true then return jsonb_build_object('ok', false, 'error', 'NOT_ADMIN'); end if;
  delete from public.adv_world; delete from public.adv_chests;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.adv_world_get_all()                   to anon, authenticated;
grant execute on function public.adv_world_set_batch(uuid, jsonb)      to anon, authenticated;
grant execute on function public.adv_chest_get(int, int)              to anon, authenticated;
grant execute on function public.adv_chest_set(uuid, int, int, jsonb) to anon, authenticated;
grant execute on function public.adv_world_reset(uuid)                to anon, authenticated;
