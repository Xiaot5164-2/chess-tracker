import { NextRequest, NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/lib/db/env";
import { getLeaderboardPayload } from "@/lib/leaderboard/get-leaderboard-payload";
import { parseLeaderboardPeriod } from "@/lib/leaderboard/rapid-period";
import { parseLeaderboardTimeControlFromSlug } from "@/lib/leaderboard/time-control";

export const dynamic = "force-dynamic";

/** GET /api/leaderboard?period=7|30|90&timeControl=rapid|blitz|bullet|puzzle */
export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL 未配置", code: "pool" as const },
      { status: 503 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const periodDays = parseLeaderboardPeriod(sp.get("period") ?? undefined);

  const tcRaw = (sp.get("timeControl") ?? "rapid").toLowerCase();
  const slug =
    tcRaw === "blitz" || tcRaw === "bullet" || tcRaw === "puzzle" ? [tcRaw] : undefined;
  const timeControl = parseLeaderboardTimeControlFromSlug(slug);

  try {
    const payload = await getLeaderboardPayload(periodDays, timeControl);
    if (!payload.ok) {
      const status = payload.code === "pool" ? 503 : 500;
      return NextResponse.json(payload, { status });
    }
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/leaderboard]", e);
    return NextResponse.json({ ok: false as const, error: msg, code: "fatal" as const }, { status: 500 });
  }
}
