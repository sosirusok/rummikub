-- =====================================================================
-- 흥미 요소 패치 (engagement) — 코인 · 계정레벨 · 업적 · 상점 · 출석 · 통합랭킹
--  설계 원칙: 기존 점수 로직(rk_bump_stats / rk_finish_*)은 절대 건드리지 않는다.
--  코인/XP 는 누적 전적(user_game_stats)에서 "파생"되고, 보너스/소비만 user_meta 에 누적.
--    coins  = 전적기반획득(승*120 + 패*40) + bonus_total - spent_total
--    xp     = 전적기반획득 + bonus_total            (소비해도 줄지 않는 평생 경험치)
--  → 게임 정산에 손대지 않으므로 점수/연승/티어에 어떤 부작용도 없음(안전).
-- Supabase SQL Editor 에 전체 붙여넣고 RUN. 멱등(재실행 안전).
-- =====================================================================

create table if not exists public.user_meta (
  user_id        uuid primary key references public.users(id) on delete cascade,
  bonus_total    bigint not null default 0,    -- 업적/출석 보상 누적(단조 증가)
  spent_total    bigint not null default 0,    -- 상점 구매로 소비한 코인 누적
  inventory      jsonb  not null default '[]'::jsonb,   -- 보유 아이템 key 배열
  achievements   jsonb  not null default '[]'::jsonb,   -- 해금된 업적 key 배열
  equipped_title text,                          -- 장착 칭호(표시 텍스트)
  equipped_effect text,                         -- 장착 이름 이펙트(css 토큰)
  login_date     date,                          -- 마지막 출석 보상 받은 날(UTC)
  login_streak   int    not null default 0,
  last_seen      date,
  updated_at     timestamptz not null default now()
);
alter table public.user_meta enable row level security;   -- 정책 없음 = RPC(SECURITY DEFINER)로만 접근

