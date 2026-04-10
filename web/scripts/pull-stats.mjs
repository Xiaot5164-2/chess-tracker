#!/usr/bin/env node
/**
 * One-shot：谜题当前分 → daily_puzzle_stats（UTC 当日）。
 * 棋钟分由 games→daily_game_stats（Worker 或「添加学生」拉取归档对局后重算），不在此写入。
 *
 * Run: cd web && npm run pull-stats
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const p = join(webDir, ".env.local");
  const env = {};
  let raw;
  try {
    raw = readFileSync(p, "utf8");
  } catch {
    console.error("Missing web/.env.local (need DATABASE_URL=mysql://...).");
    process.exit(1);
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

const env = loadEnvLocal();
const databaseUrl = env.DATABASE_URL || "";
if (!databaseUrl.trim()) {
  console.error("Need DATABASE_URL in web/.env.local (mysql://user:pass@host:3306/db).");
  process.exit(1);
}

const mysql = await import("mysql2/promise");

function poolOptionsFromUrl(urlStr) {
  const u = new URL(urlStr);
  const database = u.pathname.replace(/^\//, "") || "";
  if (!database) {
    throw new Error("DATABASE_URL must include database in path");
  }
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    waitForConnections: true,
    connectionLimit: 4,
    timezone: "+00:00",
  };
}

const pool = mysql.createPool(poolOptionsFromUrl(databaseUrl));

const puzzleCallbackURL = (u) =>
  `https://www.chess.com/callback/stats/tactics2/new/puzzles/${encodeURIComponent(String(u).trim().toLowerCase())}`;

async function fetchPuzzleCurrentRating(username, timeoutMs = 12_000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(puzzleCallbackURL(username), {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; chess-tracker-pull-stats/1.0)" },
    });
    if (!res.ok) return undefined;
    const j = await res.json();
    const r = j?.statsInfo?.stats?.rating;
    return typeof r === "number" && Number.isFinite(r) ? Math.round(r) : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(tid);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function utcTodayDateStr() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const [profileRows] = await pool.query("SELECT id, chess_username FROM profiles ORDER BY chess_username ASC");
const profiles = profileRows;

if (!profiles?.length) {
  console.log("no profiles to sync");
  await pool.end();
  process.exit(0);
}

const qps = 2;
const gapMs = Math.ceil(1000 / qps);
const statDate = utcTodayDateStr();

let ok = 0;
for (const p of profiles) {
  const puzzleR = await fetchPuzzleCurrentRating(p.chess_username);
  await sleep(gapMs);

  if (puzzleR == null) {
    console.log(`${p.chess_username}: no puzzle rating`);
    await sleep(gapMs);
    continue;
  }

  const conn = await pool.getConnection();
  try {
    const [prevRows] = await conn.query(
      `SELECT rating_day_end FROM daily_puzzle_stats
       WHERE profile_id = ? AND stat_date = DATE_SUB(?, INTERVAL 1 DAY)`,
      [p.id, statDate],
    );
    const prev = prevRows[0]?.rating_day_end;
    const start = prev != null && Number.isFinite(Number(prev)) ? Number(prev) : puzzleR;

    await conn.execute(
      `INSERT INTO daily_puzzle_stats (profile_id, stat_date, rating_day_start, rating_day_end, computed_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(6))
       ON DUPLICATE KEY UPDATE
         rating_day_end = VALUES(rating_day_end),
         rating_day_start = COALESCE(daily_puzzle_stats.rating_day_start, VALUES(rating_day_start)),
         computed_at = UTC_TIMESTAMP(6)`,
      [p.id, statDate, start, puzzleR],
    );
    ok++;
    console.log(`${p.chess_username}: puzzle upserted`);
  } catch (e) {
    console.error(`${p.chess_username}:`, e.message || e);
  } finally {
    conn.release();
  }
  await sleep(gapMs);
}

await pool.end();
console.log(`done: ${ok}/${profiles.length} profile(s) puzzle updated`);
