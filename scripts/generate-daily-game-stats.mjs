#!/usr/bin/env node
/**
 * 根据 MySQL 中已拉取的 `games`（及 `daily_game_stats` 导出逻辑），按 UTC 自然日汇总每位棋手的
 * Rapid / Blitz / Bullet 统计（对局数据来自 `games` 表，由 worker 通过 Chess.com
 * `GET /pub/player/{user}/games/{YYYY}/{MM}` 等接口同步写入）。
 *
 * 持久化表结构见 `mysql/migrations/005_split_daily_stats.sql` 与 `006_daily_game_stats_single_rating.sql`；批量写入用 `rebuild-daily-stats.mjs`。
 *
 * 依赖：DATABASE_URL（mysql://...），与 web 相同。
 *
 * 用法（在 scripts/ 目录）：
 *   DATABASE_URL='mysql://...' node generate-daily-game-stats.mjs --username=hikaru --from=2025-01-01 --to=2025-04-01
 *   DATABASE_URL='mysql://...' node generate-daily-game-stats.mjs --profile-id=<uuid> --from=2025-01-01
 *   DATABASE_URL='mysql://...' node generate-daily-game-stats.mjs --all-profiles --from=2025-03-01 --to=2025-03-31
 *
 * 可选：在仓库根目录或 scripts/ 放置 `.env` / `.env.local`（仅当环境变量未设置时读取 DATABASE_URL）。
 */
import {
  aggregateDailyGameStats,
  formatFlatRowForCli,
  loadEnvFiles,
  mysqlPoolFromUrl,
  toCsv,
  utcDayStr,
} from "./lib/daily-game-stats-core.mjs";

function parseArgs(argv) {
  const out = {
    username: null,
    profileId: null,
    allProfiles: false,
    from: null,
    to: null,
    format: "json",
    databaseUrl: process.env.DATABASE_URL?.trim() || null,
  };
  for (const a of argv) {
    if (a === "--all-profiles") out.allProfiles = true;
    else if (a.startsWith("--username=")) out.username = a.slice("--username=".length).trim();
    else if (a.startsWith("--profile-id="))
      out.profileId = a.slice("--profile-id=".length).trim();
    else if (a.startsWith("--from=")) out.from = a.slice("--from=".length).trim();
    else if (a.startsWith("--to=")) out.to = a.slice("--to=".length).trim();
    else if (a.startsWith("--format=")) out.format = a.slice("--format=".length).trim().toLowerCase();
    else if (a.startsWith("--database-url="))
      out.databaseUrl = a.slice("--database-url=".length).trim();
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

async function main() {
  loadEnvFiles();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`用法见文件头注释。`);
    process.exit(0);
  }
  const explicitProfile = !!(args.username || args.profileId);
  if (!args.allProfiles && !explicitProfile) {
    console.error("请指定 --username=、--profile-id= 或 --all-profiles");
    process.exit(1);
  }
  if (!args.databaseUrl) {
    console.error("需要环境变量 DATABASE_URL 或 --database-url=");
    process.exit(1);
  }

  const to = args.to || utcDayStr(new Date());
  const fromDefault = new Date();
  fromDefault.setUTCDate(fromDefault.getUTCDate() - 30);
  const from = args.from || utcDayStr(fromDefault);

  const pool = mysqlPoolFromUrl(args.databaseUrl);
  try {
    let profiles = [];
    if (args.profileId) {
      const [rows] = await pool.query(
        `SELECT id, chess_username FROM profiles WHERE id = ? LIMIT 1`,
        [args.profileId],
      );
      profiles = rows;
    } else if (args.username) {
      const [rows] = await pool.query(
        `SELECT id, chess_username FROM profiles WHERE LOWER(chess_username) = LOWER(?) LIMIT 1`,
        [args.username],
      );
      profiles = rows;
    } else {
      const [rows] = await pool.query(`SELECT id, chess_username FROM profiles ORDER BY chess_username`);
      profiles = rows;
    }

    if (profiles.length === 0) {
      console.error("未找到 profiles。");
      process.exit(1);
    }

    const profileIds = profiles.map((p) => p.id);
    const usernameById = Object.fromEntries(profiles.map((p) => [p.id, p.chess_username]));

    const flatRows = await aggregateDailyGameStats(pool, {
      profileIds,
      usernameById,
      from,
      to,
    });

    const outRows = flatRows.map((r) => formatFlatRowForCli(r, args.format));

    if (args.format === "csv") {
      process.stdout.write(toCsv(outRows) + (outRows.length ? "\n" : ""));
    } else {
      process.stdout.write(JSON.stringify(outRows, null, 2) + "\n");
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
