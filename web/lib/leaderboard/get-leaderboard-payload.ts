import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";

import type { LeaderboardRowModel } from "@/components/leaderboard-table";
import {
  chessScoreRatePercent,
  rapidDeltaOverDays,
  utcPeriodStartDate,
  type DayPoint,
} from "@/lib/leaderboard/rapid-period";
import { getMysqlPool } from "@/lib/db/pool";
import {
  queryDailyGameStatsAggregatedSince,
  queryGamePeriodDashboardMetrics,
  queryLatestRatingsByProfile,
  queryLatestSnapshotTime,
  queryLeaderboardView,
  queryProfilesOrdered,
  querySeriesSince,
} from "@/lib/leaderboard/load-mysql";
import {
  leaderboardTimeControlConfig,
  type LeaderboardTimeControl,
} from "@/lib/leaderboard/time-control";

type LeaderRow = {
  profile_id: string;
  chess_username: string;
  display_name: string | null;
  avatar_url: string | null;
  rating: number | null;
  rating_recorded_at: string | null;
};

export type LeaderboardPayloadOk = {
  ok: true;
  timeControl: LeaderboardTimeControl;
  periodDays: 7 | 30 | 90;
  tcLabel: string;
  scoreColumnLabel: string;
  showGamePeriodCols: boolean;
  snapLabel: string | null;
  snapInstantIso: string | null;
  rows: LeaderboardRowModel[];
};

export type LeaderboardPayloadErr = {
  ok: false;
  error: string;
  code: "pool" | "profiles" | "fatal";
};

export type LeaderboardPayload = LeaderboardPayloadOk | LeaderboardPayloadErr;

/** mysql2 可能把 CHAR(36) 以 Buffer 返回，统一成与 profiles.id 一致的字符串。 */
export function normProfileId(v: unknown): string {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) {
    return v.toString("utf8");
  }
  return String(v ?? "");
}

function pickLeaderboardFromViewRow(
  row: Record<string, unknown>,
  tc: LeaderboardTimeControl,
): { profile_id: string; rating: number | null; rating_recorded_at: string | null } {
  const c = leaderboardTimeControlConfig(tc);
  const rating = row[c.ratingField];
  const recorded = row[c.recordedField];
  const n = typeof rating === "number" ? rating : rating != null ? Number(rating) : NaN;
  return {
    profile_id: normProfileId(row.profile_id),
    rating: Number.isFinite(n) ? n : null,
    rating_recorded_at: recorded != null ? String(recorded) : null,
  };
}

