/**
 * generate-daily-game-stats：从 daily_game_stats / daily_puzzle_stats 读库导出（Worker 负责写入）。
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const TIME_CLASSES = ["rapid", "blitz", "bullet"];

export function utcDayStr(d) {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

export function loadEnvFiles() {
  const candidates = [
    join(__dirname, "..", ".env"),
    join(__dirname, "..", ".env.local"),
    join(__dirname, "..", "..", ".env"),
    join(__dirname, "..", "..", "web", ".env.local"),
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

export function mysqlPoolFromUrl(urlStr) {
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
    connectionLimit: 4,
    timezone: "+00:00",
  });
}

/**
 * 从 daily_game_stats 读行（棋钟：单列 rating；谜题仍为 rating_day_end）。
 */
export async function aggregateDailyGameStats(pool, { profileIds, usernameById: _u, from, to }) {
  const [rows] = await pool.query(
    `SELECT d.*, p.chess_username
     FROM daily_game_stats d
     JOIN profiles p ON p.id = d.profile_id
     WHERE d.profile_id IN (?)
       AND d.stat_date >= ? AND d.stat_date <= ?
     ORDER BY d.profile_id ASC, d.stat_date ASC, FIELD(d.time_class, 'rapid', 'blitz', 'bullet')`,
    [profileIds, from, to],
  );

  const flatRows = [];
  for (const d of rows) {
    const pid = d.profile_id;
    const day =
      d.stat_date instanceof Date
        ? d.stat_date.toISOString().slice(0, 10)
        : String(d.stat_date).slice(0, 10);
    const tc = String(d.time_class).toLowerCase();
    const rating = d.rating != null ? Number(d.rating) : null;
    const numOrNull = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

    flatRows.push({
      profile_id: pid,
      chess_username: d.chess_username,
      day,
      time_class: tc,
      games: d.games,
      wins: d.wins,
      losses: d.losses,
      draws: d.draws,
      outcome_unknown: d.outcome_unknown,
      rating,
      avg_opponent_rating: numOrNull(d.avg_opponent_rating),
      avg_half_moves: numOrNull(d.avg_half_moves),
      avg_seconds_per_own_move: numOrNull(d.avg_seconds_per_own_move),
    });
  }

  return flatRows;
}

/** 兼容旧名：Worker 已写入 DB，此处不再 upsert */
export async function upsertDailyGameStats(_pool, _flatRows) {
  return 0;
}

export function formatFlatRowForCli(flat, format) {
  if (format === "csv") {
    return { ...flat };
  }
  const { chess_username, profile_id, ...rest } = flat;
  return {
    ...rest,
    profile_id,
    chess_username,
    profile: {
      profile_id,
      chess_username,
    },
  };
}

export function toCsv(rows) {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}