-- ---------------------------------------------------------------------
-- rk_meta: 지갑/레벨/업적/상점/출석을 한 번에. 호출 시 업적 자동 해금(멱등).
-- ---------------------------------------------------------------------
create or replace function public.rk_meta(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid;
  v_wins int; v_losses int; v_games int; v_totscore bigint; v_maxscore int; v_maxstreak int; v_distinct int;
  v_earned bigint; v_bonus bigint; v_spent bigint; v_xp bigint; v_coins bigint;
  v_inv jsonb; v_ach jsonb; v_title text; v_effect text; v_logindate date; v_streak int;
  v_new jsonb := '[]'::jsonb; r record; v_metric numeric;
  v_level int; v_lvlbase bigint; v_lvlnext bigint;
  v_today date := (now() at time zone 'utc')::date;
  v_daily_claim boolean; v_daily_reward int; v_next_streak int;
  v_ach_out jsonb; v_shop_out jsonb;
  v_catalog jsonb := '[
    {"key":"a_firstwin","icon":"🏅","name":"첫 승리","desc":"아무 게임이나 1승","metric":"wins","goal":1,"reward":100},
    {"key":"a_win10","icon":"🎖️","name":"10승 달성","desc":"누적 10승","metric":"wins","goal":10,"reward":300},
    {"key":"a_win50","icon":"🏆","name":"50승 달성","desc":"누적 50승","metric":"wins","goal":50,"reward":900},
    {"key":"a_win100","icon":"👑","name":"백전노장","desc":"누적 100승","metric":"wins","goal":100,"reward":2200},
    {"key":"a_play10","icon":"🎮","name":"몸풀기","desc":"누적 10판 플레이","metric":"games","goal":10,"reward":120},
    {"key":"a_play50","icon":"🕹️","name":"단골 손님","desc":"누적 50판 플레이","metric":"games","goal":50,"reward":450},
    {"key":"a_play200","icon":"🎲","name":"게임 폐인","desc":"누적 200판 플레이","metric":"games","goal":200,"reward":1600},
    {"key":"a_streak3","icon":"🔥","name":"불타오른다","desc":"3연승","metric":"maxstreak","goal":3,"reward":300},
    {"key":"a_streak5","icon":"⚡","name":"파죽지세","desc":"5연승","metric":"maxstreak","goal":5,"reward":800},
    {"key":"a_streak10","icon":"💥","name":"무패행진","desc":"10연승","metric":"maxstreak","goal":10,"reward":2500},
    {"key":"a_plat","icon":"💠","name":"플래티넘","desc":"한 게임 5400점 도달","metric":"maxscore","goal":5400,"reward":700},
    {"key":"a_dia","icon":"💎","name":"다이아몬드","desc":"한 게임 9000점 도달","metric":"maxscore","goal":9000,"reward":1700},
    {"key":"a_allgames","icon":"🌈","name":"만능 플레이어","desc":"7종 게임 모두 플레이","metric":"distinct","goal":7,"reward":1200},
    {"key":"a_tot40k","icon":"🌟","name":"누적 4만점","desc":"전 게임 점수 합 40000","metric":"totscore","goal":40000,"reward":1500}
  ]'::jsonb;
  v_shop jsonb := '[
    {"key":"t_rookie","kind":"title","value":"🌱 새내기","name":"칭호: 새내기","desc":"이름 옆 칭호","price":300},
    {"key":"t_gamer","kind":"title","value":"🎮 게임러","name":"칭호: 게임러","desc":"이름 옆 칭호","price":900},
    {"key":"t_brain","kind":"title","value":"🧠 두뇌파","name":"칭호: 두뇌파","desc":"이름 옆 칭호","price":1800},
    {"key":"t_lucky","kind":"title","value":"🍀 행운아","name":"칭호: 행운아","desc":"이름 옆 칭호","price":1800},
    {"key":"t_king","kind":"title","value":"👑 게임왕","name":"칭호: 게임왕","desc":"이름 옆 칭호","price":4500},
    {"key":"t_legend","kind":"title","value":"🔥 전설","name":"칭호: 전설","desc":"이름 옆 칭호","price":9000},
    {"key":"e_silver","kind":"effect","value":"silver","name":"이펙트: 실버","desc":"이름에 은빛 광택","price":1000},
    {"key":"e_gold","kind":"effect","value":"gold","name":"이펙트: 골드","desc":"이름에 금빛 광택","price":2600},
    {"key":"e_neon","kind":"effect","value":"neon","name":"이펙트: 네온","desc":"이름에 네온 글로우","price":4200},
    {"key":"e_fire","kind":"effect","value":"fire","name":"이펙트: 화염","desc":"이름에 불꽃 그라데이션","price":6000},
    {"key":"e_rainbow","kind":"effect","value":"rainbow","name":"이펙트: 레인보우","desc":"이름에 무지개 흐름","price":9000}
  ]'::jsonb;
