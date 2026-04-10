#!/usr/bin/env node
/**
 * 清空 daily_game_stats（可选 daily_puzzle_stats），再一次性 Worker 从 games / 谜题 API 重建。
 *
 * 用法：
 *   ALLOW_TRUNCATE_STATS=1 DATABASE_URL='mysql://...' node init-daily-stats.mjs
 *   ALLOW_TRUNCATE_STATS=1 DATABASE_URL='mysql://...' node init-daily-stats.mjs --compose-resync
 *
 * 同时清空 daily_puzzle_stats：
 *   ALLOW_TRUNCATE_STATS=1 node init-daily-stats.mjs --truncate-puzzle
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFiles() {
  const candidates = [
    join(__dirname, ".env"),
    join(__dirname, "..", "backend-go", ".env"),
    join(__dirname, "..", "web", ".env.local"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function mysqlPoolFromUrl(urlStr) {
  const u = new URL(urlStr);
  const database = u.pathname.replace(/^\//, "") || "";
  if (!database) throw new Error("DATABASE_URL 需在 path 中指定库名");
  return mysql.createPool({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    waitForConnections: true,
    connectionLimit: 2,
    timezone: "+00:00",
  });
}

function parseArgs(argv) {
  const out = {
    composeResync: false,
    truncatePuzzle: false,
    databaseUrl: process.env.DATABASE_URL?.trim() || null,
  };
  for (const a of argv) {
    if (a === "--compose-resync") out.composeResync = true;
    if (a === "--truncate-puzzle") out.truncatePuzzle = true;
    else if (a.startsWith("--database-url="))
      out.databaseUrl = a.slice("--database-url=".length).trim();
  }
  return out;
}

async function main() {
  loadEnvFiles();
  const args = parseArgs(process.argv.slice(2));
  if (!args.databaseUrl) {
    console.error("需要 DATABASE_URL 或 --database-url=");
    process.exit(1);
  }
  if (process.env.ALLOW_TRUNCATE_STATS !== "1") {
    console.error("拒绝执行：请设置 ALLOW_TRUNCATE_STATS=1 确认将清空日统计表。");
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

  if (!args.composeResync) {
    console.error("下一步：docker compose run --rm -e RUN_ONCE=1 -e SYNC_GAMES=1 worker");
    return;
  }

  const repoRoot = join(__dirname, "..");
  const composeFile = join(repoRoot, "docker-compose.yml");
  if (!existsSync(composeFile)) {
    console.error("未找到 docker-compose.yml。");
    return;
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
  console.error("一次性 Worker 已完成（games→daily_game_stats + 谜题→daily_puzzle_stats）。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
