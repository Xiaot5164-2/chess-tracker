import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";

import { getMysqlPool } from "@/lib/db/pool";
import { normProfileId } from "@/lib/leaderboard/get-leaderboard-payload";
import { queryLatestSnapshotTime, queryProfilesOrdered } from "@/lib/leaderboard/load-mysql";

export type PuzzleLeaderboardRowModel = {
  profile_id: string;
  chess_username: string;
  display_name: string | null;
  avatar_url: string | null;
  /** 最新谜题分（daily 行末 rating_day_end） */
  rating: number | null;
  /** 累计做题次数（callback cum_attempts） */
  attempts: number | null;
  /** 通过率 % = passed / attempts */
  passRatePct: number | null;
  /** 平均每题用时（秒）= total_seconds / attempts */
  avgSecondsPerAttempt: number | null;
  /** 相对「当前日 stat_date」往前第 7 个 UTC 日及以前最近一行分的涨跌：rating - rating_at_or_before(end-7d) */
  ratingDelta7: number | null;
  /** 同上，30 日窗口锚点：end - 30d */
  ratingDelta30: number | null;
  /** 当前日往前共 7 个 UTC 日历日（含当前日）内 attempts 列之和 */
  attemptsLast7Days: number | null;
  /** 当前日往前共 30 个 UTC 日历日（含当前日）内 attempts 列之和 */
  attemptsLast30Days: number | null;
};

export type PuzzleLeaderboardPayloadOk = {
  ok: true;
  snapLabel: string | null;
  snapInstantIso: string | null;
  rows: PuzzleLeaderboardRowModel[];
};

export type PuzzleLeaderboardPayloadErr = {
  ok: false;
  error: string;
  code: "pool" | "profiles" | "fatal";
};

export type PuzzleLeaderboardPayload = PuzzleLeaderboardPayloadOk | PuzzleLeaderboardPayloadErr;

