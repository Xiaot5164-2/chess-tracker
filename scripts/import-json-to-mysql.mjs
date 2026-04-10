#!/usr/bin/env node
/**
 * 将 profiles.json / daily_stats.json（与 migrate-pg-to-mysql 相同字段）写入 TARGET_MYSQL_URL。
 * 会先 TRUNCATE profiles、daily_stats、games（与 migrate-pg-to-mysql 一致）。
 *
 *   TARGET_MYSQL_URL='mysql://...' node import-json-to-mysql.mjs ./profiles.json ./daily_stats.json
 */
import { readFileSync } from "fs";
import mysql from "mysql2/promise";

const dst = process.env.TARGET_MYSQL_URL?.trim();
const profilesPath = process.argv[2];
const statsPath = process.argv[3];

if (!dst || !profilesPath || !statsPath) {
  console.error(
    "用法: TARGET_MYSQL_URL='mysql://...' node import-json-to-mysql.mjs <profiles.json> <daily_stats.json>",
  );
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

function normalizeMysqlTimestamp(v) {
  if (v == null) return v;
  const s = String(v).trim();
  const m = s.match(
    /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:[+-]\d{2}(?::?\d{2})?|Z)?$/,
  );
  if (m) return m[1].replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  return s;
}

const profiles = JSON.parse(readFileSync(profilesPath, "utf8"));
const stats = JSON.parse(readFileSync(statsPath, "utf8"));
const pool = mysqlPoolFromUrl(dst);
const conn = await pool.getConnection();

try {
  await conn.beginTransaction();
  await conn.query("SET FOREIGN_KEY_CHECKS=0");
  await conn.query("TRUNCATE TABLE daily_stats");
  await conn.query("TRUNCATE TABLE games");
  await conn.query("TRUNCATE TABLE profiles");
  await conn.query("SET FOREIGN_KEY_CHECKS=1");

  for (const p of profiles) {
    await conn.execute(
      `INSERT INTO profiles (id, chess_username, display_name, avatar_url, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        p.id,
        p.chess_username,
        p.display_name,
        p.avatar_url ?? null,
        normalizeMysqlTimestamp(p.created_at),
      ],
    );
  }
  console.log(`profiles: ${profiles.length} row(s)`);

  for (const s of stats) {
    await conn.execute(
      `INSERT INTO daily_stats (profile_id, rating_type, rating, recorded_at)
       VALUES (?, ?, ?, ?)`,
      [
        s.profile_id,
        s.rating_type,
        s.rating,
        normalizeMysqlTimestamp(s.recorded_at),
      ],
    );
  }
  console.log(`daily_stats: ${stats.length} row(s)`);

  await conn.commit();
  console.log("导入完成。");
} catch (e) {
  await conn.rollback();
  console.error(e);
  process.exit(1);
} finally {
  conn.release();
  await pool.end();
}
