"use client";

import { Suspense, useCallback, useEffect, useState } from "react";

import { LeaderboardRefreshButton } from "@/components/leaderboard-refresh-button";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { LeaderboardPeriodSelect } from "@/components/leaderboard-period-select";
import { LeaderboardTimeControlSelect } from "@/components/leaderboard-time-control-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LeaderboardPayloadOk } from "@/lib/leaderboard/get-leaderboard-payload";
import type { LeaderboardTimeControl } from "@/lib/leaderboard/time-control";

function timeControlQuery(tc: LeaderboardTimeControl): string {
  if (tc === "rapid") return "rapid";
  if (tc === "blitz") return "blitz";
  if (tc === "bullet") return "bullet";
  return "puzzle";
}

export function LeaderboardClient({
  periodDays,
  timeControl,
}: {
  periodDays: 7 | 30 | 90;
  timeControl: LeaderboardTimeControl;
}) {
  const [data, setData] = useState<LeaderboardPayloadOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const u = new URL("/api/leaderboard", window.location.origin);
      u.searchParams.set("period", String(periodDays));
      u.searchParams.set("timeControl", timeControlQuery(timeControl));
      const res = await fetch(u.toString(), { cache: "no-store" });
      const json = (await res.json()) as
        | LeaderboardPayloadOk
        | { ok: false; error: string; code?: string };
      if (!res.ok || !("ok" in json) || !json.ok) {
        const msg =
          !json || typeof json !== "object" || !("error" in json)
            ? `HTTP ${res.status}`
            : String((json as { error?: string }).error ?? "加载失败");
        setError(msg);
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [periodDays, timeControl]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <main className="mx-auto min-h-[calc(100dvh-4rem)] max-w-5xl space-y-6 px-4 py-8 md:px-6 md:py-10">
        <div className="h-10 w-64 animate-pulse rounded-md bg-muted/50" />
        <Card className="border-border/70 bg-card/90 shadow-xl shadow-black/40">
          <CardHeader>
            <CardTitle className="text-lg">加载中…</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 animate-pulse rounded-md bg-muted/40" />
          </CardContent>
        </Card>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Card className="border-destructive/40 bg-card/90 shadow-xl shadow-black/40">
          <CardHeader>
            <CardTitle>排行榜加载失败</CardTitle>
            <p className="text-sm text-muted-foreground break-all">{error ?? "未知错误"}</p>
          </CardHeader>
          <CardContent>
            <LeaderboardRefreshButton onRefetch={() => void load()} />
          </CardContent>
        </Card>
      </main>
    );
  }

  const snapInstant =
    data.snapInstantIso != null ? new Date(data.snapInstantIso) : null;
  const snapLabel = data.snapLabel;

  return (
    <main className="mx-auto min-h-[calc(100dvh-4rem)] max-w-5xl space-y-6 px-4 py-8 md:px-6 md:py-10">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {data.tcLabel} 对局排行榜
        </h1>
        {snapLabel != null && snapInstant != null && !Number.isNaN(snapInstant.getTime()) ? (
          <p className="mt-2 text-sm font-medium text-primary">
            {data.tcLabel} 快照最近更新：
            <time dateTime={snapInstant.toISOString()}>{snapLabel}</time>
            <span className="ml-1 font-normal text-muted-foreground">（新加坡时间，整点小时）</span>
          </p>
        ) : null}
      </div>

      <Card className="border-border/70 bg-card/90 shadow-xl shadow-black/40">
        <CardHeader className="flex flex-col gap-4 space-y-0 pb-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-lg">学生对局排行 · {data.tcLabel}</CardTitle>
            <LeaderboardRefreshButton onRefetch={() => void load()} />
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <Suspense fallback={<div className="h-9 min-w-[200px] rounded-md bg-muted/40" aria-hidden />}>
              <LeaderboardTimeControlSelect />
            </Suspense>
            <Suspense fallback={<div className="h-9 min-w-[200px] rounded-md bg-muted/40" aria-hidden />}>
              <LeaderboardPeriodSelect />
            </Suspense>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <LeaderboardTable
            key={`${data.periodDays}-${data.timeControl}`}
            rows={data.rows}
            periodDays={data.periodDays}
            showGamePeriodCols={data.showGamePeriodCols}
            scoreColumnLabel={data.scoreColumnLabel}
          />
        </CardContent>
      </Card>
    </main>
  );
}
