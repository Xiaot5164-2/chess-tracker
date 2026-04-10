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
import type { PuzzleLeaderboardRowModel } from "@/lib/leaderboard/get-puzzle-leaderboard-payload";
import { chessComMemberUrl } from "@/lib/chesscom/member-url";

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

type SortKey =
  | "rating"
  | "attempts"
  | "pass"
  | "avgSec"
  | "d7"
  | "d30"
  | "a7"
  | "a30"
  | "name";

function defaultDirForKey(key: SortKey): "asc" | "desc" {
  return key === "name" ? "asc" : "desc";
}

type ColMinMax = { min: number; max: number };

function collectMinMax(values: number[]): ColMinMax | null {
  if (values.length === 0) return null;
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

function columnHeatClass(value: number | null, range: ColMinMax | null): string {
  const base = "text-right tabular-nums font-medium";
  if (value == null || !Number.isFinite(value)) {
    return `${base} text-muted-foreground`;
  }
  if (!range) {
    return `${base} text-cyan-300/90`;
  }
  const { min, max } = range;
  if (max < min || min === max) {
    return `${base} text-cyan-300/95`;
  }
  const u = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (u < 0.2) return `${base} text-sky-400`;
  if (u < 0.4) return `${base} text-cyan-300`;
  if (u < 0.6) return `${base} text-teal-300`;
  if (u < 0.8) return `${base} text-amber-300`;
  return `${base} text-orange-300`;
}

function compareRows(
  a: PuzzleLeaderboardRowModel,
  b: PuzzleLeaderboardRowModel,
  key: SortKey,
  dir: "asc" | "desc",
): number {
  const mul = dir === "asc" ? 1 : -1;
  const tie = () => a.chess_username.localeCompare(b.chess_username, "zh-CN");
  const cmpNum = (x: number | null, y: number | null): number | null => {
    const xn = x != null && Number.isFinite(x) ? x : null;
    const yn = y != null && Number.isFinite(y) ? y : null;
    if (xn == null && yn == null) return null;
    if (xn == null) return 1;
    if (yn == null) return -1;
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
      if (d != null) return d;
      return tie();
    }
    case "attempts": {
      const d = cmpNum(a.attempts, b.attempts);
      if (d != null) return d;
      return tie();
    }
    case "pass": {
      const d = cmpNum(a.passRatePct, b.passRatePct);
      if (d != null) return d;
      return tie();
    }
    case "avgSec": {
      const d = cmpNum(a.avgSecondsPerAttempt, b.avgSecondsPerAttempt);
      if (d != null) return d;
      return tie();
    }
    case "d7": {
      const d = cmpNum(a.ratingDelta7, b.ratingDelta7);
      if (d != null) return d;
      return tie();
    }
    case "d30": {
      const d = cmpNum(a.ratingDelta30, b.ratingDelta30);
      if (d != null) return d;
      return tie();
    }
    case "a7": {
      const d = cmpNum(a.attemptsLast7Days, b.attemptsLast7Days);
      if (d != null) return d;
      return tie();
    }
    case "a30": {
      const d = cmpNum(a.attemptsLast30Days, b.attemptsLast30Days);
      if (d != null) return d;
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

export function PuzzleLeaderboardTable({ rows: inputRows }: { rows: PuzzleLeaderboardRowModel[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...inputRows];
    copy.sort((a, b) => compareRows(a, b, sortKey, sortDir));
    return copy;
  }, [inputRows, sortKey, sortDir]);

  const ranges = useMemo(() => {
    const ratings: number[] = [];
    const attempts: number[] = [];
    const pass: number[] = [];
    const avg: number[] = [];
    const a7: number[] = [];
    const a30: number[] = [];
    for (const r of inputRows) {
      if (r.rating != null && Number.isFinite(r.rating)) ratings.push(r.rating);
      if (r.attempts != null && r.attempts > 0) attempts.push(r.attempts);
      if (r.passRatePct != null && Number.isFinite(r.passRatePct)) pass.push(r.passRatePct);
      if (r.avgSecondsPerAttempt != null && Number.isFinite(r.avgSecondsPerAttempt)) {
        avg.push(r.avgSecondsPerAttempt);
      }
      if (r.attemptsLast7Days != null && Number.isFinite(r.attemptsLast7Days)) {
        a7.push(r.attemptsLast7Days);
      }
      if (r.attemptsLast30Days != null && Number.isFinite(r.attemptsLast30Days)) {
        a30.push(r.attemptsLast30Days);
      }
    }
    return {
      rating: collectMinMax(ratings),
      attempts: collectMinMax(attempts),
      pass: collectMinMax(pass),
      avgSec: collectMinMax(avg),
      a7: collectMinMax(a7),
      a30: collectMinMax(a30),
    };
  }, [inputRows]);

  const onHeaderClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(defaultDirForKey(key));
    }
  };

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

  const initial = (row: PuzzleLeaderboardRowModel) => (row.chess_username?.[0] ?? "?").toUpperCase();

  const deltaClass = (v: number | null) => {
    if (v == null || !Number.isFinite(v)) {
      return "text-right tabular-nums text-muted-foreground";
    }
    if (v > 0) {
      return "text-right tabular-nums font-medium text-emerald-400";
    }
    if (v < 0) {
      return "text-right tabular-nums font-medium text-red-400";
    }
    return "text-right tabular-nums text-muted-foreground";
  };

  return (
    <Table className="min-w-[1280px]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>{headBtn("name", "棋手")}</TableHead>
          <TableHead className="text-right">{headBtn("rating", "当前分", true)}</TableHead>
          <TableHead className="text-right">{headBtn("d7", "近7日涨跌", true)}</TableHead>
          <TableHead className="text-right">{headBtn("d30", "近30日涨跌", true)}</TableHead>
          <TableHead className="text-right">{headBtn("attempts", "累计做题", true)}</TableHead>
          <TableHead className="text-right">{headBtn("a7", "近7日做题量", true)}</TableHead>
          <TableHead className="text-right">{headBtn("a30", "近30日做题量", true)}</TableHead>
          <TableHead className="text-right">{headBtn("pass", "通过率", true)}</TableHead>
          <TableHead className="text-right">{headBtn("avgSec", "平均每题用时(秒)", true)}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 ? (
          <TableRow>
            <TableCell colSpan={10} className="text-center text-muted-foreground">
              暂无学生：请使用「添加学生」录入 Chess.com 用户名。
            </TableCell>
          </TableRow>
        ) : (
          sorted.map((row, i) => {
            const memberUrl = row.chess_username.trim() ? chessComMemberUrl(row.chess_username) : null;
            const avatarShellClass =
              "relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted ring-offset-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
            const avatarBody = row.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
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
              <TableRow key={row.profile_id}>
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
                </TableCell>
                <TableCell
                  className={
                    row.rating != null && Number.isFinite(row.rating)
                      ? columnHeatClass(row.rating, ranges.rating)
                      : "text-right tabular-nums text-muted-foreground"
                  }
                >
                  {row.rating ?? "—"}
                </TableCell>
                <TableCell className={deltaClass(row.ratingDelta7)}>
                  {row.ratingDelta7 == null || !Number.isFinite(row.ratingDelta7)
                    ? "—"
                    : row.ratingDelta7 > 0
                      ? `+${row.ratingDelta7}`
                      : String(row.ratingDelta7)}
                </TableCell>
                <TableCell className={deltaClass(row.ratingDelta30)}>
                  {row.ratingDelta30 == null || !Number.isFinite(row.ratingDelta30)
                    ? "—"
                    : row.ratingDelta30 > 0
                      ? `+${row.ratingDelta30}`
                      : String(row.ratingDelta30)}
                </TableCell>
                <TableCell
                  className={
                    row.attempts != null && row.attempts > 0
                      ? columnHeatClass(row.attempts, ranges.attempts)
                      : "text-right tabular-nums text-muted-foreground"
                  }
                >
                  {row.attempts != null && row.attempts > 0 ? row.attempts.toLocaleString("zh-CN") : "—"}
                </TableCell>
                <TableCell
                  className={
                    row.attemptsLast7Days != null && Number.isFinite(row.attemptsLast7Days)
                      ? columnHeatClass(row.attemptsLast7Days, ranges.a7)
                      : "text-right tabular-nums text-muted-foreground"
                  }
                >
                  {row.attemptsLast7Days != null && Number.isFinite(row.attemptsLast7Days)
                    ? row.attemptsLast7Days.toLocaleString("zh-CN")
                    : "—"}
                </TableCell>
                <TableCell
                  className={
                    row.attemptsLast30Days != null && Number.isFinite(row.attemptsLast30Days)
                      ? columnHeatClass(row.attemptsLast30Days, ranges.a30)
                      : "text-right tabular-nums text-muted-foreground"
                  }
                >
                  {row.attemptsLast30Days != null && Number.isFinite(row.attemptsLast30Days)
                    ? row.attemptsLast30Days.toLocaleString("zh-CN")
                    : "—"}
                </TableCell>
                <TableCell
                  className={
                    row.passRatePct != null && Number.isFinite(row.passRatePct)
                      ? columnHeatClass(row.passRatePct, ranges.pass)
                      : "text-right tabular-nums text-muted-foreground"
                  }
                >
                  {row.passRatePct != null && Number.isFinite(row.passRatePct)
                    ? `${row.passRatePct.toFixed(1)}%`
                    : "—"}
                </TableCell>
                <TableCell
                  className={
                    row.avgSecondsPerAttempt != null && Number.isFinite(row.avgSecondsPerAttempt)
                      ? columnHeatClass(row.avgSecondsPerAttempt, ranges.avgSec)
                      : "text-right tabular-nums text-muted-foreground"
                  }
                >
                  {row.avgSecondsPerAttempt != null && Number.isFinite(row.avgSecondsPerAttempt)
                    ? row.avgSecondsPerAttempt.toFixed(1)
                    : "—"}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
