-- 拆分原 daily_stats：棋钟走 daily_game_stats，谜题走 daily_puzzle_stats；删除 hourly daily_stats。
-- 棋钟 rating：由 games.player_rating 与对局时间推导（见 Worker RefreshDailyGameStatsFromGames）。
SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE chess_tracker;

DROP VIEW IF EXISTS v_leaderboard_rapid;
DROP VIEW IF EXISTS v_leaderboard_blitz;
DROP VIEW IF EXISTS v_leaderboard_bullet;
DROP VIEW IF EXISTS v_leaderboard_puzzle;

DROP TABLE IF EXISTS daily_stats;

DROP TABLE IF EXISTS daily_game_stats;

CREATE TABLE daily_game_stats (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  profile_id CHAR(36) NOT NULL,
  stat_date DATE NOT NULL COMMENT 'UTC 日历日',
  time_class ENUM('rapid', 'blitz', 'bullet') NOT NULL,
  games INT UNSIGNED NOT NULL DEFAULT 0,
  wins INT UNSIGNED NOT NULL DEFAULT 0,
  losses INT UNSIGNED NOT NULL DEFAULT 0,
  draws INT UNSIGNED NOT NULL DEFAULT 0,
  outcome_unknown INT UNSIGNED NOT NULL DEFAULT 0,
  rating INT NULL COMMENT '当日等级分：有对局时为当日最后一盘 player_rating；无对局时为上一日 rating',
  computed_at TIMESTAMP(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
  UNIQUE KEY uk_daily_game_stats_profile_date_class (profile_id, stat_date, time_class),
  KEY idx_daily_game_stats_profile_date (profile_id, stat_date DESC),
  KEY idx_daily_game_stats_date (stat_date DESC),
  CONSTRAINT fk_daily_game_stats_profile FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_puzzle_stats (
  profile_id CHAR(36) NOT NULL,
  stat_date DATE NOT NULL COMMENT 'UTC 日历日',
  rating_day_start INT NULL COMMENT '前一 UTC 日结束分，或首次写入时的当前分',
  rating_day_end INT NULL COMMENT '当日同步得到的谜题当前分',
  computed_at TIMESTAMP(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
  PRIMARY KEY (profile_id, stat_date),
  KEY idx_daily_puzzle_stats_date (stat_date DESC),
  CONSTRAINT fk_daily_puzzle_stats_profile FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
