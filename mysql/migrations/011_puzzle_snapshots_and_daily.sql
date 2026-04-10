-- 谜题 callback 原始快照表 + daily_puzzle_stats 日维度尝试/通过/失败/用时（相对前一日累计差分）
SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE chess_tracker;

CREATE TABLE IF NOT EXISTS puzzle_snapshots (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  profile_id CHAR(36) NOT NULL COMMENT 'profiles.id',
  fetched_at TIMESTAMP(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)) COMMENT '拉取时刻 UTC',
  rating INT NULL,
  highest_rating INT NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  passed_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_count INT UNSIGNED NOT NULL DEFAULT 0,
  total_seconds BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_date_raw VARCHAR(80) NULL COMMENT 'API stats.last_date 原文',
  puzzle_rank BIGINT UNSIGNED NULL COMMENT '全站排名，对应 JSON rank',
  percentile DECIMAL(6, 2) NULL,
  KEY idx_puzzle_snapshots_profile_fetched (profile_id, fetched_at DESC),
  CONSTRAINT fk_puzzle_snapshots_profile FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE daily_puzzle_stats
  ADD COLUMN cum_attempts BIGINT UNSIGNED NULL COMMENT 'API 累计 attempt_count（当次同步末值）' AFTER computed_at,
  ADD COLUMN cum_passed BIGINT UNSIGNED NULL COMMENT 'API 累计 passed_count' AFTER cum_attempts,
  ADD COLUMN cum_failed BIGINT UNSIGNED NULL COMMENT 'API 累计 failed_count' AFTER cum_passed,
  ADD COLUMN cum_total_seconds BIGINT UNSIGNED NULL COMMENT 'API 累计 total_seconds' AFTER cum_failed,
  ADD COLUMN attempts INT UNSIGNED NULL COMMENT 'UTC 当日新增尝试数（本日 cum - 前一日 cum）' AFTER cum_total_seconds,
  ADD COLUMN passed INT UNSIGNED NULL COMMENT 'UTC 当日通过数' AFTER attempts,
  ADD COLUMN failed INT UNSIGNED NULL COMMENT 'UTC 当日失败数' AFTER passed,
  ADD COLUMN seconds_played BIGINT UNSIGNED NULL COMMENT 'UTC 当日对应用时（秒）' AFTER failed;
