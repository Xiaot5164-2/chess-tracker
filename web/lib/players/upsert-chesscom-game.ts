import type { Pool } from "mysql2/promise";

import type { ChesscomGameRow } from "@/lib/players/build-chesscom-game";

export async function upsertChesscomGame(pool: Pool, profileId: string, g: ChesscomGameRow): Promise<void> {
  const q = `
INSERT INTO games (
  profile_id, chesscom_uuid, game_url, pgn, time_control, end_time, rated,
  time_class, rules, white_username, black_username,
  white_rating, black_rating, white_result, black_result,
  player_color, player_rating, player_result,
  accuracy_white, accuracy_black, tcn, fen, initial_setup, eco_url, fetched_at
) VALUES (
  ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6)
)
ON DUPLICATE KEY UPDATE
  game_url = VALUES(game_url),
  pgn = VALUES(pgn),
  time_control = VALUES(time_control),
  end_time = VALUES(end_time),
  rated = VALUES(rated),
  time_class = VALUES(time_class),
  rules = VALUES(rules),
  white_username = VALUES(white_username),
  black_username = VALUES(black_username),
  white_rating = VALUES(white_rating),
  black_rating = VALUES(black_rating),
  white_result = VALUES(white_result),
  black_result = VALUES(black_result),
  player_color = VALUES(player_color),
  player_rating = VALUES(player_rating),
  player_result = VALUES(player_result),
  accuracy_white = VALUES(accuracy_white),
  accuracy_black = VALUES(accuracy_black),
  tcn = VALUES(tcn),
  fen = VALUES(fen),
  initial_setup = VALUES(initial_setup),
  eco_url = VALUES(eco_url),
  fetched_at = UTC_TIMESTAMP(6)`;

  await pool.execute(q, [
    profileId,
    g.chesscom_uuid,
    g.game_url,
    g.pgn,
    g.time_control,
    g.end_time,
    g.rated,
    g.time_class,
    g.rules,
    g.white_username,
    g.black_username,
    g.white_rating,
    g.black_rating,
    g.white_result,
    g.black_result,
    g.player_color,
    g.player_rating,
    g.player_result,
    g.accuracy_white,
    g.accuracy_black,
    g.tcn,
    g.fen,
    g.initial_setup,
    g.eco_url,
  ]);
}
