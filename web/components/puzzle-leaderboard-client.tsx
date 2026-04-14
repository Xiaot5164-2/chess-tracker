"use client";

import { useCallback, useEffect, useState } from "react";

import { LeaderboardRefreshButton } from "@/components/leaderboard-refresh-button";
import { PuzzleLeaderboardTable } from "@/components/puzzle-leaderboard-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PuzzleLeaderboardPayloadOk } from "@/lib/leaderboard/get-puzzle-leaderboard-payload";
import Link from "next/link";

export function PuzzleLeaderboardClient() {
  const [data, setData] = useState<PuzzleLeaderboardPayloadOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leaderboard/puzzles", { cache: "no-store" });
      const json = (await res.json()) as
        | PuzzleLeaderboardPayloadOk
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
  }, []);

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
            <CardTitle>谜题榜加载失败</CardTitle>
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/leaderboard" className="font-medium text-primary hover:underline">
              ← 对局排行榜
            </Link>
          </p>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">谜题榜</h1>
          {snapLabel != null && snapInstant != null && !Number.isNaN(snapInstant.getTime()) ? (
            <p className="mt-2 text-sm font-medium text-primary">
              数据最近更新：
              <time dateTime={snapInstant.toISOString()}>{snapLabel}</time>
              <span className="ml-1 font-normal text-muted-foreground">（新加坡时间）</span>
            </p>
          ) : null}
        </div>
      </div>

      <Card className="border-border/70 bg-card/90 shadow-xl shadow-black/40">
        <CardHeader className="flex flex-col gap-4 space-y-0 pb-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-lg">学生谜题统计</CardTitle>
            <LeaderboardRefreshButton onRefetch={() => void load()} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <PuzzleLeaderboardTable rows={data.rows} />
        </CardContent>
      </Card>
    </main>
  );
}
