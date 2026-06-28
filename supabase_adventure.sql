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
