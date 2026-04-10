-- 将「用时率」列改为「本方平均每步用时（秒）」
SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE chess_tracker;

ALTER TABLE games
  CHANGE COLUMN time_usage_ratio avg_seconds_per_own_move DECIMAL(10, 3) NULL
    COMMENT '本方平均每步用时（秒），由 PGN %clk 推导';

ALTER TABLE daily_game_stats
  CHANGE COLUMN avg_time_usage_ratio avg_seconds_per_own_move DECIMAL(12, 3) NULL
    COMMENT '当日对局：本方平均每步用时（秒）';
