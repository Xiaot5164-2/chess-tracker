import type { Pool, RowDataPacket } from "mysql2/promise";

/**
 * 与 backend-go/store.RefreshDailyGameStatsFromGames 一致：从 games 全量重建 daily_game_stats。
 */
type DayKey = `${string}-${string}-${string}`;

function fmtDay(d: Date): DayKey {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}` as DayKey;
}

function parseMysqlDate(v: unknown): Date {
  if (v instanceof Date) return v;
  const s = String(v);
  if (s.length >= 10) return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
  return new Date(s);
}

/** MySQL DATE / DATETIME → YYYY-MM-DD（UTC） */
function dateKeyUTC(v: unknown): DayKey {
  if (v instanceof Date) return fmtDay(v);
  const s = String(v);
  if (s.length >= 10) return s.slice(0, 10) as DayKey;
  return fmtDay(parseMysqlDate(v));
}

function addDaysUTC(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export async function refreshDailyGameStatsFromGames(pool: Pool): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`DELETE FROM daily_game_stats`);

    const [aggRows] = await conn.query<RowDataPacket[]>(`
SELECT
  g.profile_id,
  LOWER(TRIM(g.time_class)) AS tc,
  DATE(g.end_time) AS stat_date,
  COUNT(*) AS n,
  SUM(CASE WHEN LOWER(TRIM(COALESCE(g.player_result, ''))) = 'win' THEN 1 ELSE 0 END) AS wins,
  SUM(
    CASE
      WHEN g.player_result IS NULL OR TRIM(g.player_result) = '' THEN 0
      WHEN LOWER(TRIM(g.player_result)) = 'win' THEN 0
      WHEN LOWER(TRIM(g.player_result)) IN (
        'agreed', 'repetition', 'stalemate', 'insufficient', '50move',
        'timevsinsufficient', 'insufficientmaterial', 'draw', 'bughousepartnerlose'
      ) THEN 0
      ELSE 1
    END
  ) AS losses,
  SUM(
    CASE WHEN LOWER(TRIM(g.player_result)) IN (
      'agreed', 'repetition', 'stalemate', 'insufficient', '50move',
      'timevsinsufficient', 'insufficientmaterial', 'draw', 'bughousepartnerlose'
    ) THEN 1 ELSE 0 END
  ) AS draws,
  SUM(CASE WHEN g.player_result IS NULL OR TRIM(g.player_result) = '' THEN 1 ELSE 0 END) AS outcome_unknown,
  AVG(CASE WHEN LOWER(TRIM(g.player_color)) = 'white' THEN g.black_rating ELSE g.white_rating END) AS avg_opp_rating,
  AVG(g.half_moves) / 2 AS avg_half_moves,
  AVG(g.avg_seconds_per_own_move) AS avg_seconds_per_own_move
FROM games g
WHERE g.end_time IS NOT NULL
  AND LOWER(TRIM(g.time_class)) IN ('rapid', 'blitz', 'bullet')
GROUP BY g.profile_id, LOWER(TRIM(g.time_class)), DATE(g.end_time)
`);

    const aggNullNum = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const agg = new Map<
      string,
      {
        n: number;
        wins: number;
        losses: number;
        draws: number;
        ou: number;
        avgOpp: number | null;
        avgHalfMoves: number | null;
        avgSecondsPerOwnMove: number | null;
      }
    >();
    for (const row of aggRows ?? []) {
      const pid = String(row.profile_id);
      const tc = String(row.tc);
      const dk = dateKeyUTC(row.stat_date);
      agg.set(`${pid}|${tc}|${dk}`, {
        n: Number(row.n),
        wins: Number(row.wins),
        losses: Number(row.losses),
        draws: Number(row.draws),
        ou: Number(row.outcome_unknown),
        avgOpp: aggNullNum(row.avg_opp_rating),
        avgHalfMoves: aggNullNum(row.avg_half_moves),
        avgSecondsPerOwnMove: aggNullNum(row.avg_seconds_per_own_move),
      });
    }

    const [lastRows] = await conn.query<RowDataPacket[]>(`
