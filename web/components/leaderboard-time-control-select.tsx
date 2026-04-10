"use client";

import Link from "next/link";
import { startTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { LeaderboardTimeControl } from "@/lib/leaderboard/time-control";
import { leaderboardPathForTimeControl, parseLeaderboardTimeControlFromPathname } from "@/lib/leaderboard/time-control";

/** 对局榜时限（谜题独立为 /leaderboard/puzzles，不在此下拉中）。 */
type GamesTimeControl = Exclude<LeaderboardTimeControl, "puzzle">;

const OPTIONS: { value: GamesTimeControl; label: string }[] = [
  { value: "rapid", label: "Rapid（快棋）" },
  { value: "blitz", label: "Blitz（闪电）" },
  { value: "bullet", label: "Bullet（子弹）" },
];

export function LeaderboardTimeControlSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = parseLeaderboardTimeControlFromPathname(pathname);
  const current: GamesTimeControl = raw === "puzzle" ? "rapid" : raw;

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <label className="flex items-center gap-2">
        <span className="shrink-0">对局时限</span>
        <select
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          value={current}
          onChange={(e) => {
            const v = e.target.value as GamesTimeControl;
            const p = new URLSearchParams(searchParams.toString());
            p.delete("tc");
            const qs = p.toString();
            const base = leaderboardPathForTimeControl(v);
            const url = qs ? `${base}?${qs}` : base;
            startTransition(() => {
              router.push(url);
            });
          }}
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <Link
        href="/leaderboard/puzzles"
        className="rounded-md border border-border/80 bg-muted/30 px-2.5 py-1.5 text-foreground transition hover:bg-muted/50"
      >
        谜题榜
      </Link>
    </div>
  );
}