function safeNum(x: unknown): number | null {
  if (x == null || x === "") return null;
  if (typeof x === "bigint") {
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : null;
}

/**
 * mysql2 对 DATE 常返回 JS Date；勿用 String(d).slice(0,10)（会得到 "Wed Apr 09"）。
 * 统一为 UTC 日历日 YYYY-MM-DD。
 */
function statDateToYmd(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  const t = new Date(s.length <= 10 ? `${s}T00:00:00.000Z` : s);
  if (Number.isNaN(t.getTime())) return null;
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** UTC 日历日 YYYY-MM-DD 字符串加减天数 */
function addUtcDays(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

type PuzzleDayRow = { statDate: string; rating: number | null; attempts: number | null };

function ratingAtOrBefore(series: PuzzleDayRow[], ymd: string): number | null {
  let best: PuzzleDayRow | null = null;
  for (const r of series) {
    if (r.statDate > ymd || r.rating == null || !Number.isFinite(r.rating)) {
      continue;
    }
    if (!best || r.statDate > best.statDate) {
      best = r;
    }
  }
  return best?.rating ?? null;
}

/**
 * 先按 UTC 锚点日取「最近一行分」；若日表尚不足覆盖该锚点（常见于仅同步近几日），
 * 则用严格早于 endDate 的最早一日分作基线，使近 7/30 日列在短历史上仍有可读涨跌。
 */
export function puzzleRatingBaselineWithSparseFallback(
  series: PuzzleDayRow[],
  endDate: string,
  minusCalendarDays: number,
): number | null {
  const anchor = addUtcDays(endDate, -minusCalendarDays);
  const atAnchor = ratingAtOrBefore(series, anchor);
  if (atAnchor != null) {
    return atAnchor;
  }
  let oldest: PuzzleDayRow | null = null;
  for (const r of series) {
    if (r.statDate >= endDate || r.rating == null || !Number.isFinite(r.rating)) {
      continue;
    }
    if (!oldest || r.statDate < oldest.statDate) {
      oldest = r;
    }
  }
  return oldest?.rating ?? null;
}

/** 含端点 [startYmd, endYmd] 内 attempts 求和（该窗口内任一日有行则返回数字，缺省按 0 累加） */
function sumAttemptsInclusive(series: PuzzleDayRow[], startYmd: string, endYmd: string): number | null {
  if (startYmd > endYmd) return null;
  let sum = 0;
  let hit = false;
  for (const r of series) {
    if (r.statDate >= startYmd && r.statDate <= endYmd) {
      hit = true;
      const a = r.attempts;
      if (a != null && Number.isFinite(a) && a >= 0) {
        sum += Math.round(a);
      }
    }
  }
  return hit ? sum : null;
}

/**
 * 每位棋手最新一日 daily_puzzle_stats（MAX(stat_date)）上的累计指标；用于谜题榜（无周期维度）。
 */
export async function getPuzzleLeaderboardPayload(poolOverride?: Pool): Promise<PuzzleLeaderboardPayload> {
  let pool: Pool;
  try {
    pool = poolOverride ?? getMysqlPool();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, code: "pool" };
  }

  try {
    const snapRaw = await queryLatestSnapshotTime(pool, "puzzle");
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

    const profiles = await queryProfilesOrdered(pool);
    if (profiles.length === 0) {
      return {
        ok: true,
        snapLabel,
        snapInstantIso: snapInstant?.toISOString() ?? null,
        rows: [],
      };
    }

    const [latestRows] = await pool.query<RowDataPacket[]>(
      `SELECT d.profile_id,
              x.mx AS end_stat_date,
              COALESCE(d.rating_day_end, d.rating_day_start) AS rating_day_end,
              d.cum_attempts,
              d.cum_passed,
              d.cum_total_seconds
       FROM daily_puzzle_stats d
       INNER JOIN (
         SELECT profile_id, MAX(stat_date) AS mx
         FROM daily_puzzle_stats
         GROUP BY profile_id
       ) x ON d.profile_id = x.profile_id AND d.stat_date = x.mx`,
    );

    const byProfile = new Map<
      string,
      { rating: number | null; attempts: number | null; passed: number | null; totalSec: number | null }
    >();
    const endDateByProfile = new Map<string, string>();
    for (const r of latestRows ?? []) {
      const pid = normProfileId(r.profile_id);
      if (!pid) continue;
      const att = safeNum(r.cum_attempts);
      const passed = safeNum(r.cum_passed);
      const totalSec = safeNum(r.cum_total_seconds);
      const rating = safeNum(r.rating_day_end);
      byProfile.set(pid, {
        rating: rating != null ? Math.round(rating) : null,
        attempts: att != null ? Math.round(att) : null,
        passed: passed != null ? Math.round(passed) : null,
        totalSec: totalSec != null ? Math.round(totalSec) : null,
      });
      const endYmd = statDateToYmd(r.end_stat_date);
      if (endYmd != null) {
        endDateByProfile.set(pid, endYmd);
      }
    }

    const seriesByProfile = new Map<string, PuzzleDayRow[]>();
    /** 按「每位棋手各自最新 stat_date」回溯，避免全库 MAX 很新时把旧棋手的锚点日裁掉；分用 COALESCE 兼容仅填 start 的旧行。 */
    const [hist] = await pool.query<RowDataPacket[]>(
      `SELECT d.profile_id,
              d.stat_date,
              COALESCE(d.rating_day_end, d.rating_day_start) AS rating_day_end,
              d.attempts
       FROM daily_puzzle_stats d
       INNER JOIN (
         SELECT profile_id, MAX(stat_date) AS mx
         FROM daily_puzzle_stats
         GROUP BY profile_id
       ) x ON d.profile_id = x.profile_id
          AND d.stat_date >= DATE_SUB(x.mx, INTERVAL 400 DAY)
       ORDER BY d.profile_id, d.stat_date ASC`,
    );
    for (const r of hist ?? []) {
      const pid = normProfileId(r.profile_id);
      if (!pid) continue;
      const sd = statDateToYmd(r.stat_date) ?? "";
      if (!sd) continue;
      const rating = safeNum(r.rating_day_end);
      const attemptsDay = safeNum(r.attempts);
      if (!seriesByProfile.has(pid)) {
        seriesByProfile.set(pid, []);
      }
      seriesByProfile.get(pid)!.push({
        statDate: sd,
        rating: rating != null ? Math.round(rating) : null,
        attempts: attemptsDay != null ? Math.round(attemptsDay) : null,
      });
    }

    for (const [pid, series] of seriesByProfile) {
      if (endDateByProfile.has(pid)) {
        continue;
      }
      let maxD = "";
      for (const row of series) {
        if (row.statDate > maxD) {
          maxD = row.statDate;
        }
      }
      if (maxD) {
        endDateByProfile.set(pid, maxD);
      }
    }

    const rows: PuzzleLeaderboardRowModel[] = profiles.map((p) => {
      const pid = normProfileId(p.id);
      const m = byProfile.get(pid);
      const attempts = m?.attempts ?? null;
      const passed = m?.passed ?? null;
      const totalSec = m?.totalSec ?? null;
      let passRatePct: number | null = null;
      if (attempts != null && attempts > 0 && passed != null && Number.isFinite(passed)) {
        passRatePct = (passed / attempts) * 100;
        if (!Number.isFinite(passRatePct)) passRatePct = null;
      }
      let avgSecondsPerAttempt: number | null = null;
      if (attempts != null && attempts > 0 && totalSec != null && Number.isFinite(totalSec)) {
        avgSecondsPerAttempt = totalSec / attempts;
        if (!Number.isFinite(avgSecondsPerAttempt)) avgSecondsPerAttempt = null;
      }

      const series = seriesByProfile.get(pid) ?? [];
      const endDate = endDateByProfile.get(pid) ?? null;

      let ratingDelta7: number | null = null;
      let ratingDelta30: number | null = null;
      let attemptsLast7Days: number | null = null;
      let attemptsLast30Days: number | null = null;

      if (endDate != null && m?.rating != null) {
        const r7 = puzzleRatingBaselineWithSparseFallback(series, endDate, 7);
        const r30 = puzzleRatingBaselineWithSparseFallback(series, endDate, 30);
        if (r7 != null) {
          ratingDelta7 = m.rating - r7;
          if (!Number.isFinite(ratingDelta7)) ratingDelta7 = null;
        }
        if (r30 != null) {
          ratingDelta30 = m.rating - r30;
          if (!Number.isFinite(ratingDelta30)) ratingDelta30 = null;
        }
        const start7 = addUtcDays(endDate, -6);
        const start30 = addUtcDays(endDate, -29);
        attemptsLast7Days = sumAttemptsInclusive(series, start7, endDate);
        attemptsLast30Days = sumAttemptsInclusive(series, start30, endDate);
      }

      return {
        profile_id: pid,
        chess_username: String(p.chess_username),
        display_name: p.display_name != null ? String(p.display_name) : null,
        avatar_url: p.avatar_url != null ? String(p.avatar_url) : null,
        rating: m?.rating ?? null,
        attempts,
        passRatePct,
        avgSecondsPerAttempt,
        ratingDelta7,
        ratingDelta30,
        attemptsLast7Days,
        attemptsLast30Days,
      };
    });

    return {
      ok: true,
      snapLabel,
      snapInstantIso: snapInstant?.toISOString() ?? null,
      rows,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, code: "fatal" };
  }
}
