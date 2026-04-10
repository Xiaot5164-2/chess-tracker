#!/usr/bin/env node
/**
 * 一次性：从 PostgreSQL（Supabase）拉取 public.profiles / daily_stats / games，写入 MySQL。
 *
 * 用法（在仓库根目录）：
 *   cd scripts && npm install
 *   SOURCE_POSTGRES_URL='postgresql://...' TARGET_MYSQL_URL='mysql://...' node migrate-pg-to-mysql.mjs
 *
 * 可选：在 `scripts/.env.migrate` 中写上述两行（KEY=value，每行一条），未在环境里设置时从此文件读取。
 *
 * 警告：默认会 TRUNCATE 目标库中 profiles、daily_stats、games（请先备份 MySQL）。
 */
import crypto from "crypto";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

function mysqlChesscomUuid(gameId, profileId) {
  const s = String(gameId ?? "").trim();
  if (s.length >= 36 && s.includes("-")) {
    return s.length > 64 ? s.slice(0, 64) : s;
  }
  return crypto.createHash("sha256").update(`${profileId}|${gameId}`).digest("hex").slice(0, 64);
}
const envMigratePath = join(__dirname, ".env.migrate");
if (existsSync(envMigratePath)) {
  for (const line of readFileSync(envMigratePath, "utf8").split("\n")) {
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

const src = process.env.SOURCE_POSTGRES_URL?.trim();
const dst = process.env.TARGET_MYSQL_URL?.trim();

if (!src || !dst) {
  console.error("需要环境变量 SOURCE_POSTGRES_URL 与 TARGET_MYSQL_URL。");
  process.exit(1);
}

function mysqlPoolFromUrl(urlStr) {
  const u = new URL(urlStr);
  const database = u.pathname.replace(/^\//, "") || "";
  if (!database) throw new Error("TARGET_MYSQL_URL 需在 path 中指定库名");
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

// Supabase / 多数托管库需要 TLS；连接串带 sslmode=require 时 pg 会自动启用
const pgClient = new pg.Client({
  connectionString: src,
  ssl:
    /sslmode=require|sslmode=verify-full/i.test(src) || /\.supabase\.co/i.test(src)
      ? { rejectUnauthorized: false }
      : undefined,
});
const pool = mysqlPoolFromUrl(dst);

await pgClient.connect();
const conn = await pool.getConnection();

try {
  await conn.beginTransaction();
  await conn.query("SET FOREIGN_KEY_CHECKS=0");
  await conn.query("TRUNCATE TABLE daily_stats");
  await conn.query("TRUNCATE TABLE games");
  await conn.query("TRUNCATE TABLE profiles");
  await conn.query("SET FOREIGN_KEY_CHECKS=1");

  const { rows: profiles } = await pgClient.query(
    `SELECT id::text AS id, chess_username, display_name, avatar_url, created_at
     FROM public.profiles
     ORDER BY chess_username`,
  );
  for (const p of profiles) {
    await conn.execute(
      `INSERT INTO profiles (id, chess_username, display_name, avatar_url, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [p.id, p.chess_username, p.display_name, p.avatar_url, p.created_at],
    );
  }
  console.log(`profiles: ${profiles.length} row(s)`);

  const { rows: stats } = await pgClient.query(
    `SELECT profile_id::text AS profile_id, rating_type, rating, recorded_at
     FROM public.daily_stats
     ORDER BY id`,
  );
  for (const s of stats) {
    await conn.execute(
      `INSERT INTO daily_stats (profile_id, rating_type, rating, recorded_at)
       VALUES (?, ?, ?, ?)`,
      [s.profile_id, s.rating_type, s.rating, s.recorded_at],
    );
  }
  console.log(`daily_stats: ${stats.length} row(s)`);

  let games = [];
  try {
    const r = await pgClient.query(
      `SELECT game_id, profile_id::text AS profile_id, pgn, end_time, result
       FROM public.games
       ORDER BY game_id`,
    );
    games = r.rows;
  } catch {
    console.log("games: skip (table missing or no access)");
  }
  for (const g of games) {
    const chesscomUuid = mysqlChesscomUuid(g.game_id, g.profile_id);
    await conn.execute(
      `INSERT INTO games (
        profile_id, chesscom_uuid, game_url, pgn, end_time,
        white_username, black_username, player_color, player_result
      ) VALUES (?, ?, 'https://www.chess.com/game/legacy', ?, ?, 'unknown', 'unknown', 'white', ?)`,
      [g.profile_id, chesscomUuid, g.pgn, g.end_time, g.result],
    );
  }
  if (games.length) {
    console.log(`games: ${games.length} row(s)`);
  }

  await conn.commit();
  console.log("迁移完成。");
} catch (e) {
  await conn.rollback();
  console.error(e);
  process.exit(1);
} finally {
  conn.release();
  await pgClient.end();
  await pool.end();
}
