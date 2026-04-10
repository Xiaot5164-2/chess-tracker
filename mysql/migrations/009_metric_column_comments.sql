-- 澄清列语义（games.time_usage_ratio 已改为「本方每步用时压力」均值，非终局单点比）。
SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE chess_tracker;

ALTER TABLE games
  MODIFY COLUMN half_moves INT UNSIGNED NULL
    COMMENT 'PGN 半回合（步）数；展示完整回合时聚合除以 2';

ALTER TABLE games
  MODIFY COLUMN time_usage_ratio DECIMAL(7, 6) NULL
    COMMENT '本方每步用时/开局主时钟 的步均（见 Worker AvgOwnMoveTimePressureRatio）';

ALTER TABLE daily_game_stats
  MODIFY COLUMN avg_half_moves DECIMAL(14, 4) NULL
    COMMENT '当日对局：平均完整回合数（半回合 AVG 再 /2）';

ALTER TABLE daily_game_stats
  MODIFY COLUMN avg_time_usage_ratio DECIMAL(12, 6) NULL
    COMMENT '当日对局：time_usage_ratio 的日均（本方每步用时压力）';
