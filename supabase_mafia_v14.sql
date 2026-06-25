-- =====================================================================
-- 마피아 v14 — 긴장감/진행 명확화 패치
--  · mf_start: 게임 구성(roleCounts) 공개 저장 + 첫날 안내 강화(누가 무슨 역할인지 추리 가능)
--  · mf_resolve_phase: 밤 사망자 "직업 공개"(실제 마피아처럼), lastNight/lastVote 에
--    이름·직업·연출용 메타를 담아 클라가 전체화면 낮/밤 전환 연출에 사용.
-- Supabase SQL Editor 에 전체 붙여넣고 RUN. 멱등(재실행 안전). 함수만 교체(데이터 불변).
-- v13(supabase_mafia_v13.sql) 적용 후 이 파일을 RUN 하세요.
-- =====================================================================

create or replace function public.mf_start(p_token uuid, p_room int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_room public.rooms; v_state jsonb; v_players jsonb;
  v_seats int[]; v_n int; v_epoch bigint; i int; v_perm int[]; v_seed bigint; v_log jsonb;
  v_m int; v_pos int; v_cit int;
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
  v_cit := v_n - v_m - 2;
  for i in 1 .. v_n loop
    v_pos := array_position(v_perm, v_seats[i]);   -- 셔플된 순번: 1~m=마피아, m+1=경찰, m+2=의사, 나머지=시민
    insert into public.mafia_secrets(room_id, seat, user_id, role, epoch)
    values (p_room, v_seats[i], (v_players->>(v_seats[i]::text))::uuid,
      case when v_pos <= v_m       then 'mafia'
           when v_pos =  v_m + 1   then 'police'
           when v_pos =  v_m + 2   then 'doctor'
           else 'citizen' end, v_epoch);
  end loop;
  -- 공개 구성: 모두가 "이 판에 마피아 몇·경찰1·의사1·시민 몇"인지 알고 추리할 수 있게(실제 마피아 규칙)
  v_state := jsonb_set(v_state, '{roleCounts}', jsonb_build_object('mafia',v_m,'police',1,'doctor',1,'citizen',v_cit));
  v_log := coalesce(v_state->'log','[]'::jsonb)
    || to_jsonb(array['🎬 게임 시작 — 마피아 '||v_m||'명 · 경찰 1명 · 의사 1명 · 시민 '||v_cit||'명. 마피아를 모두 찾아내세요!'])
    || to_jsonb(array['🌙 1일차 밤 — 마피아·경찰·의사는 행동하세요. 시민은 눈을 감고 기다립니다.']);
  v_state := jsonb_set(v_state, '{phase}', '"night"'::jsonb);
  v_state := jsonb_set(v_state, '{day}',   '1'::jsonb);
  v_state := jsonb_set(v_state, '{log}',   v_log);
  update public.rooms set state=v_state, version=version+1 where id=p_room;
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.mf_resolve_phase(p_token uuid, p_room int, p_expected text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid; v_room public.rooms; v_state jsonb; v_phase text; v_day int;
  v_kill int; v_save int; v_killed int; v_saved boolean;
  v_votes jsonb; v_exec int; v_top int; v_second int; v_execRole text; v_name text; r record;
  v_aliveMafia int; v_aliveOther int; v_winner text; v_log jsonb;
  me public.mafia_secrets; v_pending int; v_alive int; v_cast int; v_lim int; v_elapsed numeric; v_complete boolean;
  v_killedRole text; v_killedName text; v_roleKo text;
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
      select coalesce(v_state->'names'->>(v_killed::text),'') into v_killedName;
      select role into v_killedRole from public.mafia_secrets where room_id=p_room and seat=v_killed;
      v_roleKo := case v_killedRole when 'mafia' then '🔪 마피아' when 'police' then '🚓 경찰' when 'doctor' then '🚑 의사' else '🙂 시민' end;
      -- 실제 마피아처럼 밤 사망자의 직업을 아침에 공개 → 추리 가능, 긴장감 상승
      v_log := v_log || to_jsonb(array['☀️ '||v_day||'일차 아침 — '||v_killedName||' 님이 밤사이 살해당했습니다. 정체는 '||v_roleKo||'!']);
    elsif v_saved then
      v_log := v_log || to_jsonb(array['☀️ '||v_day||'일차 아침 — 누군가 공격받았지만 의사가 살렸습니다! 사망자가 없습니다.']);
    else
      v_log := v_log || to_jsonb(array['☀️ '||v_day||'일차 아침 — 평화로운 밤이었습니다. 아무도 죽지 않았습니다.']);
    end if;
    -- 연출용 메타(클라 전체화면 아침 발표): 사망자 이름·직업·세이브 여부
    v_state := jsonb_set(v_state, '{lastNight}', jsonb_build_object(
      'killed', coalesce(to_jsonb(v_killed),'null'::jsonb), 'saved', v_saved, 'day', v_day,
      'name', coalesce(to_jsonb(v_killedName),'null'::jsonb), 'role', coalesce(to_jsonb(v_killedRole),'null'::jsonb)));
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
      v_roleKo := case v_execRole when 'mafia' then '🔪 마피아' when 'police' then '🚓 경찰' when 'doctor' then '🚑 의사' else '🙂 시민' end;
      v_log := v_log || to_jsonb(array['⚖️ '||v_name||' 님이 '||v_top||'표로 처형됐습니다 — 정체는 '||v_roleKo||'!']);
    else
      v_log := v_log || to_jsonb(array['⚖️ 투표가 동률/무효여서 아무도 처형되지 않았습니다.']);
    end if;
    v_state := jsonb_set(v_state, '{lastVote}', jsonb_build_object(
      'executed',coalesce(to_jsonb(v_exec),'null'::jsonb),'role',coalesce(to_jsonb(v_execRole),'null'::jsonb),
      'name',coalesce(to_jsonb(v_name),'null'::jsonb),'votes',coalesce(to_jsonb(v_top),'0'::jsonb),'day',v_day));
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
    v_log := v_log || to_jsonb(array[(case when v_winner='citizens' then '🎉 시민 승리! 마피아를 모두 처단했습니다.' else '🔪 마피아 승리! 마을이 무너졌습니다.' end)]);
  elsif v_phase = 'night' then
    v_state := jsonb_set(v_state, '{votes}', '{}'::jsonb);
    v_state := jsonb_set(v_state, '{voteCount}', '{}'::jsonb);
    v_state := jsonb_set(v_state, '{phase}', '"day"'::jsonb);
    v_log := v_log || to_jsonb(array['🗳️ '||v_day||'일차 낮 — 자유롭게 토론하고, 처형할 사람을 투표하세요.']);
  else
    v_state := jsonb_set(v_state, '{day}', to_jsonb(v_day+1));
    v_state := jsonb_set(v_state, '{votes}', '{}'::jsonb);
    v_state := jsonb_set(v_state, '{voteCount}', '{}'::jsonb);
    v_state := jsonb_set(v_state, '{phase}', '"night"'::jsonb);
    v_log := v_log || to_jsonb(array['🌙 '||(v_day+1)||'일차 밤 — 마피아가 다시 움직입니다.']);
  end if;

  if jsonb_array_length(v_log) > 30 then
    select jsonb_agg(e order by o) into v_log
    from (select e, o from jsonb_array_elements(v_log) with ordinality t(e, o) order by o desc limit 30) z;
  end if;
  v_state := jsonb_set(v_state, '{log}', v_log);
  update public.rooms set state=v_state, version=version+1 where id=p_room;
  return jsonb_build_object('ok',true,'phase',v_state->>'phase','winner',v_winner);
end; $$;

grant execute on function public.mf_start(uuid,int) to anon, authenticated;
grant execute on function public.mf_resolve_phase(uuid,int,text) to anon, authenticated;
