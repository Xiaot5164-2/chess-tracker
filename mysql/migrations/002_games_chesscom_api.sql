-- One-time upgrade: legacy `games` (PK game_id) → Chess.com API–aligned schema.
-- Safe to re-run: no-ops if `chesscom_uuid` already exists or legacy columns are absent.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE chess_tracker;

DROP PROCEDURE IF EXISTS migrate_games_to_chesscom_api;

DELIMITER //

CREATE PROCEDURE migrate_games_to_chesscom_api()
BEGIN
  DECLARE v_legacy INT DEFAULT 0;
  DECLARE v_new INT DEFAULT 0;

  SELECT COUNT(*) INTO v_legacy
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'games' AND COLUMN_NAME = 'game_id';

  SELECT COUNT(*) INTO v_new
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'games' AND COLUMN_NAME = 'chesscom_uuid';

  IF v_new > 0 OR v_legacy = 0 THEN
    SELECT 'migrate_games_to_chesscom_api: skipped' AS status;
  ELSE
    ALTER TABLE games DROP FOREIGN KEY fk_games_profile;
    RENAME TABLE games TO games_legacy_001;

    CREATE TABLE games (
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

    INSERT INTO games (
      profile_id, chesscom_uuid, game_url, pgn, end_time,
      white_username, black_username, player_color, player_result
    )
    SELECT
      l.profile_id,
      CASE
        WHEN CHAR_LENGTH(TRIM(l.game_id)) BETWEEN 36 AND 64 AND TRIM(l.game_id) LIKE '%-%-%-%-%' THEN TRIM(l.game_id)
        ELSE LOWER(LEFT(SHA2(CONCAT(l.profile_id, '-', l.game_id), 256), 64))
      END,
      'https://www.chess.com/game/legacy',
      l.pgn,
      l.end_time,
      'unknown',
      'unknown',
      'white',
      l.result
    FROM games_legacy_001 l;

    DROP TABLE games_legacy_001;
    SELECT 'migrate_games_to_chesscom_api: done' AS status;
  END IF;
END //

DELIMITER ;

CALL migrate_games_to_chesscom_api();
DROP PROCEDURE IF EXISTS migrate_games_to_chesscom_api;
