-- 006 占位：棋钟日表「单列 rating」已合入 `005_split_daily_stats.sql`。
-- 若生产库曾应用旧版 005（含 rating_day_start / rating_day_end），请备份后执行：
--   mysql ... < scripts/mysql-legacy-005-to-single-rating.sql
SET NAMES utf8mb4;
SET time_zone = '+00:00';