/** RSC / JSON 序列化：避免 BigInt。 */
function safeClientNumber(x: unknown): number | null {
  if (x == null || x === "") return null;
  if (typeof x === "bigint") {
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : null;
}

function estimatedTotalOwnSeconds(
  totalGames: number | null,
  avgHalfMoves: number | null,
  avgSecondsPerOwnMove: number | null,
): number | null {
  if (totalGames == null || totalGames <= 0) {
    return null;
  }
  if (avgHalfMoves == null || avgSecondsPerOwnMove == null) {
    return null;
  }
  if (!Number.isFinite(avgHalfMoves) || !Number.isFinite(avgSecondsPerOwnMove)) {
    return null;
  }
  const v = totalGames * avgHalfMoves * avgSecondsPerOwnMove;
  return Number.isFinite(v) ? v : null;
}

function plainLeaderboardRowForClient(row: LeaderboardRowModel): LeaderboardRowModel {
  const totalGames = safeClientNumber(row.totalGames);
  return {
    profile_id: normProfileId(row.profile_id),
    chess_username: String(row.chess_username),
    display_name: row.display_name != null ? String(row.display_name) : null,
    avatar_url: row.avatar_url != null ? String(row.avatar_url) : null,
    rating: safeClientNumber(row.rating),
    periodDelta: safeClientNumber(row.periodDelta),
    totalGames: totalGames != null && totalGames > 0 ? totalGames : null,
    ratePct: safeClientNumber(row.ratePct),
    avgOpponentRating: safeClientNumber(row.avgOpponentRating),
    avgHalfMoves: safeClientNumber(row.avgHalfMoves),
    avgSecondsPerOwnMove: safeClientNumber(row.avgSecondsPerOwnMove),
    estimatedTotalOwnSeconds: safeClientNumber(row.estimatedTotalOwnSeconds),
  };
}

function chartKeyFromRecordedAt(recordedAt: unknown): string {
  const s = String(recordedAt).trim();
  if (!s) {
    return s;
  }
  const d = new Date(s.length <= 10 ? `${s}T00:00:00.000Z` : s);
  if (Number.isNaN(d.getTime())) {
    return s.slice(0, 10);
  }
  d.setUTCMilliseconds(0);
  d.setUTCSeconds(0);
  d.setUTCMinutes(0);
  return d.toISOString();
}

/**
 * 供 Route Handler 与（可选）服务端直读复用：查 MySQL 并返回可 JSON 序列化的排行榜载荷。
 */
export async function getLeaderboardPayload(
  periodDays: 7 | 30 | 90,
  timeControl: LeaderboardTimeControl,
  poolOverride?: Pool,
): Promise<LeaderboardPayload> {
  const tc = leaderboardTimeControlConfig(timeControl);
  let pool: Pool;
  try {
    pool = poolOverride ?? getMysqlPool();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, code: "pool" };
  }

  let profiles: { id: string; chess_username: string; display_name: string | null; avatar_url: string | null }[];
  try {
    const rows = await queryProfilesOrdered(pool);
    profiles = rows.map((r) => ({
      id: normProfileId(r.id),
      chess_username: String(r.chess_username),
      display_name: r.display_name != null ? String(r.display_name) : null,
      avatar_url: r.avatar_url != null ? String(r.avatar_url) : null,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, code: "profiles" };
  }

  try {
  const { rows: viewRows, error: viewError } = await queryLeaderboardView(pool, timeControl);

  if (viewError && process.env.NODE_ENV === "development") {
    console.warn(`[leaderboard] ${tc.view}:`, viewError.message);
  }

  const lbMap = new Map<string, ReturnType<typeof pickLeaderboardFromViewRow>>();
  if (!viewError && viewRows?.length) {
    for (const r of viewRows as Record<string, unknown>[]) {
      const picked = pickLeaderboardFromViewRow(r, timeControl);
      if (picked.profile_id) {
        lbMap.set(picked.profile_id, picked);
      }
    }
  }

  if (viewError && profiles.length > 0) {
    const statsRows = await queryLatestRatingsByProfile(pool, timeControl).catch(() => []);
    if (statsRows.length) {
      const seen = new Set<string>();
      for (const row of statsRows) {
        const pid = normProfileId(row.profile_id);
        if (!pid || seen.has(pid)) {
          continue;
        }
        seen.add(pid);
        lbMap.set(pid, {
          profile_id: pid,
          rating: Number(row.rating),
          rating_recorded_at: row.recorded_at != null ? String(row.recorded_at) : null,
        });
      }
    }
  }

  const list: LeaderRow[] = profiles.map((p) => {
    const v = lbMap.get(p.id);
    return {
      profile_id: p.id,
      chess_username: p.chess_username,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      rating: v?.rating ?? null,
      rating_recorded_at: v?.rating_recorded_at ?? null,
    };
  });

  const lookbackDays = Math.max(periodDays + 30, 100);
  const rangeStart = new Date();
  rangeStart.setUTCHours(0, 0, 0, 0);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - lookbackDays);
  const rangeStartStr = rangeStart.toISOString();

  const snapRaw = await queryLatestSnapshotTime(pool, timeControl);

  let seriesRows: RowDataPacket[] = [];
  try {
    seriesRows = await querySeriesSince(pool, timeControl, rangeStartStr);
  } catch {
    seriesRows = [];
  }

  const periodStartDate = utcPeriodStartDate(periodDays);
  let gameAggRows: RowDataPacket[] = [];
  if (timeControl !== "puzzle") {
    try {
      gameAggRows = await queryDailyGameStatsAggregatedSince(pool, timeControl, periodStartDate);
    } catch {
      gameAggRows = [];
    }
  }
  const gameAggByProfile = new Map<
    string,
    { totalGames: number; wins: number; losses: number; draws: number }
  >();
  for (const row of gameAggRows ?? []) {
    const pid = normProfileId(row.profile_id);
    if (!pid) continue;
    gameAggByProfile.set(pid, {
      totalGames: Number(row.total_games ?? 0),
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      draws: Number(row.draws ?? 0),
    });
  }

  let dashRows: RowDataPacket[] = [];
  if (timeControl !== "puzzle") {
    try {
      dashRows = await queryGamePeriodDashboardMetrics(pool, timeControl, periodStartDate);
    } catch {
      dashRows = [];
    }
  }
  const dashByProfile = new Map<
    string,
    { avgOpp: number | null; avgMoves: number | null; avgTime: number | null }
  >();
  for (const row of dashRows ?? []) {
    const pid = normProfileId(row.profile_id);
    if (!pid) continue;
    dashByProfile.set(pid, {
      avgOpp: safeClientNumber(row.avg_opp_rating),
      avgMoves: safeClientNumber(row.avg_half_moves),
      avgTime: safeClientNumber(row.avg_seconds_per_own_move),
    });
  }

  const fullSeriesByProfile = new Map<string, DayPoint[]>();
  for (const row of seriesRows ?? []) {
    const pid = normProfileId(row.profile_id);
    if (!pid) continue;
    const r = Number(row.rating);
    if (!Number.isFinite(r)) continue;
    if (!fullSeriesByProfile.has(pid)) {
      fullSeriesByProfile.set(pid, []);
    }
    fullSeriesByProfile.get(pid)!.push({
      d: chartKeyFromRecordedAt(row.recorded_at),
      r,
    });
  }

  const showGamePeriodCols = timeControl !== "puzzle";

  const snapInstant =
    snapRaw != null
      ? (() => {
          const raw = String(snapRaw);
          const t = new Date(raw.length <= 10 ? `${raw}T00:00:00.000Z` : raw);
          return Number.isNaN(t.getTime()) ? null : t;
        })()
      : null;

  const snapLabel =
    snapInstant != null
      ? snapInstant.toLocaleString("zh-CN", {
          timeZone: "Asia/Singapore",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : null;

  const tableRows: LeaderboardRowModel[] = list.map((row) => {
    const full = fullSeriesByProfile.get(row.profile_id) ?? [];
    const periodDelta = rapidDeltaOverDays(full, periodDays);
    const agg = gameAggByProfile.get(row.profile_id);
    const dash = dashByProfile.get(row.profile_id);
    const ratePct =
      agg != null ? chessScoreRatePercent(agg.wins, agg.draws, agg.totalGames) : null;
    const periodDeltaSafe =
      periodDelta != null && Number.isFinite(periodDelta) ? periodDelta : null;
    const totalGames = agg != null && agg.totalGames > 0 ? agg.totalGames : null;
    const avgHalfMoves = dash?.avgMoves ?? null;
    const avgSecondsPerOwnMove = dash?.avgTime ?? null;
    return {
      profile_id: row.profile_id,
      chess_username: row.chess_username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      rating: row.rating,
      periodDelta: periodDeltaSafe,
      totalGames,
      ratePct: ratePct != null && Number.isFinite(ratePct) ? ratePct : null,
      avgOpponentRating: dash?.avgOpp ?? null,
      avgHalfMoves,
      avgSecondsPerOwnMove,
      estimatedTotalOwnSeconds: estimatedTotalOwnSeconds(
        totalGames,
        avgHalfMoves,
        avgSecondsPerOwnMove,
      ),
    };
  });

  return {
    ok: true,
    timeControl,
    periodDays,
    tcLabel: tc.label,
    scoreColumnLabel: tc.scoreColumnLabel,
    showGamePeriodCols,
    snapLabel,
    snapInstantIso: snapInstant?.toISOString() ?? null,
    rows: tableRows.map(plainLeaderboardRowForClient),
  };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, code: "fatal" };
  }
}
