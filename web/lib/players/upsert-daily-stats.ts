import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";

function utcTodayDateStr(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 谜题当前分 → daily_puzzle_stats（UTC 当日）。棋钟分仅由 games→daily_game_stats 推导，不用 pub /stats。
 */
export async function upsertDailyPuzzleStats(
  pool: Pool,
  profileId: string,
  puzzleCurrent: number | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (puzzleCurrent == null || !Number.isFinite(puzzleCurrent)) {
    return { ok: true };
  }

  const statDate = utcTodayDateStr();
  const end = Math.round(puzzleCurrent);

  const conn = await pool.getConnection();
  try {
    const [prevRows] = await conn.query<RowDataPacket[]>(
      `SELECT rating_day_end FROM daily_puzzle_stats
       WHERE profile_id = ? AND stat_date = DATE_SUB(?, INTERVAL 1 DAY)`,
      [profileId, statDate],
    );
    const prevRaw = prevRows[0]?.rating_day_end;
    const prev = prevRaw != null && Number.isFinite(Number(prevRaw)) ? Number(prevRaw) : null;
    const start = prev != null && Number.isFinite(prev) ? prev : end;

    await conn.execute(
      `INSERT INTO daily_puzzle_stats (profile_id, stat_date, rating_day_start, rating_day_end, computed_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(6))
       ON DUPLICATE KEY UPDATE
         rating_day_end = VALUES(rating_day_end),
         rating_day_start = COALESCE(daily_puzzle_stats.rating_day_start, VALUES(rating_day_start)),
         computed_at = UTC_TIMESTAMP(6)`,
      [profileId, statDate, start, end],
    );
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  } finally {
    conn.release();
  }
}
