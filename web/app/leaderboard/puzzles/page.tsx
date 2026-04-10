import { PuzzleLeaderboardClient } from "@/components/puzzle-leaderboard-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { isDatabaseConfigured } from "@/lib/db/env";

export const dynamic = "force-dynamic";

export default function PuzzleLeaderboardPage() {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Card className="border-border/70 bg-card/90 shadow-xl shadow-black/40">
          <CardHeader>
            <CardTitle>配置数据库</CardTitle>
            <CardDescription>
              在 <code className="rounded bg-muted px-1">web/.env.local</code> 中设置{" "}
              <code className="rounded bg-muted px-1">DATABASE_URL</code> 后重启开发服务器。
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

  return <PuzzleLeaderboardClient />;
}
