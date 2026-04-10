export type DayPoint = { d: string; r: number };

/** UTC calendar day YYYY-MM-DD from a chart key (date or ISO datetime). */
export function utcCalendarDayKey(d: string): string {
  return d.slice(0, 10);
}

/** Latest rating minus rating at or before (today UTC − days). Null if insufficient history. */
export function rapidDeltaOverDays(points: DayPoint[], days: number): number | null {
  const finite = points.filter((p) => Number.isFinite(p.r));
  if (finite.length === 0) {
    return null;
  }
  const sorted = [...finite].sort((a, b) => a.d.localeCompare(b.d));
  if (sorted.length < 2) {
    return null;
  }
  const latest = sorted[sorted.length - 1];
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let baseline = sorted[0];
  for (const p of sorted) {
    if (utcCalendarDayKey(p.d) <= cutoffStr) {
      baseline = p;
    } else {
      break;
    }
  }

  const delta = latest.r - baseline.r;
  return Number.isFinite(delta) ? delta : null;
}

/** 与「近 x 日」涨跌、对局汇总共用：UTC 当天 0 点往前推 `days` 个日历日的起始日期 YYYY-MM-DD（含当日窗口左端）。 */
export function utcPeriodStartDate(days: number): string {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff.toISOString().slice(0, 10);
}

export function pointsInWindow(points: DayPoint[], days: number): DayPoint[] {
  const s = utcPeriodStartDate(days);
  return [...points]
    .filter((p) => utcCalendarDayKey(p.d) >= s)
    .sort((a, b) => a.d.localeCompare(b.d));
}

/** 棋类常见「得分率」：(胜 + 和×0.5) / 总盘数；无对局时为 null。 */
export function chessScoreRatePercent(wins: number, draws: number, totalGames: number): number | null {
  if (totalGames <= 0 || !Number.isFinite(wins) || !Number.isFinite(draws) || !Number.isFinite(totalGames)) {
    return null;
  }
  const pct = ((wins + 0.5 * draws) / totalGames) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function parseLeaderboardPeriod(raw: string | string[] | undefined): 7 | 30 | 90 {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "30") {
    return 30;
  }
  if (v === "90") {
    return 90;
  }
  return 7;
}
