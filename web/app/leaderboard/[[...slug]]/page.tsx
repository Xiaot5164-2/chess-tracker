import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LeaderboardClient } from "@/components/leaderboard-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseLeaderboardPeriod } from "@/lib/leaderboard/rapid-period";
import { isDatabaseConfigured } from "@/lib/db/env";
import {
  leaderboardPathForTimeControl,
  parseLeaderboardTimeControlFromSlug,
} from "@/lib/leaderboard/time-control";

export const dynamic = "force-dynamic";

function periodQueryString(sp: Record<string, string | string[] | undefined>): string {
  const pd = parseLeaderboardPeriod(sp.period);
  if (pd === 7) {
    return "";
  }
  return `period=${pd}`;
}

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const legacyTcRaw = sp.tc;
  const legacyTc = Array.isArray(legacyTcRaw) ? legacyTcRaw[0] : legacyTcRaw;
  if (legacyTc === "puzzle") {
    redirect("/leaderboard/puzzles");
  }
  if (legacyTc === "blitz" || legacyTc === "bullet") {
    const q = periodQueryString(sp);
    redirect(q ? `${leaderboardPathForTimeControl(legacyTc)}?${q}` : leaderboardPathForTimeControl(legacyTc));
  }

  const { slug } = await params;
  if (slug != null && slug.length > 1) {
    notFound();
  }
  const head = slug?.[0];
  if (head === "rapid") {
    const q = periodQueryString(sp);
    redirect(q ? `/leaderboard?${q}` : "/leaderboard");
  }
  if (head === "puzzle" || head === "puzzles") {
    redirect("/leaderboard/puzzles");
  }
  if (head != null && head !== "blitz" && head !== "bullet") {
    notFound();
  }

  const periodDays = parseLeaderboardPeriod(sp.period);
  const timeControl = parseLeaderboardTimeControlFromSlug(slug);

  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Card className="border-border/70 bg-card/90 shadow-xl shadow-black/40">
          <CardHeader>
            <CardTitle>配置数据库</CardTitle>
            <CardDescription>
              在 <code className="rounded bg-muted px-1">web/.env.local</code> 中设置{" "}
              <code className="rounded bg-muted px-1">DATABASE_URL</code>（例如{" "}
              <code className="rounded bg-muted px-1">mysql://user:pass@127.0.0.1:3306/chess_tracker</code>
              ），应用 <code className="rounded bg-muted px-1">mysql/migrations/</code> 中的 SQL 后，重启{" "}
              <code className="rounded bg-muted px-1">npm run dev</code>。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/">返回首页</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <LeaderboardClient periodDays={periodDays} timeControl={timeControl} />;
}
