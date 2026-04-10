# Repository guide for coding agents

## Purpose

Monorepo for **Project Checkmate**: Chess.com student rankings and analytics. Phase 1 focuses on Rapid/Blitz/Bullet ratings and trends; Phase 2 adds PGN parsing and opening stats (Python).

## Layout

| Path | Role |
|------|------|
| `web/` | Next.js 15 (App Router), Tailwind, Shadcn-style UI, Recharts, MySQL (`mysql2`) server-side；生产容器见 **`web/Dockerfile`**（`standalone`，默认 `PORT=8080`，适合 Cloud Run） |
| `backend-go/` | Go **worker**（同步 Chess.com）与可选 **`cmd/api`** 只读 HTTP（`/health`、`/v1/ready`、`/v1/leaderboard`）；详见 `docs/API.md` |
| `analytics-py/` | Phase 2 placeholder for PGN / analytics |
| `mysql/migrations/` | MySQL 8 schema + leaderboard views（007 games 指标、008 daily 仪表盘列、009 列注释、011 `puzzle_snapshots` + 谜题日分析列；本地栈由 `docker compose` 挂载到容器） |
| `supabase/` | 历史 Postgres 迁移（已弃用）；新环境请只用 `mysql/migrations` |
| `docker-compose.yml` | 本地一键：**MySQL + Worker + Web**；仅 Worker（外部库）见 `docker-compose.worker.yml` |

## 自 Postgres（Supabase）迁到 MySQL

```bash
cd scripts && npm install
SOURCE_POSTGRES_URL='postgresql://...' TARGET_MYSQL_URL='mysql://...' node migrate-pg-to-mysql.mjs
```

（会清空目标 MySQL 中 `profiles` / `daily_stats`（旧脚本）/ `games` 再写入；新库请用 `mysql/migrations` 中的 `daily_game_stats` 等。）

## Commands

```bash
# Frontend (from web/)
npm install
npm run dev
npm run build
npm run lint          # ignores .next/, scripts/smoke.cjs, next-env.d.ts
npm run test          # Vitest
npm run smoke         # production build + HTTP 200 check on /, /api/health, /leaderboard, /players/new

# Go worker (from backend-go/)
GOTOOLCHAIN=local go build -o bin/worker ./cmd/worker
DATABASE_URL="mysql://..." ./bin/worker

# Go 只读 API（可选，默认监听 API_LISTEN=:8080）
GOTOOLCHAIN=local go build -o bin/api ./cmd/api
DATABASE_URL="mysql://..." API_LISTEN=":8080" ./bin/api

# 仅谜题日同步（不写 games / 不重算棋钟日表）：`PUZZLE_ONLY=1 RUN_ONCE=1 SYNC_GAMES=0 ./scripts/daily-puzzle-sync.sh`（或 `cd backend-go &&` 同上环境变量后 `go run ./cmd/worker`）

# 按库内 PGN 重算 games.half_moves / avg_seconds_per_own_move（解析逻辑修正后回填一次即可）
GOTOOLCHAIN=local go run ./cmd/repair-game-metrics

# 从 games 全量重建 daily_game_stats（迁移 008 等变更列后执行）
GOTOOLCHAIN=local go run ./cmd/refresh-daily-game-stats

# Docker：./scripts/deploy.sh（默认全栈）或 --worker-only（见脚本内注释）
./scripts/deploy.sh

# 本地全栈（MySQL + Worker + Web）
docker compose up -d --build
# 仅 Worker、外部 MySQL：
#   docker compose -f docker-compose.worker.yml up -d --build
```

## Environment and secrets

