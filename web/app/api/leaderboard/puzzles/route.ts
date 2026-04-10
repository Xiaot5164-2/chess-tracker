import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/lib/db/env";
import { getPuzzleLeaderboardPayload } from "@/lib/leaderboard/get-puzzle-leaderboard-payload";

export const dynamic = "force-dynamic";

/** GET /api/leaderboard/puzzles — 谜题独立榜：最新分、累计做题数、通过率、平均每题用时（秒）；无 period。 */
export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL 未配置", code: "pool" as const },
      { status: 503 },
    );
  }

  try {
    const payload = await getPuzzleLeaderboardPayload();
    if (!payload.ok) {
      const status = payload.code === "pool" ? 503 : 500;
      return NextResponse.json(payload, { status });
    }
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/leaderboard/puzzles]", e);
    return NextResponse.json({ ok: false as const, error: msg, code: "fatal" as const }, { status: 500 });
  }
}
