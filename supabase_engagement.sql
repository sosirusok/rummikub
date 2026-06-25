-- =====================================================================
-- 계정 레벨 · 프로필 · 통합 랭킹 (코인 / 상점 / 업적 / 출석은 전부 제거됨)
--  · 이전 버전에서 만든 rk_buy_item / rk_equip / rk_claim_daily / user_meta 를 정리(drop).
--  · rk_meta 는 레벨/XP 만 반환(코인·상점·업적·출석 없음).
--    XP = 평생 플레이 점수(게임별 플레이타임·난이도 가중). 레벨 = XP 누적 곡선.
--  · 기존 점수/연승/티어 로직은 건드리지 않음(안전).
-- Supabase SQL Editor 에 전체 붙여넣고 RUN. 멱등(재실행 안전).
-- =====================================================================

-- 더 이상 쓰지 않는 함수 제거(있을 때만)
drop function if exists public.rk_buy_item(uuid,text);
drop function if exists public.rk_equip(uuid,text,text);
drop function if exists public.rk_claim_daily(uuid);

-- 레벨 산출용 XP(평생 플레이 점수). 게임별 가중 — 스플랜더/마피아/루미가 미니게임보다 큼.
create or replace function public.rk_xp(p_uid uuid)
returns bigint language sql stable security definer set search_path = public, extensions as $$
  select coalesce(sum(
      wins   * case game when 'splendor' then 180 when 'mafia' then 150 when 'rummikub' then 150
                         when 'davinci' then 110 when 'uno' then 100 when 'hunt' then 75 when 'race' then 70 else 110 end
    + losses * case game when 'splendor' then 60  when 'mafia' then 55  when 'rummikub' then 50
                         when 'davinci' then 40  when 'uno' then 38  when 'hunt' then 30 when 'race' then 28 else 40 end
  ), 0)::bigint
  from public.user_game_stats where user_id = p_uid;
$$;

-- rk_meta: 레벨/XP/전적 요약만 반환(user_meta 의존 없음).
create or replace function public.rk_meta(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid; v_wins int; v_losses int; v_games int; v_xp bigint;
  v_level int; v_lvlbase bigint; v_lvlnext bigint;
begin
  if p_token is null then return null; end if;
  select id into v_uid from public.users where token = p_token;
  if v_uid is null then return null; end if;
  select coalesce(sum(wins),0), coalesce(sum(losses),0) into v_wins, v_losses
    from public.user_game_stats where user_id = v_uid;
  v_games := v_wins + v_losses;
  v_xp := public.rk_xp(v_uid);
  v_level := floor( (1 + sqrt(1 + (8.0*v_xp)/250.0)) / 2 )::int;
  if v_level < 1 then v_level := 1; end if;
  v_lvlbase := (250::bigint * (v_level-1) * v_level) / 2;
  v_lvlnext := (250::bigint * v_level * (v_level+1)) / 2;
  return jsonb_build_object(
    'level', v_level, 'xp', v_xp, 'xpInLevel', v_xp - v_lvlbase, 'xpForNext', v_lvlnext - v_lvlbase,
    'wins', v_wins, 'games', v_games);
end; $$;

-- 더 이상 쓰지 않는 헬퍼 제거(rk_meta 재정의 후)
drop function if exists public.rk_coin_earned(uuid);

-- 통합 랭킹(전 게임 점수 합) — 칭호/이펙트 없이(이전 버전과 컬럼이 달라 drop 후 재생성)
drop function if exists public.rk_leaderboard_total();
create function public.rk_leaderboard_total()
returns table(id uuid, real_name text, total bigint, wins bigint)
language sql security definer set search_path = public, extensions as $$
  select u.id, u.real_name, coalesce(sum(s.score),0)::bigint as total, coalesce(sum(s.wins),0)::bigint as wins
  from public.users u
  left join public.user_game_stats s on s.user_id = u.id
  group by u.id, u.real_name
  having coalesce(sum(s.score),0) > 0
  order by total desc, wins desc, u.real_name asc
  limit 100;
$$;

-- 게임별 랭킹: 칭호/이펙트 컬럼 제거하고 원래 형태로 되돌림(시그니처 변경 → drop 후 재생성)
drop function if exists public.rk_leaderboard(text);
create function public.rk_leaderboard(p_game text default 'rummikub')
returns table(id uuid, username citext, real_name text, score int, wins int, losses int, streak int)
language sql security definer set search_path = public, extensions as $$
  select u.id, u.username, u.real_name, s.score, s.wins, s.losses, s.streak
  from public.user_game_stats s join public.users u on u.id = s.user_id
  where s.game = case when p_game in ('rummikub','davinci','splendor','uno','race','hunt','mafia') then p_game else 'rummikub' end
  order by s.score desc, s.wins desc, u.real_name asc limit 100;
$$;

-- 코인/상점/업적/출석용 테이블 제거(더 이상 미사용)
drop table if exists public.user_meta;

grant execute on function public.rk_xp(uuid)                         to anon, authenticated;
grant execute on function public.rk_meta(uuid)                       to anon, authenticated;
grant execute on function public.rk_leaderboard_total()              to anon, authenticated;
grant execute on function public.rk_leaderboard(text)                to anon, authenticated;
