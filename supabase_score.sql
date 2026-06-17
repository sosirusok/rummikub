-- 점수표 재설계 RUN(멱등): 보드4종+운빨대시 등수표 + 운빨대시 정산함수 교체
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
