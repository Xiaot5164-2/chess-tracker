-- Chess Tracker — MySQL 8+ schema (replaces former Postgres/Supabase migrations)
SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE chess_tracker;

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  chess_username VARCHAR(64) NOT NULL,
  display_name VARCHAR(512) NULL,
  avatar_url TEXT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
  UNIQUE KEY uk_profiles_chess_username (chess_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_stats (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  profile_id CHAR(36) NOT NULL,
  rating_type VARCHAR(64) NOT NULL,
  rating INT NOT NULL,
  recorded_at TIMESTAMP(6) NOT NULL DEFAULT (
    FROM_UNIXTIME(3600 * FLOOR(UNIX_TIMESTAMP(UTC_TIMESTAMP(6)) / 3600))
  ),
  UNIQUE KEY uk_daily_stats_profile_type_recorded (profile_id, rating_type, recorded_at),
  KEY idx_daily_stats_profile_type_date (profile_id, rating_type, recorded_at DESC),
  KEY idx_daily_stats_type_date (rating_type, recorded_at DESC),
  CONSTRAINT fk_daily_stats_profile FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Monthly games JSON: https://api.chess.com/pub/player/{user}/games/{YYYY}/{MM}
CREATE TABLE IF NOT EXISTS games (
  profile_id CHAR(36) NOT NULL,
  chesscom_uuid VARCHAR(64) NOT NULL,
  game_url VARCHAR(768) NOT NULL,
  pgn LONGTEXT NULL,
  time_control VARCHAR(64) NULL,
  end_time TIMESTAMP(6) NULL,
  rated TINYINT(1) NULL,
  time_class VARCHAR(32) NULL,
  rules VARCHAR(32) NULL,
  white_username VARCHAR(64) NOT NULL,
  black_username VARCHAR(64) NOT NULL,
  white_rating INT NULL,
  black_rating INT NULL,
  white_result VARCHAR(32) NULL,
  black_result VARCHAR(32) NULL,
  player_color ENUM('white', 'black') NOT NULL,
  player_rating INT NULL,
  player_result VARCHAR(32) NULL,
  accuracy_white DECIMAL(7, 4) NULL,
  accuracy_black DECIMAL(7, 4) NULL,
  tcn VARCHAR(2048) NULL,
  fen TEXT NULL,
  initial_setup VARCHAR(512) NULL,
  eco_url VARCHAR(1024) NULL,
  fetched_at TIMESTAMP(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
  PRIMARY KEY (profile_id, chesscom_uuid),
  KEY idx_games_profile_end (profile_id, end_time DESC),
  KEY idx_games_profile_time_class (profile_id, time_class),
  CONSTRAINT fk_games_profile FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW v_leaderboard_rapid AS
WITH ranked AS (
  SELECT
    profile_id,
    rating,
    recorded_at,
    ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY recorded_at DESC) AS rn,
    LAG(rating) OVER (PARTITION BY profile_id ORDER BY recorded_at) AS prev_rating
  FROM daily_stats
  WHERE rating_type = 'chess_rapid'
)
SELECT
  p.id AS profile_id,
  p.chess_username,
  p.display_name,
  p.avatar_url,
  r.rating AS rapid_rating,
  (r.rating - COALESCE(r.prev_rating, r.rating)) AS rapid_delta,
  r.recorded_at AS rapid_recorded_at
FROM ranked r
JOIN profiles p ON p.id = r.profile_id
WHERE r.rn = 1;

CREATE OR REPLACE VIEW v_leaderboard_blitz AS
WITH ranked AS (
  SELECT
    profile_id,
    rating,
    recorded_at,
    ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY recorded_at DESC) AS rn,
    LAG(rating) OVER (PARTITION BY profile_id ORDER BY recorded_at) AS prev_rating
  FROM daily_stats
  WHERE rating_type = 'chess_blitz'
)
SELECT
  p.id AS profile_id,
  p.chess_username,
  p.display_name,
  p.avatar_url,
  r.rating AS blitz_rating,
  (r.rating - COALESCE(r.prev_rating, r.rating)) AS blitz_delta,
  r.recorded_at AS blitz_recorded_at
FROM ranked r
JOIN profiles p ON p.id = r.profile_id
WHERE r.rn = 1;

CREATE OR REPLACE VIEW v_leaderboard_bullet AS
WITH ranked AS (
  SELECT
    profile_id,
    rating,
    recorded_at,
    ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY recorded_at DESC) AS rn,
    LAG(rating) OVER (PARTITION BY profile_id ORDER BY recorded_at) AS prev_rating
  FROM daily_stats
  WHERE rating_type = 'chess_bullet'
)
SELECT
  p.id AS profile_id,
  p.chess_username,
  p.display_name,
  p.avatar_url,
  r.rating AS bullet_rating,
  (r.rating - COALESCE(r.prev_rating, r.rating)) AS bullet_delta,
  r.recorded_at AS bullet_recorded_at
FROM ranked r
JOIN profiles p ON p.id = r.profile_id
WHERE r.rn = 1;

CREATE OR REPLACE VIEW v_leaderboard_puzzle AS
WITH ranked AS (
  SELECT
    profile_id,
    rating,
    recorded_at,
    ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY recorded_at DESC) AS rn,
    LAG(rating) OVER (PARTITION BY profile_id ORDER BY recorded_at) AS prev_rating
  FROM daily_stats
  WHERE rating_type = 'chess_puzzle_current'
)
SELECT
  p.id AS profile_id,
  p.chess_username,
  p.display_name,
  p.avatar_url,
  r.rating AS puzzle_rating,
  (r.rating - COALESCE(r.prev_rating, r.rating)) AS puzzle_delta,
  r.recorded_at AS puzzle_recorded_at
FROM ranked r
JOIN profiles p ON p.id = r.profile_id
WHERE r.rn = 1;
