-- Puzzle leaderboard (legacy: pub API tactics highest → chess_tactics; superseded by 20250408140000)
create or replace view public.v_leaderboard_puzzle
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
    rating_type = 'chess_tactics'
)
select
  p.id as profile_id,
  p.chess_username,
  p.display_name,
  p.avatar_url,
  r.rating as puzzle_rating,
  (r.rating - coalesce(r.prev_rating, r.rating)) as puzzle_delta,
  r.recorded_at as puzzle_recorded_at
from
  ranked r
  join public.profiles p on p.id = r.profile_id
where
  r.rn = 1;

grant select on public.v_leaderboard_puzzle to anon, authenticated;
