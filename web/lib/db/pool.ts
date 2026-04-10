import mysql from "mysql2/promise";
import type { Pool, PoolOptions } from "mysql2/promise";

import { getDatabaseUrl } from "./env";

function poolOptionsFromUrl(urlStr: string): PoolOptions {
  const lower = urlStr.toLowerCase();
  if (!lower.startsWith("mysql://")) {
    throw new Error("DATABASE_URL must be a mysql:// connection string");
  }
  const u = new URL(urlStr);
  const database = u.pathname.replace(/^\//, "") || "";
  if (!database) {
    throw new Error("DATABASE_URL must include the database name in the path (e.g. mysql://u:p@host:3306/chess_tracker)");
  }
  const opts: PoolOptions = {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: "+00:00",
  };
  if (u.searchParams.get("ssl") === "true" || u.searchParams.get("sslmode") === "REQUIRED") {
    opts.ssl = {};
  }
  return opts;
}

const globalForPool = globalThis as unknown as { chessTrackerMysqlPool?: Pool };

export function getMysqlPool(): Pool {
  const url = getDatabaseUrl();
  if (!globalForPool.chessTrackerMysqlPool) {
    globalForPool.chessTrackerMysqlPool = mysql.createPool(poolOptionsFromUrl(url));
  }
  return globalForPool.chessTrackerMysqlPool;
}
