-- Leaderboard views for Blitz and Bullet (same shape as v_leaderboard_rapid).
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

grant select on public.v_leaderboard_blitz to anon, authenticated;

grant select on public.v_leaderboard_bullet to anon, authenticated;
