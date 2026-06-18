-- 점수표 v12: 보드+운빨 rk_rank_points + 마피아 단조 win/패(rk_finish_mafia). RUN(멱등).
create or replace function public.rk_rank_points(p_game text, p_score int, p_n int, p_rank int)
returns int language plpgsql immutable set search_path = public as $$
declare
  t jsonb := '{"rummikub":{"wood":{"2":[165,0],"3":[220,65,0],"4":[275,230,15,0]},"iron":{"2":[160,-20],"3":[210,60,-20],"4":[265,225,10,-13]},"bronze":{"2":[155,-40],"3":[205,55,-40],"4":[255,215,5,-26]},"silver":{"2":[155,-65],"3":[205,40,-65],"4":[255,215,-10,-42]},"gold":{"2":[155,-90],"3":[205,25,-90],"4":[255,215,-25,-58]},"platinum":{"2":[150,-155],"3":[200,-20,-155],"4":[250,210,-70,-101]},"emerald":{"2":[145,-195],"3":[195,-50,-195],"4":[245,205,-100,-127]},"diamond":{"2":[145,-235],"3":[190,-80,-235],"4":[240,200,-130,-153]},"master":{"2":[145,-260],"3":[190,-95,-260],"4":[240,200,-145,-169]},"grandmaster":{"2":[140,-300],"3":[190,-125,-300],"4":[235,195,-175,-195]},"challenger":{"2":[140,-365],"3":[185,-170,-365],"4":[230,190,-220,-237]}},"davinci":{"wood":{"2":[150,0],"3":[200,65,0],"4":[250,210,15,0]},"iron":{"2":[135,-40],"3":[180,60,-40],"4":[225,185,10,-26]},"bronze":{"2":[120,-80],"3":[160,55,-80],"4":[200,160,5,-52]},"silver":{"2":[120,-80],"3":[160,55,-80],"4":[200,160,5,-52]},"gold":{"2":[120,-105],"3":[160,40,-105],"4":[200,160,-10,-68]},"platinum":{"2":[115,-145],"3":[155,10,-145],"4":[195,155,-40,-94]},"emerald":{"2":[115,-185],"3":[150,-20,-185],"4":[190,150,-70,-120]},"diamond":{"2":[110,-225],"3":[150,-50,-225],"4":[185,145,-100,-146]},"master":{"2":[110,-225],"3":[150,-50,-225],"4":[185,145,-100,-146]},"grandmaster":{"2":[110,-265],"3":[145,-80,-265],"4":[180,140,-130,-172]},"challenger":{"2":[105,-330],"3":[140,-125,-330],"4":[175,135,-175,-214]}},"uno":{"wood":{"2":[140,0],"3":[185,65,0],"4":[230,190,15,0]},"iron":{"2":[125,-40],"3":[165,60,-40],"4":[205,165,10,-26]},"bronze":{"2":[110,-80],"3":[145,55,-80],"4":[180,140,5,-52]},"silver":{"2":[105,-120],"3":[140,25,-120],"4":[175,135,-25,-78]},"gold":{"2":[105,-145],"3":[140,10,-145],"4":[175,135,-40,-94]},"platinum":{"2":[105,-170],"3":[140,-5,-170],"4":[175,135,-55,-110]},"emerald":{"2":[105,-195],"3":[140,-20,-195],"4":[175,135,-70,-127]},"diamond":{"2":[105,-220],"3":[140,-35,-220],"4":[175,135,-85,-143]},"master":{"2":[100,-260],"3":[135,-65,-260],"4":[170,130,-115,-169]},"grandmaster":{"2":[100,-285],"3":[135,-80,-285],"4":[170,130,-130,-185]},"challenger":{"2":[100,-325],"3":[130,-110,-325],"4":[165,125,-160,-211]}},"splendor":{"wood":{"2":[190,0],"3":[250,65,0],"4":[315,270,15,0]},"iron":{"2":[175,-40],"3":[230,60,-40],"4":[290,250,10,-26]},"bronze":{"2":[170,-60],"3":[225,55,-60],"4":[280,240,5,-39]},"silver":{"2":[170,-85],"3":[225,40,-85],"4":[280,240,-10,-55]},"gold":{"2":[165,-125],"3":[220,10,-125],"4":[275,235,-40,-81]},"platinum":{"2":[160,-165],"3":[215,-20,-165],"4":[270,230,-70,-107]},"emerald":{"2":[160,-205],"3":[210,-50,-205],"4":[265,225,-100,-133]},"diamond":{"2":[155,-245],"3":[210,-80,-245],"4":[260,220,-130,-159]},"master":{"2":[155,-330],"3":[205,-140,-330],"4":[255,215,-190,-214]},"grandmaster":{"2":[155,-330],"3":[205,-140,-330],"4":[255,215,-190,-214]},"challenger":{"2":[150,-395],"3":[200,-185,-395],"4":[250,210,-235,-257]}},"race":{"wood":{"2":[125,0],"3":[170,65,0],"4":[210,170,15,0],"5":[260,220,10,5,0],"6":[310,260,15,10,5,0],"7":[350,300,20,15,10,5,0],"8":[390,335,25,20,15,10,5,0]},"iron":{"2":[110,-40],"3":[150,60,-40],"4":[185,145,10,-40],"5":[255,215,-10,-25,-35],"6":[305,250,0,-15,-25,-35],"7":[345,290,5,-5,-15,-25,-35],"8":[385,325,10,0,-5,-15,-25,-35]},"bronze":{"2":[95,-80],"3":[130,55,-80],"4":[160,120,5,-80],"5":[250,205,-30,-55,-70],"6":[300,240,-15,-40,-55,-70],"7":[340,280,-10,-25,-40,-55,-70],"8":[380,315,-5,-20,-25,-40,-55,-70]},"silver":{"2":[95,-120],"3":[125,25,-120],"4":[155,115,-25,-120],"5":[245,200,-55,-85,-105],"6":[295,235,-35,-65,-85,-105],"7":[335,275,-30,-45,-65,-85,-105],"8":[375,310,-20,-40,-50,-65,-85,-105]},"gold":{"2":[95,-145],"3":[125,10,-145],"4":[155,115,-40,-145],"5":[245,200,-65,-100,-130],"6":[295,235,-45,-80,-100,-125],"7":[335,275,-40,-55,-80,-100,-125],"8":[375,310,-30,-50,-60,-80,-100,-125]},"platinum":{"2":[95,-170],"3":[125,-5,-170],"4":[155,115,-55,-170],"5":[245,200,-75,-115,-155],"6":[295,235,-55,-95,-115,-145],"7":[335,275,-50,-65,-95,-115,-145],"8":[375,310,-40,-60,-70,-95,-115,-145]},"emerald":{"2":[95,-195],"3":[125,-20,-195],"4":[155,115,-70,-195],"5":[245,200,-85,-130,-180],"6":[295,235,-65,-110,-130,-165],"7":[335,275,-60,-75,-110,-130,-165],"8":[375,310,-50,-70,-80,-110,-130,-165]},"diamond":{"2":[95,-220],"3":[125,-35,-220],"4":[155,115,-85,-220],"5":[245,200,-95,-145,-205],"6":[295,235,-75,-125,-145,-185],"7":[335,275,-70,-85,-125,-145,-185],"8":[375,310,-60,-80,-90,-125,-145,-185]},"master":{"2":[95,-245],"3":[125,-50,-245],"4":[155,115,-100,-245],"5":[245,200,-105,-160,-230],"6":[295,235,-85,-140,-160,-205],"7":[335,275,-80,-95,-140,-160,-205],"8":[375,310,-70,-90,-100,-140,-160,-205]},"grandmaster":{"2":[95,-270],"3":[125,-65,-270],"4":[155,115,-115,-270],"5":[245,200,-115,-175,-255],"6":[295,235,-95,-155,-175,-225],"7":[335,275,-90,-105,-155,-175,-225],"8":[375,310,-80,-100,-110,-155,-175,-225]},"challenger":{"2":[90,-310],"3":[120,-95,-310],"4":[150,110,-145,-310],"5":[240,195,-140,-205,-290],"6":[290,230,-115,-180,-205,-260],"7":[330,270,-105,-125,-180,-205,-265],"8":[375,305,-95,-120,-135,-185,-205,-260]}}}'::jsonb;
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
