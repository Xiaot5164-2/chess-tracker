import { randomUUID } from "node:crypto";

import { after } from "next/server";
import type { Pool } from "mysql2/promise";

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

/** 写入 profiles 之后：拉取对局归档、重算日表、谜题快照（不阻塞添加接口）。 */
async function postInsertProfileSync(pool: Pool, profileId: string, chessUsername: string): Promise<void> {
  const puzzlePromise = fetchChessComPuzzleCurrentRating(chessUsername);

  const backfill = await syncProfileGamesBackfill(pool, profileId, chessUsername);
  if (!backfill.ok) {
    logDev(
      "syncProfileGamesBackfill",
      new Error(`近 ${configuredGamesBackfillDays()} 天对局拉取失败：${backfill.message}`),
    );
  } else {
    try {
      await refreshDailyGameStatsFromGames(pool);
      try {
        await seedDailyGameStatsWhenNoGames(pool);
      } catch (se) {
        logDev("seedDailyGameStatsWhenNoGames", se);
      }
    } catch (re) {
      logDev(
        "refreshDailyGameStatsFromGames",
        new Error(
          `已写入 ${backfill.gamesUpserted} 盘对局，但 daily_game_stats 重算失败：${re instanceof Error ? re.message : String(re)}`,
        ),
      );
    }
  }

  const puzzleCurrent = (await puzzlePromise) ?? null;
  const puzzleSync = await upsertDailyPuzzleStats(pool, profileId, puzzleCurrent);
  if (!puzzleSync.ok) {
    logDev("upsertDailyPuzzleStats", new Error(puzzleSync.message));
  }
}

function schedulePostInsertProfileSync(pool: Pool, profileId: string, chessUsername: string) {
  const run = () =>
    void postInsertProfileSync(pool, profileId, chessUsername).catch((e) => {
      console.error("[addPlayer:postInsertProfileSync]", e);
    });
  try {
    after(run);
  } catch {
    run();
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

    schedulePostInsertProfileSync(pool, id, pub.username);

    return {
      ok: true,
      message: `已通过：已添加 ${pub.username}。近 ${configuredGamesBackfillDays()} 天对局与谜题分值在后台同步，稍后刷新榜单即可。`,
    };
  } catch (e) {
    logDev("unexpected", e);
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