- **Never commit** real database passwords or connection strings with secrets.
- **Next.js**：use `web/.env.local` (gitignored). **`DATABASE_URL=mysql://user:pass@host:3306/chess_tracker`**（读写同一库；生产可拆只读账号，需自行改代码/连接池）。`next.config.ts` 中已将 `mysql2` 列入 `serverExternalPackages`，避免 Server Action / RSC 打包导致运行时 500。
- **Vercel / hosted**: set `DATABASE_URL` in the project dashboard (server-only).
- **Worker**: `DATABASE_URL` 为 **MySQL**（`mysql://` 或 go-sql-driver 格式 DSN）。`DATABASE_URL_FALLBACK` 可选。`DATABASE_PREFER_IPV4=1` / `DATABASE_IPV6_ONLY=1` 控制 Worker 侧 TCP 拨号顺序（通过 go-sql-driver 自定义 Dial）。Docker：本地全栈 `docker compose up -d --build`；仅 Worker（外部库）`docker compose -f docker-compose.worker.yml up -d --build`（避免旧镜像仍写已删除的 `daily_stats` 表；读取 `backend-go/.env`）。启动时会校验存在 `daily_game_stats` / `daily_puzzle_stats` / `puzzle_snapshots` 等（见 `backend-go/internal/store/schema.go`）。进程**每次启动**会先谜题同步 + 无对局棋钟 pub `/stats` 补分，再按 `PUZZLE_SYNC_INTERVAL` / `GAMES_SYNC_INTERVAL` 轮询。可选：`WORKER_CONCURRENCY`, `PUZZLE_HTTP_TIMEOUT`, `RUN_ONCE=1`。对局归档：`SYNC_GAMES=1`；首次回溯近 N 天设 `GAMES_BACKFILL_ON_START=1`（`GAMES_BACKFILL_DAYS` 默认 90）；日常增量由 `GAMES_SYNC_INTERVAL`（默认 `10m`）与 `GAMES_INCREMENTAL_DAYS`（默认 2）控制。详见 `docs/TECH_DESIGN.md` §5。
- **前端 dev**：`npm run dev` 前会通过 **`predev`** 自动执行一次 `npm run pull-stats`（需 `web/.env.local` 的 `DATABASE_URL`）；跳过拉取用 `npm run dev:quick`。
- **Schema**：新环境在 MySQL 上执行 `mysql/migrations/*.sql`（或 `docker compose up` 时挂载到 MySQL 容器自动执行）。

## Database

- 表 `profiles`、`daily_game_stats`（含 `008_daily_game_stats_dashboard.sql` 日级对手均分/半回合/用时率）、`daily_puzzle_stats`（谜题分 + 累计/按日尝试通过失败用时，见 `011_puzzle_snapshots_and_daily.sql`）、`puzzle_snapshots`（每次 callback 拉取快照）、`games`（`daily_stats` 已在 `005_split_daily_stats.sql` 弃用）；排行榜视图见 `mysql/migrations/005_split_daily_stats.sql`。
- MySQL 无 Postgres RLS：通过数据库账号权限与应用逻辑控制访问。

## Conventions

- Match existing TypeScript / Go style; avoid drive-by refactors unrelated to the task.
- Chess.com API: respect rate limits (worker uses ~2 req/s globally via `golang.org/x/time/rate` and handles 429 with backoff).
- Prefer server-side data fetching for leaderboard; client components only where needed (e.g. Recharts).

## Onboarding and players

- **`/players/new`**：通过 **Server Action** 写入 `profiles`；需 **`DATABASE_URL`**。提交前请求 Chess.com `GET /pub/player/{username}` 校验存在并抓取 `avatar` / 展示名。
- **Debugging “Internal Server Error” while developing**
  - Watch the terminal where `npm run dev` runs: failed adds log `[addPlayer:…]` in development.
  - After editing `web/.env.local`, **restart** the dev server (env is read at startup).
  - **Dev-only HTTP API**：`POST /api/dev/add-player` with JSON `{ "chess_username": "erik" }` returns `{ ok, message }` without RSC — only when `NODE_ENV=development`.

## References

- Technical design: `docs/TECH_DESIGN.md`（附录 A 由 `node scripts/update-tech-design.mjs` 根据代码生成；变更路由、迁移或 Worker 配置后请运行并提交）
- Env template (no secrets): `.env.example`
