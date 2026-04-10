"use client";

import { useMemo, useState } from "react";

import { LeaderboardStudentName } from "@/components/leaderboard-student-name";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { chessComMemberUrl } from "@/lib/chesscom/member-url";

export type LeaderboardRowModel = {
  profile_id: string;
  chess_username: string;
  display_name: string | null;
  avatar_url: string | null;
  rating: number | null;
  periodDelta: number | null;
  totalGames: number | null;
  ratePct: number | null;
  /** 近 N 天对局：对手平均等级分 */
  avgOpponentRating: number | null;
  /** 近 N 天对局：平均完整回合数（半回合/2 聚合） */
  avgHalfMoves: number | null;
  /** 近 N 天对局：本方平均每步用时（秒） */
  avgSecondsPerOwnMove: number | null;
  /** 估算累计本方用时（秒）≈ 步均用时 × 平均回合数 × 盘数 */
  estimatedTotalOwnSeconds: number | null;
};

type SortKey =
  | "rating"
  | "delta"
  | "games"
  | "rate"
  | "name"
  | "avgOpp"
  | "avgMoves"
  | "avgSec"
  | "estTotal";

function defaultDirForKey(key: SortKey): "asc" | "desc" {
  return key === "name" ? "asc" : "desc";
}

function compareRows(a: LeaderboardRowModel, b: LeaderboardRowModel, key: SortKey, dir: "asc" | "desc"): number {
  const mul = dir === "asc" ? 1 : -1;
  const tie = () => a.chess_username.localeCompare(b.chess_username, "zh-CN");

  const cmpNum = (x: number | null, y: number | null): number | null => {
    const xn = x != null && Number.isFinite(x) ? x : null;
    const yn = y != null && Number.isFinite(y) ? y : null;
    if (xn == null && yn == null) {
      return null;
    }
    if (xn == null) {
      return 1;
    }
    if (yn == null) {
      return -1;
    }
    const d = (xn - yn) * mul;
    return d !== 0 ? d : null;
  };

  switch (key) {
    case "name": {
      const c = a.display_name ?? a.chess_username;
      const d = b.display_name ?? b.chess_username;
      return c.localeCompare(d, "zh-CN") * mul || tie();
    }
    case "rating": {
      const d = cmpNum(a.rating, b.rating);
      if (d != null) {
        return d;
      }
      return tie();
    }
    case "delta": {
      const d = cmpNum(a.periodDelta, b.periodDelta);
      if (d != null) {
        return d;
      }
      return tie();
    }
    case "games": {
      const ag = a.totalGames != null && a.totalGames > 0 ? a.totalGames : null;
      const bg = b.totalGames != null && b.totalGames > 0 ? b.totalGames : null;
      const d = cmpNum(ag, bg);
      if (d != null) {
        return d;
      }
      return tie();
    }
    case "rate": {
      const d = cmpNum(a.ratePct, b.ratePct);
      if (d != null) {
        return d;
      }
      return tie();
    }
    case "avgOpp": {
      const d = cmpNum(a.avgOpponentRating, b.avgOpponentRating);
      if (d != null) {
        return d;
      }
      return tie();
    }
    case "avgMoves": {
      const d = cmpNum(a.avgHalfMoves, b.avgHalfMoves);
      if (d != null) {
        return d;
      }
      return tie();
    }
    case "avgSec": {
      const d = cmpNum(a.avgSecondsPerOwnMove, b.avgSecondsPerOwnMove);
      if (d != null) {
        return d;
      }
      return tie();
    }
    case "estTotal": {
      const d = cmpNum(a.estimatedTotalOwnSeconds, b.estimatedTotalOwnSeconds);
      if (d != null) {
        return d;
      }
      return tie();
    }
    default:
      return tie();
  }
}

function SortGlyph({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) {
    return <span className="ml-0.5 text-muted-foreground/50">↕</span>;
  }
  return <span className="ml-0.5 text-foreground">{dir === "asc" ? "↑" : "↓"}</span>;
}

function ChessComOutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 3h6v6M10 14L21 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ColMinMax = { min: number; max: number };

function collectMinMax(values: number[]): ColMinMax | null {
  if (values.length === 0) {
    return null;
  }
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v < min) {
      min = v;
    }
    if (v > max) {
      max = v;
    }
  }
  return { min, max };
}

/**
 * 数值列统一热力：当前榜内该列最小→偏冷色（sky），最大→偏暖色（orange）；无数据或全相等时退化为单色。
 */
function columnHeatClass(value: number | null, range: ColMinMax | null): string {
  const base = "text-right tabular-nums font-medium";
  if (value == null || !Number.isFinite(value)) {
    return `${base} text-muted-foreground`;
  }
  if (!range) {
    return `${base} text-cyan-300/90`;
  }
  const { min, max } = range;
  if (max < min) {
    return `${base} text-cyan-300/90`;
  }
  if (min === max) {
    return `${base} text-cyan-300/95`;
  }
  const t = (value - min) / (max - min);
  const u = Math.max(0, Math.min(1, t));
  if (u < 0.2) {
    return `${base} text-sky-400`;
  }
  if (u < 0.4) {
    return `${base} text-cyan-300`;
  }
  if (u < 0.6) {
    return `${base} text-teal-300`;
  }
  if (u < 0.8) {
    return `${base} text-amber-300`;
  }
  return `${base} text-orange-300`;
}

