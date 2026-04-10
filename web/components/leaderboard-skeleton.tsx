/** Pure Tailwind placeholder for /leaderboard route loading (no ui/* imports). */
export function LeaderboardSkeleton() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6 md:py-10">
      <div className="space-y-2">
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted/50" />
        <div className="h-4 max-w-2xl animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted/40" />
      </div>
      <div className="rounded-xl border border-border/70 bg-card/90 p-6 shadow-xl shadow-black/40">
        <div className="flex flex-col gap-4 pb-2 sm:flex-row sm:justify-between">
          <div className="space-y-2">
            <div className="h-6 w-32 animate-pulse rounded bg-muted/50" />
            <div className="h-4 max-w-xl animate-pulse rounded bg-muted/40" />
          </div>
          <div className="h-9 min-w-[200px] animate-pulse rounded-md bg-muted/40" />
        </div>
        <div className="space-y-3 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-border/40 py-3 last:border-0">
              <div className="h-4 w-6 shrink-0 animate-pulse rounded bg-muted/40" />
              <div className="h-9 flex-1 animate-pulse rounded bg-muted/30" />
              <div className="h-4 w-14 shrink-0 animate-pulse rounded bg-muted/40" />
              <div className="h-4 w-14 shrink-0 animate-pulse rounded bg-muted/40" />
              <div className="h-9 min-w-[120px] shrink-0 animate-pulse rounded bg-muted/40" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
