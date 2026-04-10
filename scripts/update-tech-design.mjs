#!/usr/bin/env node
/**
 * 根据仓库当前代码刷新 docs/TECH_DESIGN.md 中 <!-- TECH_DESIGN_AUTO_START --> … <!-- TECH_DESIGN_AUTO_END --> 之间的快照。
 * 用法（仓库根目录）：node scripts/update-tech-design.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DOC = join(ROOT, "docs", "TECH_DESIGN.md");
const START = "<!-- TECH_DESIGN_AUTO_START -->";
const END = "<!-- TECH_DESIGN_AUTO_END -->";

function walkFiles(dir, ignore, acc) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name === "node_modules" || name === ".next" || name === ".git") {
      continue;
    }
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walkFiles(p, ignore, acc);
    } else {
      acc.push(p);
    }
  }
}

function read(p) {
  return readFileSync(p, "utf8");
}

function extractMysqlObjects(sql) {
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/gi)].map((m) => m[1]);
  const tablesBare = [
    ...sql.matchAll(/^CREATE TABLE\s+(?!IF\b)`?(\w+)`?/gim),
  ].map((m) => m[1]);
  const views = [...sql.matchAll(/CREATE OR REPLACE VIEW\s+`?(\w+)`?/gi)].map((m) => m[1]);
  return {
    tables: [...new Set([...tables, ...tablesBare])],
    views: [...new Set(views)],
  };
}

/** 合并 001 与 005：005 中的 DROP 先删名，再合并 CREATE（反映迁移后最终对象集）。 */
function mergedMysqlObjects(initSql, splitSql) {
  let tables = extractMysqlObjects(initSql).tables;
  let views = extractMysqlObjects(initSql).views;
  if (!splitSql) {
    return { tables, views };
  }
  for (const m of splitSql.matchAll(/DROP TABLE IF EXISTS\s+`?(\w+)`?/gi)) {
    tables = tables.filter((t) => t !== m[1]);
  }
  for (const m of splitSql.matchAll(/DROP VIEW IF EXISTS\s+`?(\w+)`?/gi)) {
    views = views.filter((v) => v !== m[1]);
  }
  const splitObjs = extractMysqlObjects(splitSql);
  tables = [...new Set([...tables, ...splitObjs.tables])].sort();
  views = [...new Set([...views, ...splitObjs.views])].sort();
  return { tables, views };
}

