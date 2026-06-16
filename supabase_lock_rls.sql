-- =====================================================================
-- 보안 잠금 (RLS) — ⚠⚠ 신규 클라이언트 배포가 끝난 뒤에만 RUN! ⚠⚠
-- 배포 전에 실행하면 구버전 클라가 직접 쓰기 차단으로 멈춥니다.
-- (먼저 supabase_setup.sql 의 v6 블록을 RUN → 새 클라 배포 → 그 다음 이 파일 RUN)
-- 멱등. 다시 실행해도 안전.
-- =====================================================================

-- rooms / room_members / room_presence:
--   anon 은 읽기(SELECT)만 허용 → 로비 렌더링 + realtime 구독 유지.
--   쓰기(INSERT/UPDATE/DELETE)는 전부 토큰검증 SECURITY DEFINER RPC(소유자 권한)로만.
drop policy if exists rooms_all     on public.rooms;
drop policy if exists members_all   on public.room_members;
drop policy if exists presence_all  on public.room_presence;
drop policy if exists rooms_read    on public.rooms;
drop policy if exists members_read  on public.room_members;
drop policy if exists presence_read on public.room_presence;

create policy rooms_read    on public.rooms        for select using (true);
create policy members_read  on public.room_members for select using (true);
create policy presence_read on public.room_presence for select using (true);

-- 이중 방어: anon/authenticated 의 테이블 직접 쓰기 권한 회수.
-- (SECURITY DEFINER RPC 는 함수 소유자 권한으로 실행되므로 영향 없음)
revoke insert, update, delete on public.rooms         from anon, authenticated;
revoke insert, update, delete on public.room_members  from anon, authenticated;
revoke insert, update, delete on public.room_presence from anon, authenticated;

-- 인증 없는 구 개발자 초기화 함수 제거(인증 버전 rk_admin_reset_rooms(uuid,int[]) 로 대체됨)
drop function if exists public.rk_admin_reset_rooms(int[]);

-- 확인용: 아래로 현재 정책을 점검할 수 있음
-- select schemaname, tablename, policyname, cmd from pg_policies
--  where tablename in ('rooms','room_members','room_presence') order by tablename;
