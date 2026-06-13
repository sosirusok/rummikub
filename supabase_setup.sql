-- =====================================================================
-- 루미큐브 4인 실시간 — Supabase 1회 설정
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 RUN (한 번만 실행)
-- =====================================================================

-- 방 (단일 행)
create table if not exists public.room (
  id         text primary key default 'main',
  status     text not null default 'waiting',   -- waiting | playing | finished
  state      jsonb,                             -- 전체 게임 상태
  version    bigint not null default 0,         -- 낙관적 동시성 토큰
  updated_at timestamptz not null default now()
);

-- 좌석 (기본키 = seat → 중복 선택 원천 차단)
create table if not exists public.seats (
  seat       int primary key check (seat between 1 and 4),
  player_id  text not null,
  name       text,
  claimed_at timestamptz not null default now()
);

-- 단일 방 행 보장
insert into public.room (id) values ('main') on conflict (id) do nothing;

-- updated_at 자동 갱신
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_room_touch on public.room;
create trigger trg_room_touch before update on public.room
  for each row execute function public.touch_updated_at();

-- RLS (친구용 공개 게임: 익명 전체 허용)
alter table public.room  enable row level security;
alter table public.seats enable row level security;
drop policy if exists room_all  on public.room;
drop policy if exists seats_all on public.seats;
create policy room_all  on public.room  for all using (true) with check (true);
create policy seats_all on public.seats for all using (true) with check (true);

-- DELETE 이벤트에 이전 행 포함
alter table public.seats replica identity full;

-- Realtime 발행에 테이블 추가 (중복 실행 안전)
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='room') then
    alter publication supabase_realtime add table public.room;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='seats') then
    alter publication supabase_realtime add table public.seats;
  end if;
end $$;
