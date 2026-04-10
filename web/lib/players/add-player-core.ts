import { randomUUID } from "node:crypto";

import { fetchChessComPuzzleCurrentRating } from "@/lib/chesscom/puzzle-callback";
import { fetchChessComPlayer } from "@/lib/chesscom/pub-player";
import { isDuplicateKeyError } from "@/lib/db/mysql-errors";
import { getMysqlPool } from "@/lib/db/pool";
import { normalizeChessUsername } from "@/lib/players/chess-username";
import { refreshDailyGameStatsFromGames } from "@/lib/players/refresh-daily-game-stats";
import { seedDailyGameStatsWhenNoGames } from "@/lib/players/seed-daily-game-stats-when-no-games";
import {
  configuredGamesBackfillDays,
  syncProfileGamesBackfill,
} from "@/lib/players/sync-profile-games-backfill";
import type { AddPlayerState } from "@/lib/players/types";
import { upsertDailyPuzzleStats } from "@/lib/players/upsert-daily-stats";

export type AddPlayerInput = {
  chess_username: string;
  display_name?: string;
};

function logDev(stage: string, err: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.error(`[addPlayer:${stage}]`, err);
  }
}

export async function addPlayerCore(input: AddPlayerInput): Promise<AddPlayerState> {
  try {
    const username = normalizeChessUsername(input.chess_username);
    if (!username) {
      return { ok: false, message: "请输入有效的 Chess.com 用户名（字母、数字、下划线、连字符，最长 64）。" };
    }

    const displayOverride = (input.display_name ?? "").trim();

    let pool;
    try {
      pool = getMysqlPool();
    } catch (e) {
      logDev("getMysqlPool", e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("DATABASE_URL")) {
        return {
          ok: false,
          message:
            "未配置数据库：在 web/.env.local 或部署平台设置 DATABASE_URL（mysql://...）。修改后需重启 dev 服务器。",
        };
      }
      return { ok: false, message: msg };
    }

    let pub;
    try {
      pub = await fetchChessComPlayer(username);
    } catch (e) {
      logDev("fetchChessComPlayer", e);
      return {
        ok: false,
        message: `无法访问 Chess.com：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    if (!pub) {
      return { ok: false, message: "在 Chess.com 上未找到该用户，请检查拼写。" };
    }

    const display_name = displayOverride || pub.name || pub.username;
    const id = randomUUID();

    try {
      await pool.execute(
        "INSERT INTO profiles (id, chess_username, display_name, avatar_url) VALUES (?, ?, ?, ?)",
        [id, pub.username, display_name, pub.avatar ?? null],
      );
    } catch (e) {
      logDev("mysql.insert profiles", e);
      if (isDuplicateKeyError(e)) {
        return { ok: false, message: "该 Chess.com 用户名已在列表中。" };
      }
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }

    let syncNote = "";
    try {
      const puzzlePromise = fetchChessComPuzzleCurrentRating(pub.username);

      const backfill = await syncProfileGamesBackfill(pool, id, pub.username);
      if (!backfill.ok) {
        syncNote = `（近 ${configuredGamesBackfillDays()} 天对局拉取失败：${backfill.message}）`;
      } else {
        try {
          await refreshDailyGameStatsFromGames(pool);
          try {
            await seedDailyGameStatsWhenNoGames(pool);
          } catch (se) {
            logDev("seedDailyGameStatsWhenNoGames", se);
          }
          syncNote = ` 已拉取近 ${configuredGamesBackfillDays()} 天归档，写入 ${backfill.gamesUpserted} 盘对局并汇总 daily_game_stats。`;
        } catch (re) {
          syncNote = `（已写入 ${backfill.gamesUpserted} 盘对局，但 daily_game_stats 重算失败：${re instanceof Error ? re.message : String(re)}）`;
        }
      }

      const puzzleCurrent = (await puzzlePromise) ?? null;
      const puzzleSync = await upsertDailyPuzzleStats(pool, id, puzzleCurrent);
      if (!puzzleSync.ok) {
        syncNote += `（谜题分写入失败：${puzzleSync.message}）`;
      } else if (puzzleCurrent != null) {
        syncNote += " 已写入谜题当日快照。";
      }
    } catch (e) {
      logDev("syncStats", e);
      syncNote += `（同步扩展失败：${e instanceof Error ? e.message : String(e)}）`;
    }

    return { ok: true, message: `已添加 ${pub.username}。${syncNote}` };
  } catch (e) {
    logDev("unexpected", e);
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