SELECT profile_id, tc, stat_date, player_rating FROM (
  SELECT
    g.profile_id,
    LOWER(TRIM(g.time_class)) AS tc,
    DATE(g.end_time) AS stat_date,
    g.player_rating AS player_rating,
    ROW_NUMBER() OVER (
      PARTITION BY g.profile_id, LOWER(TRIM(g.time_class)), DATE(g.end_time)
      ORDER BY g.end_time DESC, g.chesscom_uuid DESC
    ) AS rn
  FROM games g
  WHERE g.end_time IS NOT NULL
    AND LOWER(TRIM(g.time_class)) IN ('rapid', 'blitz', 'bullet')
) x
WHERE rn = 1
`);

    const lastRating = new Map<string, number>();
    for (const row of lastRows ?? []) {
      const pr = row.player_rating;
      if (pr == null) continue;
      const pid = String(row.profile_id);
      const tc = String(row.tc);
      const dk = dateKeyUTC(row.stat_date);
      lastRating.set(`${pid}|${tc}|${dk}`, Number(pr));
    }

    const [boundRows] = await conn.query<RowDataPacket[]>(`
SELECT profile_id, LOWER(TRIM(time_class)) AS tc, MIN(DATE(end_time)) AS d0
FROM games
WHERE end_time IS NOT NULL
  AND LOWER(TRIM(time_class)) IN ('rapid', 'blitz', 'bullet')
GROUP BY profile_id, LOWER(TRIM(time_class))
`);

    const bounds: { pid: string; tc: string; d0: Date }[] = [];
    for (const row of boundRows ?? []) {
      const d0raw = parseMysqlDate(row.d0);
      const d0 = new Date(Date.UTC(d0raw.getUTCFullYear(), d0raw.getUTCMonth(), d0raw.getUTCDate(), 0, 0, 0, 0));
      bounds.push({
        pid: String(row.profile_id),
        tc: String(row.tc),
        d0,
      });
    }

    const now = new Date();
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

    type InsRow = {
      pid: string;
      statDate: Date;
      tc: string;
      games: number;
      wins: number;
      losses: number;
      draws: number;
      ou: number;
      rating: number | null;
      avgOpp: number | null;
      avgHalfMoves: number | null;
      avgSecondsPerOwnMove: number | null;
    };

    const out: InsRow[] = [];

    for (const b of bounds) {
      let carry: number | null = null;
      for (let d = b.d0; d.getTime() <= endDate.getTime(); d = addDaysUTC(d, 1)) {
        const ds = fmtDay(d) as DayKey;
        const k = `${b.pid}|${b.tc}|${ds}`;
        const a = agg.get(k);
        const lr = lastRating.get(k);

        if (a != null && a.n > 0) {
          let r: number | null = null;
          if (lr != null) {
            r = lr;
            carry = lr;
          } else if (carry != null) {
            r = carry;
          }
          out.push({
            pid: b.pid,
            statDate: new Date(`${ds}T00:00:00.000Z`),
            tc: b.tc,
            games: a.n,
            wins: a.wins,
            losses: a.losses,
            draws: a.draws,
            ou: a.ou,
            rating: r,
            avgOpp: a.avgOpp,
            avgHalfMoves: a.avgHalfMoves,
            avgSecondsPerOwnMove: a.avgSecondsPerOwnMove,
          });
          continue;
        }

        out.push({
          pid: b.pid,
          statDate: new Date(`${ds}T00:00:00.000Z`),
          tc: b.tc,
          games: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          ou: 0,
          rating: carry,
          avgOpp: null,
          avgHalfMoves: null,
          avgSecondsPerOwnMove: null,
        });
      }
    }

    const chunk = 400;
    for (let i = 0; i < out.length; i += chunk) {
      const part = out.slice(i, i + chunk);
      if (part.length === 0) continue;
      const placeholders = part.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(6))").join(",");
      const args: unknown[] = [];
      for (const row of part) {
        args.push(
          row.pid,
          row.statDate,
          row.tc,
          row.games,
          row.wins,
          row.losses,
          row.draws,
          row.ou,
          row.rating,
          row.avgOpp,
          row.avgHalfMoves,
          row.avgSecondsPerOwnMove,
        );
      }
      await conn.query(
        `INSERT INTO daily_game_stats (
  profile_id, stat_date, time_class,
  games, wins, losses, draws, outcome_unknown,
  rating,
  avg_opponent_rating, avg_half_moves, avg_seconds_per_own_move,
  computed_at
) VALUES ${placeholders}`,
        args,
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