begin
  if p_token is null then return null; end if;
  select id into v_uid from public.users where token = p_token;
  if v_uid is null then return null; end if;
  insert into public.user_meta(user_id) values (v_uid) on conflict (user_id) do nothing;

  select coalesce(sum(wins),0), coalesce(sum(losses),0), coalesce(sum(score),0)::bigint,
         coalesce(max(score),0), coalesce(max(streak),0),
         coalesce(count(*) filter (where wins+losses>0),0)
    into v_wins, v_losses, v_totscore, v_maxscore, v_maxstreak, v_distinct
    from public.user_game_stats where user_id = v_uid;
  v_games := v_wins + v_losses;
  v_earned := v_wins::bigint*120 + v_losses::bigint*40;

  select coalesce(bonus_total,0), coalesce(spent_total,0), coalesce(inventory,'[]'::jsonb),
         coalesce(achievements,'[]'::jsonb), equipped_title, equipped_effect, login_date, coalesce(login_streak,0)
    into v_bonus, v_spent, v_inv, v_ach, v_title, v_effect, v_logindate, v_streak
    from public.user_meta where user_id = v_uid;

  -- 업적 자동 해금: 조건 충족 & 미보유 → 키 추가 + 보너스 적립(1회성)
  for r in select value as item from jsonb_array_elements(v_catalog) loop
    v_metric := case r.item->>'metric'
      when 'wins' then v_wins when 'games' then v_games when 'maxscore' then v_maxscore
      when 'maxstreak' then v_maxstreak when 'distinct' then v_distinct when 'totscore' then v_totscore::numeric else 0 end;
    if v_metric >= (r.item->>'goal')::numeric and not (v_ach ? (r.item->>'key')) then
      v_ach := v_ach || to_jsonb(array[r.item->>'key']);
      v_bonus := v_bonus + (r.item->>'reward')::int;
      v_new := v_new || jsonb_build_object('key', r.item->>'key', 'name', r.item->>'name', 'icon', r.item->>'icon', 'reward', (r.item->>'reward')::int);
    end if;
  end loop;
  if jsonb_array_length(v_new) > 0 then
    update public.user_meta set bonus_total = v_bonus, achievements = v_ach, last_seen = v_today where user_id = v_uid;
  else
    update public.user_meta set last_seen = v_today where user_id = v_uid;
  end if;

  v_xp := v_earned + v_bonus;
  v_coins := v_earned + v_bonus - v_spent;
  v_level := floor( (1 + sqrt(1 + (8.0*v_xp)/250.0)) / 2 )::int;
  if v_level < 1 then v_level := 1; end if;
  v_lvlbase := (250::bigint * (v_level-1) * v_level) / 2;
  v_lvlnext := (250::bigint * v_level * (v_level+1)) / 2;

  v_daily_claim := (v_logindate is null or v_logindate < v_today);
  if v_logindate is null then v_next_streak := 1;
  elsif v_logindate = v_today - 1 then v_next_streak := v_streak + 1;
  elsif v_logindate = v_today then v_next_streak := v_streak;
  else v_next_streak := 1; end if;
  v_daily_reward := least(300, 50 + greatest(0, v_next_streak-1)*25);

  select jsonb_agg(jsonb_build_object(
    'key', item->>'key', 'name', item->>'name', 'desc', item->>'desc', 'icon', item->>'icon',
    'reward', (item->>'reward')::int, 'goal', (item->>'goal')::numeric,
    'progress', least((item->>'goal')::numeric, case item->>'metric'
        when 'wins' then v_wins when 'games' then v_games when 'maxscore' then v_maxscore
        when 'maxstreak' then v_maxstreak when 'distinct' then v_distinct when 'totscore' then v_totscore::numeric else 0 end),
    'unlocked', (v_ach ? (item->>'key'))
  ) order by (v_ach ? (item->>'key')) desc, (item->>'goal')::numeric asc)
  into v_ach_out from jsonb_array_elements(v_catalog) item;

  select jsonb_agg(jsonb_build_object(
    'key', item->>'key', 'name', item->>'name', 'desc', item->>'desc', 'kind', item->>'kind',
    'value', item->>'value', 'price', (item->>'price')::int,
    'owned', (v_inv ? (item->>'key')),
    'equipped', case item->>'kind' when 'title' then (v_title is not distinct from (item->>'value'))
                                   else (v_effect is not distinct from (item->>'value')) end
  )) into v_shop_out from jsonb_array_elements(v_shop) item;

  return jsonb_build_object(
    'coins', v_coins, 'xp', v_xp, 'level', v_level, 'xpInLevel', v_xp - v_lvlbase, 'xpForNext', v_lvlnext - v_lvlbase,
    'wins', v_wins, 'games', v_games,
    'daily', jsonb_build_object('claimable', v_daily_claim, 'streak', v_streak, 'nextStreak', v_next_streak, 'reward', v_daily_reward),
    'equipped', jsonb_build_object('title', v_title, 'effect', v_effect),
    'achievements', coalesce(v_ach_out,'[]'::jsonb), 'newly', v_new, 'shop', coalesce(v_shop_out,'[]'::jsonb));
end; $$;

