-- 一次性：从旧版 005（daily_game_stats 含 rating_day_start + rating_day_end）升级到单列 rating。
-- 执行前请备份；若表已是单列 rating，勿执行（会报错）。
SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE chess_tracker;

DROP VIEW IF EXISTS v_leaderboard_rapid;
DROP VIEW IF EXISTS v_leaderboard_blitz;
DROP VIEW IF EXISTS v_leaderboard_bullet;
DROP VIEW IF EXISTS v_leaderboard_puzzle;

ALTER TABLE daily_game_stats DROP COLUMN rating_day_start;

ALTER TABLE daily_game_stats
  CHANGE COLUMN rating_day_end rating INT NULL
  COMMENT '当日等级分：有对局时为当日最后一盘 player_rating；无对局时为上一日 rating';

CREATE OR REPLACE VIEW v_leaderboard_rapid AS
WITH ranked AS (
  SELECT
    profile_id,
    rating AS rapid_rating,
    stat_date,
    ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY stat_date DESC) AS rn,
    LAG(rating) OVER (PARTITION BY profile_id ORDER BY stat_date) AS prev_end
  FROM daily_game_stats
  WHERE time_class = 'rapid' AND rating IS NOT NULL
)
SELECT
  p.id AS profile_id,
  p.chess_username,
  p.display_name,
  p.avatar_url,
  r.rapid_rating,
  (r.rapid_rating - COALESCE(r.prev_end, r.rapid_rating)) AS rapid_delta,
  TIMESTAMP(r.stat_date) AS rapid_recorded_at
FROM ranked r
JOIN profiles p ON p.id = r.profile_id
WHERE r.rn = 1;

CREATE OR REPLACE VIEW v_leaderboard_blitz AS
WITH ranked AS (
  SELECT
    profile_id,
    rating AS blitz_rating,
    stat_date,
    ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY stat_date DESC) AS rn,
    LAG(rating) OVER (PARTITION BY profile_id ORDER BY stat_date) AS prev_end
  FROM daily_game_stats
  WHERE time_class = 'blitz' AND rating IS NOT NULL
)
SELECT
  p.id AS profile_id,
  p.chess_username,
  p.display_name,
  p.avatar_url,
  r.blitz_rating,
  (r.blitz_rating - COALESCE(r.prev_end, r.blitz_rating)) AS blitz_delta,
  TIMESTAMP(r.stat_date) AS blitz_recorded_at
FROM ranked r
JOIN profiles p ON p.id = r.profile_id
WHERE r.rn = 1;

CREATE OR REPLACE VIEW v_leaderboard_bullet AS
WITH ranked AS (
  SELECT
    profile_id,
    rating AS bullet_rating,
    stat_date,
    ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY stat_date DESC) AS rn,
    LAG(rating) OVER (PARTITION BY profile_id ORDER BY stat_date) AS prev_end
  FROM daily_game_stats
  WHERE time_class = 'bullet' AND rating IS NOT NULL
)
SELECT
  p.id AS profile_id,
  p.chess_username,
  p.display_name,
  p.avatar_url,
  r.bullet_rating,
  (r.bullet_rating - COALESCE(r.prev_end, r.bullet_rating)) AS bullet_delta,
  TIMESTAMP(r.stat_date) AS bullet_recorded_at
FROM ranked r
JOIN profiles p ON p.id = r.profile_id
WHERE r.rn = 1;

CREATE OR REPLACE VIEW v_leaderboard_puzzle AS
WITH ranked AS (
  SELECT
    profile_id,
    rating_day_end AS puzzle_rating,
    stat_date,
    ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY stat_date DESC) AS rn,
    LAG(rating_day_end) OVER (PARTITION BY profile_id ORDER BY stat_date) AS prev_end
  FROM daily_puzzle_stats
  WHERE rating_day_end IS NOT NULL
)
SELECT
  p.id AS profile_id,
  p.chess_username,
  p.display_name,
  p.avatar_url,
  r.puzzle_rating,
  (r.puzzle_rating - COALESCE(r.prev_end, r.puzzle_rating)) AS puzzle_delta,
  TIMESTAMP(r.stat_date) AS puzzle_recorded_at
FROM ranked r
JOIN profiles p ON p.id = r.profile_id
WHERE r.rn = 1;
