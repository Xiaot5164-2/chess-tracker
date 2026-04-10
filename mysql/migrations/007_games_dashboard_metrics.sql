-- 对局级指标：供排行榜「近 N 天」聚合（平均对手分、平均回合数、平均用时率）
SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE chess_tracker;

ALTER TABLE games
  ADD COLUMN half_moves INT UNSIGNED NULL COMMENT '从 PGN 解析的半回合（步）数' AFTER eco_url,
  ADD COLUMN time_budget_sec INT UNSIGNED NULL COMMENT '从 time_control 解析的主时钟秒数（不含 Daily）' AFTER half_moves,
  ADD COLUMN time_usage_ratio DECIMAL(7, 6) NULL COMMENT '估算：对局内已用时间/开局时钟预算 [0,1+]' AFTER time_budget_sec;
