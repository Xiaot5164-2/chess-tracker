-- 按日、棋钟汇总「对手均分 / 平均半回合 / 平均用时率」（来源 games 表 007 列），供统计与可选报表。
SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE chess_tracker;

ALTER TABLE daily_game_stats
  ADD COLUMN avg_opponent_rating DECIMAL(10, 2) NULL COMMENT '当日对局：对手平均等级分' AFTER rating,
  ADD COLUMN avg_half_moves DECIMAL(14, 4) NULL COMMENT '当日对局：平均半回合数' AFTER avg_opponent_rating,
  ADD COLUMN avg_time_usage_ratio DECIMAL(12, 6) NULL COMMENT '当日对局：平均用时率' AFTER avg_half_moves;
