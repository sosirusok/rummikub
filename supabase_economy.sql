-- =========================================================================
-- supabase_economy.sql — 경제 탭(하이픽셀 스카이블럭 x 메이플스토리2 스타일) 백엔드
--   · econ_players : 유저별 진행 세이브(jsonb). 본인만 읽기/쓰기.
-- 클라이언트는 graceful-degrade: 이 SQL 미적용 시 로컬 저장으로만 동작.
-- Supabase SQL Editor 에 통째로 실행하세요. (users.token uuid 전제, adv_players와 동일 패턴)
-- =========================================================================

create table if not exists public.econ_players (
  user_id    uuid primary key references public.users(id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.econ_players enable row level security;
-- (정책 미부여 = 익명 직접 접근 불가. 모든 접근은 아래 SECURITY DEFINER 함수 경유)

create or replace function public.econ_save_player(p_token uuid, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'NO_AUTH'); end if;
  insert into public.econ_players(user_id, state, updated_at) values (v_user, p_state, now())
    on conflict (user_id) do update set state = excluded.state, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.econ_load_player(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_state jsonb;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then return null; end if;
  select state into v_state from public.econ_players where user_id = v_user;
  return v_state;
end;
$$;

create or replace function public.econ_reset_player(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select id into v_user from public.users where token = p_token;
  if v_user is null then return jsonb_build_object('ok', false); end if;
  delete from public.econ_players where user_id = v_user;
  return jsonb_build_object('ok', true);
end;
$$;

-- 섬 방문(멀티): 이름으로 다른 플레이어의 프라이빗 섬 데이터(블록 편집 + 미니언)만 공개 조회.
-- 골드/인벤토리 등 나머지 진행 정보는 노출하지 않음.
create or replace function public.econ_get_player_by_name(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_state jsonb; v_name text;
begin
  select id, real_name into v_user, v_name from public.users
    where real_name = p_name or username::text = lower(p_name)
    limit 1;
  if v_user is null then return null; end if;
  select state into v_state from public.econ_players where user_id = v_user;
  if v_state is null then return null; end if;
  return jsonb_build_object(
    'name',      v_name,
    'homeEdits', coalesce(v_state->'homeEdits', '{}'::jsonb),
    'minions',   coalesce(v_state->'minions',   '[]'::jsonb)
  );
end;
$$;

grant execute on function public.econ_save_player(uuid, jsonb)  to anon, authenticated;
grant execute on function public.econ_load_player(uuid)         to anon, authenticated;
grant execute on function public.econ_reset_player(uuid)        to anon, authenticated;
grant execute on function public.econ_get_player_by_name(text)  to anon, authenticated;