-- ---------------------------------------------------------------------
-- rk_buy_item: 코인으로 아이템 구매(서버가 가격 검증 → 위조 불가)
-- ---------------------------------------------------------------------
create or replace function public.rk_buy_item(p_token uuid, p_key text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid; v_item jsonb; v_price int; v_bonus bigint; v_spent bigint; v_coins bigint; v_wins int; v_losses int; v_inv jsonb;
  v_shop jsonb := '[
    {"key":"t_rookie","price":300},{"key":"t_gamer","price":900},{"key":"t_brain","price":1800},
    {"key":"t_lucky","price":1800},{"key":"t_king","price":4500},{"key":"t_legend","price":9000},
    {"key":"e_silver","price":1000},{"key":"e_gold","price":2600},{"key":"e_neon","price":4200},
    {"key":"e_fire","price":6000},{"key":"e_rainbow","price":9000}
  ]'::jsonb;
begin
  select id into v_uid from public.users where token = p_token;
  if v_uid is null then raise exception 'BAD_TOKEN'; end if;
  insert into public.user_meta(user_id) values (v_uid) on conflict (user_id) do nothing;
  select value into v_item from jsonb_array_elements(v_shop) where value->>'key' = p_key;
  if v_item is null then raise exception 'BAD_ITEM'; end if;
  v_price := (v_item->>'price')::int;
  select coalesce(inventory,'[]'::jsonb), coalesce(bonus_total,0), coalesce(spent_total,0)
    into v_inv, v_bonus, v_spent from public.user_meta where user_id = v_uid;
  if v_inv ? p_key then return jsonb_build_object('ok',true,'already',true); end if;
  select coalesce(sum(wins),0), coalesce(sum(losses),0) into v_wins, v_losses from public.user_game_stats where user_id = v_uid;
  v_coins := v_wins::bigint*120 + v_losses::bigint*40 + v_bonus - v_spent;
  if v_coins < v_price then return jsonb_build_object('ok',false,'reason','no_coins'); end if;
  update public.user_meta
    set inventory = coalesce(inventory,'[]'::jsonb) || to_jsonb(array[p_key]),
        spent_total = coalesce(spent_total,0) + v_price
    where user_id = v_uid;
  return jsonb_build_object('ok',true,'coins', v_coins - v_price);
end; $$;

-- ---------------------------------------------------------------------
-- rk_equip: 보유한 칭호/이펙트 장착(빈 문자열 = 해제)
-- ---------------------------------------------------------------------
create or replace function public.rk_equip(p_token uuid, p_kind text, p_key text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid; v_inv jsonb; v_item jsonb; v_val text;
  v_shop jsonb := '[
    {"key":"t_rookie","kind":"title","value":"🌱 새내기"},{"key":"t_gamer","kind":"title","value":"🎮 게임러"},
    {"key":"t_brain","kind":"title","value":"🧠 두뇌파"},{"key":"t_lucky","kind":"title","value":"🍀 행운아"},
    {"key":"t_king","kind":"title","value":"👑 게임왕"},{"key":"t_legend","kind":"title","value":"🔥 전설"},
    {"key":"e_silver","kind":"effect","value":"silver"},{"key":"e_gold","kind":"effect","value":"gold"},
    {"key":"e_neon","kind":"effect","value":"neon"},{"key":"e_fire","kind":"effect","value":"fire"},
    {"key":"e_rainbow","kind":"effect","value":"rainbow"}
  ]'::jsonb;
begin
  select id into v_uid from public.users where token = p_token;
  if v_uid is null then raise exception 'BAD_TOKEN'; end if;
  if p_kind not in ('title','effect') then raise exception 'BAD_KIND'; end if;
  insert into public.user_meta(user_id) values (v_uid) on conflict (user_id) do nothing;
  if coalesce(p_key,'') = '' then
    if p_kind = 'title' then update public.user_meta set equipped_title = null where user_id = v_uid;
    else update public.user_meta set equipped_effect = null where user_id = v_uid; end if;
    return jsonb_build_object('ok',true,'value',null);
  end if;
  select coalesce(inventory,'[]'::jsonb) into v_inv from public.user_meta where user_id = v_uid;
  if not (v_inv ? p_key) then return jsonb_build_object('ok',false,'reason','not_owned'); end if;
  select value into v_item from jsonb_array_elements(v_shop) where value->>'key' = p_key;
  if v_item is null or v_item->>'kind' <> p_kind then raise exception 'BAD_ITEM'; end if;
  v_val := v_item->>'value';
  if p_kind = 'title' then update public.user_meta set equipped_title = v_val where user_id = v_uid;
  else update public.user_meta set equipped_effect = v_val where user_id = v_uid; end if;
  return jsonb_build_object('ok',true,'value',v_val);