export function LeaderboardTable({
  rows: inputRows,
  periodDays,
  showGamePeriodCols,
  scoreColumnLabel,
}: {
  rows: LeaderboardRowModel[];
  periodDays: 7 | 30 | 90;
  showGamePeriodCols: boolean;
  scoreColumnLabel: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...inputRows];
    copy.sort((a, b) => compareRows(a, b, sortKey, sortDir));
    return copy;
  }, [inputRows, sortKey, sortDir]);

  const leaderboardColRanges = useMemo(() => {
    const rating: number[] = [];
    const delta: number[] = [];
    const games: number[] = [];
    const rate: number[] = [];
    const avgOpp: number[] = [];
    const moves: number[] = [];
    const sec: number[] = [];
    const est: number[] = [];
    for (const r of inputRows) {
      if (r.rating != null && Number.isFinite(r.rating)) {
        rating.push(r.rating);
      }
      if (r.periodDelta != null && Number.isFinite(r.periodDelta)) {
        delta.push(r.periodDelta);
      }
      if (showGamePeriodCols) {
        if (r.totalGames != null && r.totalGames > 0) {
          games.push(r.totalGames);
        }
        if (r.ratePct != null && Number.isFinite(r.ratePct)) {
          rate.push(r.ratePct);
        }
        if (r.avgOpponentRating != null && Number.isFinite(r.avgOpponentRating)) {
          avgOpp.push(r.avgOpponentRating);
        }
        if (r.avgHalfMoves != null && Number.isFinite(r.avgHalfMoves)) {
          moves.push(r.avgHalfMoves);
        }
        if (r.avgSecondsPerOwnMove != null && Number.isFinite(r.avgSecondsPerOwnMove)) {
          sec.push(r.avgSecondsPerOwnMove);
        }
        if (r.estimatedTotalOwnSeconds != null && Number.isFinite(r.estimatedTotalOwnSeconds)) {
          est.push(r.estimatedTotalOwnSeconds);
        }
      }
    }
    return {
      rating: collectMinMax(rating),
      delta: collectMinMax(delta),
      games: collectMinMax(games),
      rate: collectMinMax(rate),
      avgOpp: collectMinMax(avgOpp),
      moves: collectMinMax(moves),
      sec: collectMinMax(sec),
      est: collectMinMax(est),
    };
  }, [inputRows, showGamePeriodCols]);

  const onHeaderClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(defaultDirForKey(key));
    }
  };

  const initial = (row: LeaderboardRowModel) => (row.chess_username?.[0] ?? "?").toUpperCase();
  const tableColSpan = showGamePeriodCols ? 10 : 4;

  const headBtn = (key: SortKey, label: string, alignEnd?: boolean) => (
    <div className={alignEnd ? "flex justify-end" : undefined}>
      <Button
        type="button"
        variant="ghost"
        className={`h-8 gap-0.5 px-2 font-semibold hover:bg-muted/60 ${alignEnd ? "-me-2" : "-ms-2"}`}
        onClick={() => onHeaderClick(key)}
        aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <SortGlyph active={sortKey === key} dir={sortDir} />
      </Button>
    </div>
  );

  return (
    <Table className={showGamePeriodCols ? "min-w-[1280px]" : "min-w-[640px]"}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>{headBtn("name", "棋手")}</TableHead>
          <TableHead className="text-right">{headBtn("rating", scoreColumnLabel, true)}</TableHead>
          <TableHead className="text-right">{headBtn("delta", `近 ${periodDays} 日涨跌`, true)}</TableHead>
          {showGamePeriodCols ? (
            <>
              <TableHead className="text-right">{headBtn("games", `近 ${periodDays} 天盘数`, true)}</TableHead>
              <TableHead className="text-right">{headBtn("rate", "得分率", true)}</TableHead>
              <TableHead className="text-right">{headBtn("avgOpp", "平均对手分", true)}</TableHead>
              <TableHead className="text-right">{headBtn("avgMoves", "平均回合数", true)}</TableHead>
              <TableHead className="text-right">{headBtn("avgSec", "步均用时(秒)", true)}</TableHead>
              <TableHead className="text-right">{headBtn("estTotal", "累计用时(估·秒)", true)}</TableHead>
            </>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 ? (
          <TableRow>
            <TableCell colSpan={tableColSpan} className="text-center text-muted-foreground">
              暂无学生：请使用「添加学生」录入 Chess.com 用户名。
            </TableCell>
          </TableRow>
        ) : (
          sorted.map((row, i) => {
            const periodDeltaSafe =
              row.periodDelta != null && Number.isFinite(row.periodDelta) ? row.periodDelta : null;
            const memberUrl = row.chess_username.trim() ? chessComMemberUrl(row.chess_username) : null;
            const avatarShellClass =
              "relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted ring-offset-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
            const avatarBody = row.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- 外链头像避免 next/image 配置/优化导致运行时错误
              <img
                src={row.avatar_url}
                alt=""
                className="h-9 w-9 object-cover"
                width={36}
                height={36}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                {initial(row)}
              </div>
            );
            return (
              <TableRow key={`${row.profile_id}-${periodDays}`}>
                <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="align-top">
                  <div className="flex items-start gap-3">
                    {memberUrl ? (
                      <a
                        href={memberUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={avatarShellClass}
                        aria-label={`在 Chess.com 打开 ${row.chess_username} 的主页`}
                      >
                        {avatarBody}
                      </a>
                    ) : (
                      <div className={`${avatarShellClass} cursor-default`} aria-hidden>
                        {avatarBody}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <LeaderboardStudentName
                        profileId={row.profile_id}
                        chessUsername={row.chess_username}
                        displayName={row.display_name}
                        chessComLink={
                          memberUrl ? (
                            <a
                              href={memberUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex shrink-0 text-muted-foreground transition hover:text-foreground"
                              title={`Chess.com：${row.chess_username}`}
                              aria-label={`Chess.com 主页：${row.chess_username}`}
                            >
                              <ChessComOutIcon className="h-3.5 w-3.5" />
                            </a>
                          ) : null
                        }
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell
                  className={
                    row.rating != null && Number.isFinite(row.rating)
                      ? columnHeatClass(row.rating, leaderboardColRanges.rating)
                      : "text-right tabular-nums text-muted-foreground"
                  }
                >
                  {row.rating != null ? row.rating : "—"}
                </TableCell>
                <TableCell
                  className={
                    periodDeltaSafe != null
                      ? columnHeatClass(periodDeltaSafe, leaderboardColRanges.delta)
                      : "text-right tabular-nums text-muted-foreground"
                  }
                >
                  {periodDeltaSafe == null
                    ? "—"
                    : periodDeltaSafe > 0
                      ? `+${periodDeltaSafe}`
                      : periodDeltaSafe}
                </TableCell>
                {showGamePeriodCols ? (
                  <>
                    <TableCell
                      className={
                        row.totalGames != null && row.totalGames > 0
                          ? columnHeatClass(row.totalGames, leaderboardColRanges.games)
                          : "text-right tabular-nums text-muted-foreground"
                      }
                    >
                      {row.totalGames != null && row.totalGames > 0 ? row.totalGames : "—"}
                    </TableCell>
                    <TableCell
                      className={
                        row.ratePct != null && Number.isFinite(row.ratePct)
                          ? columnHeatClass(row.ratePct, leaderboardColRanges.rate)
                          : "text-right tabular-nums text-muted-foreground"
                      }
                    >
                      {row.ratePct == null || !Number.isFinite(row.ratePct) ? "—" : `${row.ratePct.toFixed(1)}%`}
                    </TableCell>
                    <TableCell
                      className={
                        row.avgOpponentRating != null && Number.isFinite(row.avgOpponentRating)
                          ? columnHeatClass(row.avgOpponentRating, leaderboardColRanges.avgOpp)
                          : "text-right tabular-nums text-muted-foreground"
                      }
                    >
                      {row.avgOpponentRating != null && Number.isFinite(row.avgOpponentRating)
                        ? Math.round(row.avgOpponentRating)
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={
                        row.avgHalfMoves != null && Number.isFinite(row.avgHalfMoves)
                          ? columnHeatClass(row.avgHalfMoves, leaderboardColRanges.moves)
                          : "text-right tabular-nums text-muted-foreground"
                      }
                    >
                      {row.avgHalfMoves != null && Number.isFinite(row.avgHalfMoves)
                        ? row.avgHalfMoves.toFixed(1)
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={
                        row.avgSecondsPerOwnMove != null && Number.isFinite(row.avgSecondsPerOwnMove)
                          ? columnHeatClass(row.avgSecondsPerOwnMove, leaderboardColRanges.sec)
                          : "text-right tabular-nums text-muted-foreground"
                      }
                    >
                      {row.avgSecondsPerOwnMove != null && Number.isFinite(row.avgSecondsPerOwnMove)
                        ? row.avgSecondsPerOwnMove.toFixed(1)
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={
                        row.estimatedTotalOwnSeconds != null && Number.isFinite(row.estimatedTotalOwnSeconds)
                          ? columnHeatClass(row.estimatedTotalOwnSeconds, leaderboardColRanges.est)
                          : "text-right tabular-nums text-muted-foreground"
                      }
                    >
                      {row.estimatedTotalOwnSeconds != null && Number.isFinite(row.estimatedTotalOwnSeconds)
                        ? Math.round(row.estimatedTotalOwnSeconds).toLocaleString("zh-CN")
                        : "—"}
                    </TableCell>
                  </>
                ) : null}
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
