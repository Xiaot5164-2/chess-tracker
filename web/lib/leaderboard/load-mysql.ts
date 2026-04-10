import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";

import type { LeaderboardTimeControl } from "@/lib/leaderboard/time-control";

const VIEW_SQL: Record<LeaderboardTimeControl, string> = {
  rapid: "SELECT * FROM v_leaderboard_rapid",
  blitz: "SELECT * FROM v_leaderboard_blitz",
  bullet: "SELECT * FROM v_leaderboard_bullet",
  puzzle: "SELECT * FROM v_leaderboard_puzzle",
};

function gameTimeClass(tc: LeaderboardTimeControl): "rapid" | "blitz" | "bullet" | null {
  if (tc === "puzzle") return null;
  return tc;
}

/** rangeStartISO: ISO 字符串，取日期部分与 stat_date 比较 */
function rangeStartDateOnly(rangeStartISO: string): string {
  const s = String(rangeStartISO).trim();
  if (s.length >= 10) return s.slice(0, 10);
  return s;
}

export async function queryProfilesOrdered(pool: Pool): Promise<RowDataPacket[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, chess_username, display_name, avatar_url FROM profiles ORDER BY chess_username ASC",
  );
  return rows;
}

export async function queryLeaderboardView(
  pool: Pool,
  timeControl: LeaderboardTimeControl,
): Promise<{ rows: RowDataPacket[]; error: Error | null }> {
  const sql = VIEW_SQL[timeControl];
  try {
    const [rows] = await pool.query<RowDataPacket[]>(sql);
    return { rows, error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function queryLatestRatingsByProfile(
  pool: Pool,
  timeControl: LeaderboardTimeControl,
): Promise<RowDataPacket[]> {
  if (timeControl === "puzzle") {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT profile_id, rating_day_end AS rating, stat_date AS recorded_at FROM daily_puzzle_stats
       ORDER BY stat_date DESC`,
    );
    return rows;
  }
  const tc = gameTimeClass(timeControl)!;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT profile_id, rating AS rating, stat_date AS recorded_at FROM daily_game_stats
     WHERE time_class = ?
     ORDER BY stat_date DESC`,
    [tc],
  );
  return rows;
}

/**
 * 排行榜「快照最近更新」时刻：取当前库中最新 UTC 日历日 `stat_date` 上，
 * 所有棋手对应行 `computed_at` 的最小值（当日各棋手写入时间的最早一条）。
 */
export async function queryLatestSnapshotTime(
  pool: Pool,
  timeControl: LeaderboardTimeControl,
): Promise<unknown | null> {
  if (timeControl === "puzzle") {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT MIN(p.computed_at) AS snap_at
       FROM daily_puzzle_stats p
       WHERE p.stat_date = (SELECT MAX(stat_date) FROM daily_puzzle_stats)`,
    );
    return rows[0]?.snap_at ?? null;
  }
  const tc = gameTimeClass(timeControl)!;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT MIN(s.computed_at) AS snap_at
     FROM daily_game_stats s
     WHERE s.time_class = ?
       AND s.stat_date = (
         SELECT MAX(stat_date) FROM daily_game_stats WHERE time_class = ?
       )`,
    [tc, tc],
  );
  return rows[0]?.snap_at ?? null;
}

/** 按 UTC 日汇总「近 x 天」内各时限对局盘数与胜负和（来源 daily_game_stats）。谜题不适用。 */
export async function queryDailyGameStatsAggregatedSince(
  pool: Pool,
  timeControl: LeaderboardTimeControl,
  statDateGte: string,
): Promise<RowDataPacket[]> {
  if (timeControl === "puzzle") {
    return [];
  }
  const tc = gameTimeClass(timeControl)!;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT profile_id,
            COALESCE(SUM(games), 0) AS total_games,
            COALESCE(SUM(wins), 0) AS wins,
            COALESCE(SUM(losses), 0) AS losses,
            COALESCE(SUM(draws), 0) AS draws
     FROM daily_game_stats
     WHERE time_class = ? AND stat_date >= ?
     GROUP BY profile_id`,
    [tc, statDateGte],
  );
  return rows;
}

/** 近若干 UTC 日内对局级聚合；007 列缺失时仅聚合平均对手分。 */
export async function queryGamePeriodDashboardMetrics(
  pool: Pool,
  timeControl: LeaderboardTimeControl,
  periodStartUtcDay: string,
): Promise<RowDataPacket[]> {
  if (timeControl === "puzzle") {
    return [];
  }
  const tc = gameTimeClass(timeControl)!;
  const startIso = `${periodStartUtcDay}T00:00:00.000Z`;
  const baseWhere = `FROM games
       WHERE time_class = ?
         AND end_time >= ?
         AND end_time IS NOT NULL
       GROUP BY profile_id`;
  const params = [tc, startIso];
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT profile_id,
              AVG(CASE WHEN player_color = 'white' THEN black_rating ELSE white_rating END) AS avg_opp_rating,
              AVG(half_moves) / 2 AS avg_half_moves,
              AVG(avg_seconds_per_own_move) AS avg_seconds_per_own_move
       ${baseWhere}`,
      params,
    );
    return rows;
  } catch {
    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT profile_id,
                AVG(CASE WHEN player_color = 'white' THEN black_rating ELSE white_rating END) AS avg_opp_rating,
                NULL AS avg_half_moves,
                NULL AS avg_seconds_per_own_move
         ${baseWhere}`,
        params,
      );
      return rows;
    } catch {
      return [];
    }
  }
}

export async function querySeriesSince(
  pool: Pool,
  timeControl: LeaderboardTimeControl,
  rangeStartISO: string,
): Promise<RowDataPacket[]> {
  const d0 = rangeStartDateOnly(rangeStartISO);
  if (timeControl === "puzzle") {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT profile_id, stat_date AS recorded_at, rating_day_end AS rating FROM daily_puzzle_stats
       WHERE stat_date >= ? AND rating_day_end IS NOT NULL
       ORDER BY stat_date ASC`,
      [d0],
    );
    return rows;
  }
  const tc = gameTimeClass(timeControl)!;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT profile_id, stat_date AS recorded_at, rating AS rating FROM daily_game_stats
     WHERE time_class = ? AND stat_date >= ? AND rating IS NOT NULL
     ORDER BY stat_date ASC`,
    [tc, d0],
  );
  return rows;
}
