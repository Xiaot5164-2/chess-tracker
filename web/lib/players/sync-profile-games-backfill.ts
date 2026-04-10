import type { Pool } from "mysql2/promise";

import {
  endTimeUTC,
  fetchGameArchiveURLs,
  fetchGamesForMonthURL,
  filterArchivesOverlappingLastDays,
} from "@/lib/chesscom/games-archive";
import { buildChesscomGame } from "@/lib/players/build-chesscom-game";
import { upsertChesscomGame } from "@/lib/players/upsert-chesscom-game";

/** 添加学生时拉取对局归档的天数（默认 90）。 */
export function configuredGamesBackfillDays(): number {
  const raw = process.env.ADD_PLAYER_GAMES_BACKFILL_DAYS;
  if (raw != null && raw !== "") {
    const n = Number.parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 365) return n;
  }
  return 90;
}

/**
 * 拉取 Chess.com 近 N 天（默认 90）月度归档中的对局，写入 games（与 Worker 一致）。
 */
export async function syncProfileGamesBackfill(
  pool: Pool,
  profileId: string,
  chessUsername: string,
): Promise<{ ok: true; gamesUpserted: number } | { ok: false; message: string }> {
  const days = configuredGamesBackfillDays();
  const cutoff = new Date(Date.now() - days * 86_400_000);

  try {
    const archives = await fetchGameArchiveURLs(chessUsername);
    const monthURLs = filterArchivesOverlappingLastDays(archives, days);
    let n = 0;
    for (const u of monthURLs) {
      const games = await fetchGamesForMonthURL(u);
      for (const g of games) {
        const end = endTimeUTC(g);
        if (!end || end.getTime() < cutoff.getTime()) continue;
        const row = buildChesscomGame(g, chessUsername);
        if (!row) continue;
        if (!row.end_time) continue;
        await upsertChesscomGame(pool, profileId, row);
        n += 1;
      }
    }
    return { ok: true, gamesUpserted: n };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