end; $$;

-- ---------------------------------------------------------------------
-- rk_claim_daily: 하루 1회 출석 보상(연속 출석 보너스)
-- ---------------------------------------------------------------------
create or replace function public.rk_claim_daily(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid; v_logindate date; v_streak int; v_today date := (now() at time zone 'utc')::date; v_next int; v_reward int;
begin
  select id into v_uid from public.users where token = p_token;
  if v_uid is null then raise exception 'BAD_TOKEN'; end if;
  insert into public.user_meta(user_id) values (v_uid) on conflict (user_id) do nothing;
  select login_date, coalesce(login_streak,0) into v_logindate, v_streak from public.user_meta where user_id = v_uid;
  if v_logindate = v_today then return jsonb_build_object('ok',false,'reason','already'); end if;
  if v_logindate = v_today - 1 then v_next := v_streak + 1; else v_next := 1; end if;
  v_reward := least(300, 50 + (v_next-1)*25);
  update public.user_meta
    set login_date = v_today, login_streak = v_next, bonus_total = coalesce(bonus_total,0) + v_reward
    where user_id = v_uid;
  return jsonb_build_object('ok',true,'reward',v_reward,'streak',v_next);
end; $$;

-- ---------------------------------------------------------------------
-- 통합 랭킹(전 게임 점수 합) — 칭호/이펙트 포함
-- ---------------------------------------------------------------------
create or replace function public.rk_leaderboard_total()
returns table(id uuid, real_name text, total bigint, wins bigint, title text, effect text)
language sql security definer set search_path = public, extensions as $$
  select u.id, u.real_name, coalesce(sum(s.score),0)::bigint as total, coalesce(sum(s.wins),0)::bigint as wins,
         m.equipped_title, m.equipped_effect
  from public.users u
  left join public.user_game_stats s on s.user_id = u.id
  left join public.user_meta m on m.user_id = u.id
  group by u.id, u.real_name, m.equipped_title, m.equipped_effect
  having coalesce(sum(s.score),0) > 0
  order by total desc, wins desc, u.real_name asc
  limit 100;
$$;

-- ---------------------------------------------------------------------
-- 게임별 랭킹에 칭호/이펙트 컬럼 추가(반환 시그니처 변경 → drop 후 재생성)
-- ---------------------------------------------------------------------
drop function if exists public.rk_leaderboard(text);
create function public.rk_leaderboard(p_game text default 'rummikub')
returns table(id uuid, username citext, real_name text, score int, wins int, losses int, streak int, title text, effect text)
language sql security definer set search_path = public, extensions as $$
  select u.id, u.username, u.real_name, s.score, s.wins, s.losses, s.streak, m.equipped_title, m.equipped_effect
  from public.user_game_stats s join public.users u on u.id = s.user_id
  left join public.user_meta m on m.user_id = u.id
  where s.game = case when p_game in ('rummikub','davinci','splendor','uno','race','hunt','mafia') then p_game else 'rummikub' end
  order by s.score desc, s.wins desc, u.real_name asc limit 100;
$$;

grant execute on function public.rk_meta(uuid)                       to anon, authenticated;
grant execute on function public.rk_buy_item(uuid,text)              to anon, authenticated;
grant execute on function public.rk_equip(uuid,text,text)            to anon, authenticated;
grant execute on function public.rk_claim_daily(uuid)                to anon, authenticated;
grant execute on function public.rk_leaderboard_total()              to anon, authenticated;
grant execute on function public.rk_leaderboard(text)                to anon, authenticated;
