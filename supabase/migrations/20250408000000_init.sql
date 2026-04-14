-- Chess Tracker — core schema
-- Extensions
create extension if not exists "pgcrypto";

-- Students / players (Chess.com usernames)
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  chess_username text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Rating snapshots (UTC hour buckets) for leaderboards & trends
create table public.daily_stats (
  id bigserial primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  rating_type text not null,
  rating integer not null,
  recorded_at timestamptz not null default to_timestamp(3600 * floor(extract(epoch from now()) / 3600)),
  unique (profile_id, rating_type, recorded_at)
);

-- Raw games for Phase 2 (PGN pipeline)
create table public.games (
  game_id text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  pgn text,
  end_time timestamptz,
  result text
);

create index daily_stats_profile_type_date_idx on public.daily_stats (profile_id, rating_type, recorded_at desc);

create index daily_stats_type_date_idx on public.daily_stats (rating_type, recorded_at desc);

create index games_profile_end_idx on public.games (profile_id, end_time desc);

-- Latest Rapid per profile + delta vs previous snapshot (any prior day)
create or replace view public.v_leaderboard_rapid
with
  (security_invoker = true) as
with ranked as (
  select
    profile_id,
    rating,
    recorded_at,
    row_number() over (
      partition by profile_id
      order by
        recorded_at desc
    ) as rn,
    lag(rating) over (
      partition by profile_id
      order by
        recorded_at
    ) as prev_rating
  from public.daily_stats
  where
    rating_type = 'chess_rapid'
)
select
  p.id as profile_id,
  p.chess_username,
  p.display_name,
  p.avatar_url,
  r.rating as rapid_rating,
  (r.rating - coalesce(r.prev_rating, r.rating)) as rapid_delta,
  r.recorded_at as rapid_recorded_at
from
  ranked r
  join public.profiles p on p.id = r.profile_id
where
  r.rn = 1;

create or replace view public.v_leaderboard_blitz
with
  (security_invoker = true) as
with ranked as (
  select
    profile_id,
    rating,
    recorded_at,
    row_number() over (
      partition by profile_id
      order by
        recorded_at desc
    ) as rn,
    lag(rating) over (
      partition by profile_id
      order by
        recorded_at
    ) as prev_rating
  from public.daily_stats
  where
    rating_type = 'chess_blitz'
)
select
  p.id as profile_id,
  p.chess_username,
  p.display_name,
  p.avatar_url,
  r.rating as blitz_rating,
  (r.rating - coalesce(r.prev_rating, r.rating)) as blitz_delta,
  r.recorded_at as blitz_recorded_at
from
  ranked r
  join public.profiles p on p.id = r.profile_id
where
  r.rn = 1;

create or replace view public.v_leaderboard_bullet
with
  (security_invoker = true) as
with ranked as (
  select
    profile_id,
    rating,
    recorded_at,
    row_number() over (
      partition by profile_id
      order by
        recorded_at desc
    ) as rn,
    lag(rating) over (
      partition by profile_id
      order by
        recorded_at
    ) as prev_rating
  from public.daily_stats
  where
    rating_type = 'chess_bullet'
)
select
  p.id as profile_id,
  p.chess_username,
  p.display_name,
  p.avatar_url,
  r.rating as bullet_rating,
  (r.rating - coalesce(r.prev_rating, r.rating)) as bullet_delta,
  r.recorded_at as bullet_recorded_at
from
  ranked r
  join public.profiles p on p.id = r.profile_id
where
  r.rn = 1;

-- RLS: public read for leaderboard data; writes via service role (worker)
alter table public.profiles enable row level security;

alter table public.daily_stats enable row level security;

alter table public.games enable row level security;

create policy "profiles_select_public" on public.profiles for select to anon, authenticated using (true);

create policy "daily_stats_select_public" on public.daily_stats for select to anon, authenticated using (true);

-- games: not exposed to anon until Phase 2 / auth rules are defined
create policy "games_select_authenticated" on public.games for select to authenticated using (true);

grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;

grant select on public.daily_stats to anon, authenticated;

grant select on public.games to authenticated;

grant select on public.v_leaderboard_rapid to anon, authenticated;

grant select on public.v_leaderboard_blitz to anon, authenticated;

grant select on public.v_leaderboard_bullet to anon, authenticated;
