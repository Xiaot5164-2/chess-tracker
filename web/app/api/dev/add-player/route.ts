import { NextResponse } from "next/server";

import { addPlayerCore } from "@/lib/players/add-player-core";

/**
 * Development-only JSON endpoint to debug the same logic as the Server Action.
 * Call: curl -X POST http://localhost:3000/api/dev/add-player -H "Content-Type: application/json" -d '{"chess_username":"erik"}'
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { chess_username?: string; display_name?: string };
    const result = await addPlayerCore({
      chess_username: String(body.chess_username ?? ""),
      display_name: body.display_name,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (e) {
    console.error("[api/dev/add-player]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
