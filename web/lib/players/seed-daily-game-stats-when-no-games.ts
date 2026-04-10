import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";

import { fetchChessComPubStats } from "@/lib/chesscom/pub-stats";

function normProfileId(v: unknown): string {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) {
    return v.toString("utf8");
  }
  return String(v ?? "");
}

function utcTodayDateStr(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 仅当 `games` 中该 profile×(rapid|blitz|bullet) 无任何对局时，用 pub /stats 的 last.rating 写入 UTC 当日 daily_game_stats（games=0）。
 */
export async function seedDailyGameStatsWhenNoGames(pool: Pool): Promise<void> {
  const [gameKeys] = await pool.query<RowDataPacket[]>(`
SELECT DISTINCT profile_id, LOWER(TRIM(time_class)) AS tc
FROM games
WHERE end_time IS NOT NULL
  AND LOWER(TRIM(time_class)) IN ('rapid', 'blitz', 'bullet')
`);

  const hasGames = new Set<string>();
  for (const row of gameKeys ?? []) {
    hasGames.add(`${normProfileId(row.profile_id)}|${String(row.tc).toLowerCase()}`);
  }

  const [profiles] = await pool.query<RowDataPacket[]>(
    "SELECT id, chess_username FROM profiles ORDER BY chess_username ASC",
  );

  const statDate = utcTodayDateStr();
  const q = `
INSERT INTO daily_game_stats (
  profile_id, stat_date, time_class,
  games, wins, losses, draws, outcome_unknown,
  rating,
  avg_opponent_rating, avg_half_moves, avg_seconds_per_own_move,
  computed_at
) VALUES (?, ?, ?, 0, 0, 0, 0, 0, ?, NULL, NULL, NULL, UTC_TIMESTAMP(6))
ON DUPLICATE KEY UPDATE
  rating = IF(daily_game_stats.games = 0, VALUES(rating), daily_game_stats.rating),
  computed_at = IF(daily_game_stats.games = 0, UTC_TIMESTAMP(6), daily_game_stats.computed_at)`;

  const slots: { tc: "rapid" | "blitz" | "bullet"; key: "chess_rapid" | "chess_blitz" | "chess_bullet" }[] = [
    { tc: "rapid", key: "chess_rapid" },
    { tc: "blitz", key: "chess_blitz" },
    { tc: "bullet", key: "chess_bullet" },
  ];

  for (const p of profiles ?? []) {
    const pid = normProfileId(p.id);
    const username = String(p.chess_username ?? "").trim();
    if (!username) continue;

    let ratings: Awaited<ReturnType<typeof fetchChessComPubStats>>;
    try {
      ratings = await fetchChessComPubStats(username);
    } catch {
      await sleep(500);
      continue;
    }

    for (const { tc, key } of slots) {
      if (hasGames.has(`${pid}|${tc}`)) {
        continue;
      }
      const raw = ratings[key];
      if (raw == null || typeof raw !== "number" || !Number.isFinite(raw)) {
        continue;
      }
      const r = Math.round(raw);
      await pool.execute(q, [pid, statDate, tc, r]);
    }

    await sleep(500);
  }
}
