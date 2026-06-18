-- =====================================================================
-- v7 연승(streak) 보너스 — 단독 실행용. Supabase SQL Editor 에 붙여넣고 RUN. 멱등.
--   규칙: 등수·인원별 처리
--     2인 +-      3인 +=-      4인 ++=-
--     5인 ++=--   6인 ++==--   7인 +++=---   8인 +++==---
--     + = 연승+1 & 보너스 적용 / = = 연승 유지(보너스X, 결과 3→3) / - = 연승 0
--   보너스 = 원래 점수증가분 × 20% × (연승-1)  (2연승 +20% … 최대 +100%, 증가분이 +일 때만)
--   적용: 루미큐브/다빈치/스플렌더/우노(2~4인) + 마피아(승=+, 패=-, 진영기준)
-- =====================================================================

-- ---- 연승 처리표(등수→apply/maintain/break). 2~8인 명시, 9인+ 일반화 ----
create or replace function public.rk_streak_treatment(p_n int, p_rank int, p_tied boolean)
returns text language sql immutable set search_path = public as $$
  select case
    when p_rank = 1 then 'apply'
    when p_tied   then 'maintain'                                   -- 공동등수(1위 외)는 유지
    when p_n <= 2 then 'break'                                      -- 2인: 2위 break (+-)
    when p_n = 3 then (case p_rank when 2 then 'maintain' else 'break' end)                                   -- +=-
    when p_n = 4 then (case p_rank when 2 then 'apply' when 3 then 'maintain' else 'break' end)               -- ++=-
    when p_n = 5 then (case p_rank when 2 then 'apply' when 3 then 'maintain' else 'break' end)               -- ++=--
    when p_n = 6 then (case when p_rank=2 then 'apply' when p_rank in (3,4) then 'maintain' else 'break' end) -- ++==--
    when p_n = 7 then (case when p_rank in (2,3) then 'apply' when p_rank=4 then 'maintain' else 'break' end) -- +++=---
    when p_n = 8 then (case when p_rank in (2,3) then 'apply' when p_rank in (4,5) then 'maintain' else 'break' end) -- +++==---
    else (case when p_rank <= ceil(p_n/3.0) then 'apply'
               when p_rank <= ceil(2*p_n/3.0) then 'maintain' else 'break' end)                               -- 9인+ 일반화
  end;
$$;

-- ---- 연승 보너스액: base(원래 증가분)>0 이고 streak>=2 일 때 base×20%×(streak-1), 최대 +100% ----
create or replace function public.rk_win_bonus(p_base int, p_streak int)
returns int language sql immutable set search_path = public as $$
  select case when coalesce(p_base,0) > 0 and coalesce(p_streak,0) >= 2
              then round(p_base * 0.20 * least(p_streak - 1, 5))::int else 0 end;
$$;

grant execute on function public.rk_streak_treatment(int,int,boolean) to anon, authenticated;
grant execute on function public.rk_win_bonus(int,int)                 to anon, authenticated;

-- ---- 루미큐브: 손패점수 오름차순 등수(동률 공동) → 고정표 + 연승처리 ----
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

-- ---- 공용: 다빈치/우노 (탈락·종료 순위 ranks 신뢰) — 동일 패턴 ----
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

-- ---- 스플렌더 (명성/카드수 ranks) — 동일 패턴 + points/cards 표기 ----
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

-- ---- 마피아: 진영 승=apply(연승+보너스) / 패=break (등수 아님) ----
create or replace function public.rk_finish_mafia(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb; v_winner text;
  v_seats text[]; v_n int; v_results jsonb := '{}'::jsonb; v_present uuid[]; v_quit boolean;
  i int; v_seat text; v_uid uuid; v_role text; v_camp text; v_won boolean;
  v_curscore int; v_curstreak int; v_delta int; v_ns int; v_nstreak int; v_w int; v_l int; v_bonus int;
  v_tierkey text; v_base int; v_contrib int; v_kills int; v_saves int; v_hits int; v_survived boolean;
  v_ev4 numeric; v_kc numeric; v_evn numeric; v_p numeric; v_pc numeric;
  -- 확률가중 EV 모델(점수표 v13): EV4=4인 기준, K=티어별 변동폭, pmaf=마피아 진영 승률(인원수별)
  v_ev jsonb := '{"wood":120,"iron":100,"bronze":80,"silver":80,"gold":70,"platinum":50,"emerald":30,"diamond":10,"master":10,"grandmaster":-10,"challenger":-40}'::jsonb;
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

    -- 확률가중 EV: EV_n=(n/4)·EV4, pc=진영 승률(마피아=p, 시민=1-p), 승=EV_n+K(1-pc)·패=EV_n-K·pc
    v_ev4 := (v_ev->>v_tierkey)::numeric; v_kc := (v_kk->>v_tierkey)::numeric;
    v_evn := round( (v_n::numeric / 4.0) * v_ev4 );
    v_pc  := case when v_camp='mafia' then v_p else 1.0 - v_p end;

    if v_quit then
      v_contrib := 0; v_won := false; v_delta := round( v_evn - v_kc * v_pc )::int;
    else
      if v_won then v_base := round( v_evn + v_kc * (1.0 - v_pc) )::int;
      else           v_base := round( v_evn - v_kc * v_pc )::int; end if;
      if v_role='mafia' then v_contrib := v_kills * 8;
      elsif v_role='police' then v_contrib := v_hits * 10;
      elsif v_role='doctor' then v_contrib := v_saves * 12;
      elsif v_survived then v_contrib := 6;
      else v_contrib := 0; end if;
      v_delta := v_base + v_contrib;
      if v_won then v_delta := greatest(v_delta, 1); end if;
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
