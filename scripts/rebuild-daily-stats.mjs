#!/usr/bin/env node
/**
 * 1) TRUNCATE daily_game_stats（可选同时 TRUNCATE daily_puzzle_stats）
 * 2) docker compose run worker RUN_ONCE=1 SYNC_GAMES=1 — 由 Go 从 games 重算 daily_game_stats
 *
 * 用法（仓库根目录）：
 *   DATABASE_URL='mysql://...' node rebuild-daily-stats.mjs
 *
 * 同时清空谜题日表（危险）：
 *   ALLOW_TRUNCATE_PUZZLE=1 DATABASE_URL='mysql://...' node rebuild-daily-stats.mjs
 */
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { loadEnvFiles, mysqlPoolFromUrl } from "./lib/daily-game-stats-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {
    truncatePuzzle: false,
    databaseUrl: process.env.DATABASE_URL?.trim() || null,
  };
  for (const a of argv) {
    if (a === "--truncate-puzzle") out.truncatePuzzle = true;
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
  if (!args.databaseUrl) {
    console.error("需要 DATABASE_URL 或 --database-url=");
    process.exit(1);
  }
  if (args.truncatePuzzle && process.env.ALLOW_TRUNCATE_PUZZLE !== "1") {
    console.error("使用 --truncate-puzzle 时需设置 ALLOW_TRUNCATE_PUZZLE=1。");
    process.exit(1);
  }

  const pool = mysqlPoolFromUrl(args.databaseUrl);
  try {
    if (args.truncatePuzzle) {
      await pool.query(`TRUNCATE TABLE daily_puzzle_stats`);
      console.error("已 TRUNCATE daily_puzzle_stats。");
    }
    await pool.query(`TRUNCATE TABLE daily_game_stats`);
    console.error("已 TRUNCATE daily_game_stats。");
  } finally {
    await pool.end();
  }

  const repoRoot = join(__dirname, "..");
  const composeFile = join(repoRoot, "docker-compose.yml");
  if (!existsSync(composeFile)) {
    console.error("未找到 docker-compose.yml，请手动运行: docker compose run --rm -e RUN_ONCE=1 -e SYNC_GAMES=1 worker");
    process.exit(1);
  }

  const r = spawnSync(
    "docker",
    ["compose", "run", "--rm", "-e", "RUN_ONCE=1", "-e", "SYNC_GAMES=1", "worker"],
    { cwd: repoRoot, stdio: "inherit", env: { ...process.env } },
  );
  if (r.error) {
    console.error(r.error);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.error(JSON.stringify({ ok: true, note: "Worker 已重算 daily_game_stats；谜题依赖 puzzle 同步写入 daily_puzzle_stats。" }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
