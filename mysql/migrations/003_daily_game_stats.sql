-- 按 UTC 日 × 棋钟（rapid/blitz/bullet）汇总盘数与胜负和（来源：games.player_result）。
-- Worker 在 SYNC_GAMES=1 且每次 games 同步结束后会重算近 DAILY_GAME_STATS_LOOKBACK_DAYS 个 UTC 日；亦可用 scripts/rebuild-daily-stats.mjs。
-- hourly 等级分仍只在 daily_stats，不在此表。
SET NAMES utf8mb4;

USE chess_tracker;

CREATE TABLE IF NOT EXISTS daily_game_stats (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  profile_id CHAR(36) NOT NULL,
  stat_date DATE NOT NULL COMMENT 'UTC 日历日',
  time_class ENUM('rapid', 'blitz', 'bullet') NOT NULL,
  games INT UNSIGNED NOT NULL DEFAULT 0,
  wins INT UNSIGNED NOT NULL DEFAULT 0,
  losses INT UNSIGNED NOT NULL DEFAULT 0,
  draws INT UNSIGNED NOT NULL DEFAULT 0,
  outcome_unknown INT UNSIGNED NOT NULL DEFAULT 0,
  avg_half_moves DECIMAL(14, 4) NULL,
  avg_full_moves DECIMAL(14, 4) NULL,
  avg_time_control_base_sec DECIMAL(16, 4) NULL,
  avg_player_seconds_used DECIMAL(16, 4) NULL,
  rating_start_of_day INT NULL,
  rating_end_of_day INT NULL,
  rating_prev_day_end INT NULL,
  rating_delta_vs_prev_day INT NULL,
  rating_intraday_delta INT NULL,
  live_rapid INT NULL,
  live_blitz INT NULL,
  live_bullet INT NULL,
  live_puzzle INT NULL,
  computed_at TIMESTAMP(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
  UNIQUE KEY uk_daily_game_stats_profile_date_class (profile_id, stat_date, time_class),
  KEY idx_daily_game_stats_profile_date (profile_id, stat_date DESC),
  KEY idx_daily_game_stats_date (stat_date DESC),
  CONSTRAINT fk_daily_game_stats_profile FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