function extractGoEnvKeys(cfgSrc) {
  const keys = [...cfgSrc.matchAll(/os\.Getenv\("([^"]+)"\)/g)].map((m) => m[1]);
  return [...new Set(keys)].sort();
}

function nextPageRoutes(appDir) {
  const files = [];
  walkFiles(appDir, null, files);
  const routes = [];
  for (const abs of files) {
    if (!abs.endsWith("page.tsx")) {
      continue;
    }
    const rel = relative(appDir, abs).replace(/\\/g, "/");
    const dir = rel === "page.tsx" ? "" : rel.replace(/\/page\.tsx$/, "");
    if (dir.includes("[[...slug]]")) {
      for (const p of ["/leaderboard", "/leaderboard/blitz", "/leaderboard/bullet", "/leaderboard/puzzle"]) {
        routes.push({ file: rel, path: p });
      }
      continue;
    }
    const path = dir === "" ? "/" : `/${dir.replace(/\/+/g, "/")}`;
    routes.push({ file: rel, path });
  }
  routes.sort((a, b) => a.path.localeCompare(b.path));
  return routes;
}

function apiRoutes(appDir) {
  const files = [];
  walkFiles(appDir, null, files);
  const out = [];
  for (const abs of files) {
    if (!abs.endsWith("route.ts")) {
      continue;
    }
    const rel = relative(appDir, abs).replace(/\\/g, "/");
    const segs = rel.replace(/\/route\.ts$/, "").split("/").filter(Boolean);
    const path = `/${segs.join("/")}`.replace(/\/+/g, "/");
    out.push({ file: rel, path });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

function smokePaths() {
  const smoke = read(join(ROOT, "web", "scripts", "smoke.cjs"));
  const m = smoke.match(/const paths = \[([\s\S]*?)\];/);
  if (!m) {
    return [];
  }
  return [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
}

function loadWebVersions() {
  const pkg = JSON.parse(read(join(ROOT, "web", "package.json")));
  const pick = ["next", "react", "react-dom", "mysql2"];
  const rows = [];
  for (const k of pick) {
    const v = pkg.dependencies?.[k] ?? pkg.devDependencies?.[k];
    if (v) {
      rows.push(`| \`${k}\` | ${v} |`);
    }
  }
  return rows.join("\n");
}

function workerEnvTable(cfgSrc) {
  const keys = extractGoEnvKeys(cfgSrc);
  const notes = {
    DATABASE_URL: "MySQL DSN，必填",
    DATABASE_URL_FALLBACK: "可选备用 DSN",
    DATABASE_PREFER_IPV4: "设为 `1`/`true` 时优先 IPv4 拨号",
    DATABASE_IPV6_ONLY: "设为 `1`/`true` 时仅 IPv6",
    POLL_INTERVAL:
      "已解析，当前 Worker 未用于棋钟轮询；棋钟分由 `games`→`daily_game_stats` 聚合，默认 `1h`",
    WORKER_CONCURRENCY: "并发 worker 数，默认 `2`",
    RUN_ONCE: "设为 `1`/`true` 时完整同步一次后退出",
    PUZZLE_SYNC_INTERVAL: "谜题当前分轮询周期，默认 `10m`",
    PUZZLE_HTTP_TIMEOUT: "谜题 HTTP 单次超时，默认 `12s`",
    SYNC_GAMES: "设为 `1`/`true` 时同步 Chess.com 对局到 `games` 表",
    GAMES_BACKFILL_DAYS: "开局回溯对局的天数，默认 `90`",
    GAMES_BACKFILL_ON_START: "设为 `1` 时进程启动时回溯对局",
    GAMES_SYNC_INTERVAL: "对局增量同步周期，默认 `10m`",
    GAMES_INCREMENTAL_DAYS:
      "定时增量只处理与「当前 UTC − N 日」相交的月度归档，且只 upsert `end_time` 不早于该窗口的对局；默认 `2`",
    DAILY_GAME_STATS_LOOKBACK_DAYS:
      "已解析；当前重算 `daily_game_stats` 为自最早对局日至 UTC 当日的全量行，该值暂未使用，默认 `120`",
  };
  return keys
    .map((k) => {
      const note = notes[k] ?? "见 `backend-go/internal/config/config.go`";
      return `| \`${k}\` | ${note} |`;
    })
    .join("\n");
}

function buildAutoSection() {
  const generatedAt = new Date().toISOString();
  const webPkg = loadWebVersions();
  const appDir = join(ROOT, "web", "app");
  const pages = nextPageRoutes(appDir);
  const apis = apiRoutes(appDir);
  const initSql = read(join(ROOT, "mysql", "migrations", "001_init.sql"));
  const splitPath = join(ROOT, "mysql", "migrations", "005_split_daily_stats.sql");
  const splitSql = existsSync(splitPath) ? read(splitPath) : "";
  const split006Path = join(ROOT, "mysql", "migrations", "006_daily_game_stats_single_rating.sql");
  const split006 = existsSync(split006Path) ? read(split006Path) : "";
  const { tables, views } = mergedMysqlObjects(initSql, splitSql + "\n" + split006);
  const cfgGo = read(join(ROOT, "backend-go", "internal", "config", "config.go"));
  const smoke = smokePaths();

  const pageRows = pages.map((r) => `| \`${r.path}\` | \`${r.file}\` |`).join("\n");
  const apiRows = apis.map((r) => `| \`${r.path}\` | \`${r.file}\` |`).join("\n");
  const smokeLine = smoke.length ? smoke.map((p) => `\`${p}\``).join("、") : "（未解析到）";

  const snapshotLine = `> **自动快照**（UTC \`${generatedAt}\`）：由 \`scripts/update-tech-design.mjs\` 生成。变更页面、API、\`001_init.sql\` / \`005_split_daily_stats.sql\` 或 Worker 配置后请重新运行该脚本。`;
  return [
    "",
    snapshotLine,
    "",
    "### 前端依赖（`web/package.json` 摘录）",
    "",
    "| 包 | 版本 |",
    "|------|------|",
    webPkg,
    "",
    "### Next.js 页面路由（`web/app/**/page.tsx`）",
    "",
    "| 路径 | 源文件 |",
    "|------|--------|",
    pageRows,
    "",
    "### HTTP API（`web/app/**/route.ts`）",
    "",
    "| 路径 | 源文件 |",
    "|------|--------|",
    apiRows,
    "",
    "### Smoke 探测路径（`web/scripts/smoke.cjs`）",
    "",
    smokeLine,
    "",
    "### MySQL 对象（`001_init.sql` + `005_split_daily_stats.sql` 合并）",
    "",
    `- **表**：${tables.map((t) => `\`${t}\``).join("、")}`,
    `- **视图**：${views.map((v) => `\`${v}\``).join("、")}`,
    "",
    "### Worker 环境变量（`backend-go/internal/config/config.go`）",
    "",
    "| 变量 | 说明 |",
    "|------|------|",
    workerEnvTable(cfgGo),
    "",
  ].join("\n");
}

function main() {
  let doc = read(DOC);
  const i0 = doc.indexOf(START);
  const i1 = doc.indexOf(END);
  if (i0 === -1 || i1 === -1 || i1 < i0) {
    console.error("docs/TECH_DESIGN.md 缺少标记", START, "或", END);
    process.exit(1);
  }
  const before = doc.slice(0, i0 + START.length);
  const after = doc.slice(i1);
  const auto = buildAutoSection();
  doc = before + "\n" + auto + "\n" + after;
  writeFileSync(DOC, doc, "utf8");
  console.log("Updated", relative(ROOT, DOC));
}

main();
