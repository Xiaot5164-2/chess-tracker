# Project Checkmate（Chess Tracker）

面向 Chess.com 学员的 **对局排行榜**（Rapid / Blitz / Bullet）、**谜题榜** 与分数趋势；数据写入 **MySQL**，由 **Go Worker** 同步 Chess.com 公开接口。

## 功能概览

- **对局榜**：按时限查看排名、近 7/30/90 日涨跌与对局相关扩展列（依赖 `games` → `daily_game_stats`）。
- **谜题榜**：当前分、近 7/30 日涨跌与做题量、通过率等（`daily_puzzle_stats`）。
- **添加学生**：校验 Chess.com 用户名并写入 `profiles`。

## 仓库结构

| 目录 | 说明 |
|------|------|
| `web/` | Next.js 15 前端与 `app/api/*` 路由 |
| `backend-go/` | Worker（同步）与可选只读 HTTP `cmd/api` |
| `mysql/migrations/` | MySQL 8 建表与视图 |
| `docs/` | `API.md`、`TECH_DESIGN.md` 等 |
| `scripts/` | 迁移脚本、日常任务脚本 |

更细的约定与命令见 **[AGENTS.md](./AGENTS.md)**（面向开发与自动化助手）。

## 环境要求

- Node.js 20+（前端）
- Go 1.22+（Worker / API，以仓库 `go.mod` 为准）
- MySQL 8

## 快速开始

### 1. 数据库

在 MySQL 中创建库并执行 `mysql/migrations/` 下 SQL（按文件名顺序）。本地可用 Docker，参见 `docker-compose.yml` 与 `docker-compose.local-db.yml`。

### 2. 前端

```bash
cd web
cp ../.env.example .env.local   # 按需填写 DATABASE_URL 等
npm install
npm run dev
```

浏览器访问 `http://localhost:3000`；需配置 `web/.env.local` 中的 `DATABASE_URL`（`mysql://user:pass@host:3306/chess_tracker`）。

### 3. Worker（同步数据）

```bash
cd backend-go
GOTOOLCHAIN=local go build -o bin/worker ./cmd/worker
DATABASE_URL="mysql://..." ./bin/worker
```

**本地全栈（MySQL + Worker + 前端）**（仓库根目录；需已复制 `backend-go/.env`，可与 `.env.example` 对照）：

```bash
docker compose -f docker-compose.yml -f docker-compose.local-db.yml --profile local-db up -d --build
```

浏览器打开 **http://localhost:3000**；MySQL 映射宿主机 **3306**。仅 Worker：`docker compose up -d --build worker`。

### 4. 可选：Go 只读 API

```bash
cd backend-go
GOTOOLCHAIN=local go build -o bin/api ./cmd/api
DATABASE_URL="mysql://..." API_LISTEN=":8080" ./bin/api
```

接口说明见 **[docs/API.md](./docs/API.md)**。

## 常用命令（摘要）

| 场景 | 命令 |
|------|------|
| 前端构建 / 检查 | `cd web && npm run build && npm run lint && npm run test` |
| 生产冒烟 | `cd web && npm run smoke` |
| Worker 构建 | `cd backend-go && GOTOOLCHAIN=local go build -o bin/worker ./cmd/worker` |

完整列表与迁移、环境变量细节见 **AGENTS.md**。

## 前端容器（Docker / Cloud Run）

`web/Dockerfile` 使用 Next.js **`output: "standalone"`**，监听 **`PORT`**（镜像默认 **8080**，与 Cloud Run 一致）。

```bash
cd web
docker build -t chess-tracker-web:local .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL='mysql://user:pass@host:3306/chess_tracker' \
  chess-tracker-web:local
```

部署到 **Google Cloud Run** 时：将镜像推送到 Artifact Registry，在 Cloud Run 服务中设置 **`DATABASE_URL`**（建议用 Secret Manager），若数据库在 VPC 内则配置 **VPC connector**。Worker 需单独部署。

## 文档

- [docs/API.md](./docs/API.md) — HTTP API（Next 与可选 Go `/v1/*`）
- [docs/TECH_DESIGN.md](./docs/TECH_DESIGN.md) — 技术设计
- [AGENTS.md](./AGENTS.md) — 开发与 Agent 指南

## 安全说明

勿将真实数据库密码或连接串提交到 Git；使用 `.env.local`（已忽略）与托管平台的环境变量配置。
