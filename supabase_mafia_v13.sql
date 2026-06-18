-- 점수표/마피아 v13 패치 — 확률가중 EV(진영·인원수별 승패) + 마피아 수 인원수 스케일 + 동료 표시 + 다수결 처치.
-- Supabase SQL Editor 에 전체 붙여넣고 RUN. 멱등(재실행 안전). 데이터/잠금 영향 없음(함수만 교체).

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

grant execute on function public.rk_finish_mafia(uuid,int) to anon, authenticated;
grant execute on function public.mf_start(uuid,int) to anon, authenticated;
grant execute on function public.mf_my_view(uuid,int) to anon, authenticated;
grant execute on function public.mf_night_action(uuid,int,int) to anon, authenticated;
grant execute on function public.mf_resolve_phase(uuid,int,text) to anon, authenticated;
