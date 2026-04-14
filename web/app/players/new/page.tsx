"use client";

import { useActionState } from "react";
import Link from "next/link";

import { addPlayer } from "./actions";
import { addPlayerInitialState } from "@/lib/players/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewPlayerPage() {
  const [state, formAction, pending] = useActionState(addPlayer, addPlayerInitialState);

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-8 md:px-6 md:py-10">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">添加学生</h1>
      </div>

      <Card className="border-border/70 bg-card/90 shadow-xl shadow-black/40">
        <CardHeader>
          <CardTitle>Chess.com 账号</CardTitle>
        </CardHeader>
        <form action={formAction}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="chess_username" className="text-sm font-medium">
                Chess.com 用户名 <span className="text-destructive">*</span>
              </label>
              <input
                id="chess_username"
                name="chess_username"
                required
                autoComplete="off"
                placeholder="例如 hikaru"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="display_name" className="text-sm font-medium">
                展示名（可选）
              </label>
              <input
                id="display_name"
                name="display_name"
                autoComplete="off"
                placeholder="在排行榜上显示的名称"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {pending ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                正在提交…
              </p>
            ) : null}
            {state.message ? (
              <p
                className={`text-sm ${state.ok ? "text-emerald-400" : "text-destructive"}`}
                role="status"
              >
                {state.message}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:flex-wrap">
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "提交中…" : "添加"}
            </Button>
            <Button asChild variant="outline" type="button" className="w-full sm:w-auto">
              <Link href="/leaderboard">查看对局排行榜</Link>
            </Button>
            <Button asChild variant="outline" type="button" className="w-full sm:w-auto">
              <Link href="/">首页</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
