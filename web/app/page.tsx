import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-2xl flex-col justify-center px-4 py-10 sm:min-h-[calc(100vh-4rem)] sm:py-16">
      <Card className="border-border/70 bg-card/90 shadow-2xl shadow-black/50 backdrop-blur-sm">
        <CardHeader className="space-y-3 text-center sm:text-left">
          <CardTitle className="font-heading text-3xl tracking-tight sm:text-4xl">
            欢迎回来
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            追踪 Chess.com Rapid / Blitz / Bullet 分数，查看趋势与对局排行榜。数据由 Go Worker 同步，Phase 2 将支持
            PGN 与开局分析。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/leaderboard">进入对局排行榜</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full border-primary/40 sm:w-auto">
            <Link href="/players/new">添加学生</Link>
          </Button>
        </CardContent>
        <CardContent className="border-t border-border/60 pt-0 text-sm text-muted-foreground">
          <p>
            首次使用请在 <code className="rounded bg-muted px-1">web/.env.local</code> 配置{" "}
            <code className="rounded bg-muted px-1">DATABASE_URL</code>（MySQL），应用{" "}
            <code className="rounded bg-muted px-1">mysql/migrations</code> 后，在「添加学生」中录入 Chess.com 用户名。
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
