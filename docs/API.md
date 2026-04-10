# HTTP API 说明

## 架构说明

| 组件 | 语言 | 角色 |
|------|------|------|
| **Next.js `web/`** | TypeScript | 提供本页 **「Next API」**（App Router `app/api/**/route.ts`），读写 MySQL、供前端调用。 |
| **`backend-go/cmd/worker`** | Go | **Worker**：同步 Chess.com 谜题/对局、写入 `daily_*` / `games` 等表。 |
| **`backend-go/cmd/api`** | Go | **可选只读 HTTP 服务**：直连 MySQL，提供对局榜与**谜题独立榜** JSON（与 Next 并行）。 |

数据仍由 **Worker 写入**，Next 与 Go API **均为读库**（`dev/add-player` 等写操作仅在 Next）。

---

## 基础信息

- **Base URL（本地开发）**：`http://localhost:3000`（以实际 `next dev` / 部署域名为准）
- **数据格式**：`application/json`（除特别说明）
- **认证**：当前路由均为应用内使用，**无独立 Bearer / Session**；生产环境请通过部署侧网络策略、禁用 dev 接口等方式限制访问。

---

## 接口列表

### 1. 健康检查

确认 Node 进程与路由栈可用，**不连接数据库**。

| 项目 | 说明 |
|------|------|
| **Method / Path** | `GET /api/health` |
| **Query** | 无 |
| **成功响应** | `200`，Body：`{ "ok": true }` |

**示例**

```bash
curl -sS http://localhost:3000/api/health
```

---

### 2. 排行榜数据

从 MySQL 读取排行榜所需聚合数据（与页面 `LeaderboardClient` 使用同一套逻辑）。

| 项目 | 说明 |
|------|------|
| **Method / Path** | `GET /api/leaderboard` |
| **Query** | 见下表 |
| **环境** | 需要服务端配置 `DATABASE_URL`（MySQL） |

**Query 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `period` | `7` \| `30` \| `90` | 否 | 统计窗口（天），默认按业务解析（与 `parseLeaderboardPeriod` 一致，缺省多为 7） |
| `timeControl` | 字符串 | 否 | `rapid` \| `blitz` \| `bullet` \| `puzzle`（对局榜建议只用前三项；**谜题**请用下方 **`/api/leaderboard/puzzles`**），默认 `rapid` |

**成功响应** | `200`

Body 为 JSON，成功时 **`ok: true`**，主要字段包括：

| 字段 | 说明 |
|------|------|
| `timeControl` | 对局（时限）或谜题类型 |
| `periodDays` | `7` \| `30` \| `90` |
| `tcLabel` | 展示用标签（如 Rapid） |
| `scoreColumnLabel` | 分数字段列标题 |
| `showGamePeriodCols` | 是否展示对局相关扩展列 |
| `snapLabel` | 快照「最近更新」展示文案（可能为 `null`）；对应库中该对局分项/谜题**最新 `stat_date` 当日**所有棋手行 `computed_at` 的**最小值**（UTC 存库，前端按新加坡时区格式化） |
| `snapInstantIso` | 同上时刻的 ISO 字符串（可能为 `null`） |
| `rows` | 排行榜行数组（棋手、分、涨跌、盘数、得分率、对手/回合/用时率等，与前端 `LeaderboardRowModel` 一致） |

**错误响应**

| HTTP | 条件 | Body 概要 |
|------|------|-----------|
| `503` | 未配置 `DATABASE_URL` | `{ ok: false, error, code: "pool" }` |
| `500` | 查库失败等 | `{ ok: false, error, code }`，`code` 可能为 `pool` / `fatal` 等 |

**示例**

```bash
curl -sS "http://localhost:3000/api/leaderboard?period=7&timeControl=rapid"
```

---

### 2b. 谜题榜（独立，无 period）

与对局榜分离：**无「近 7/30/90 日」参数**。每位棋手取 `daily_puzzle_stats` 中 **最新 `stat_date`** 一行上的累计字段，计算通过率、平均每题用时。

| 项目 | 说明 |
|------|------|
| **Method / Path** | `GET /api/leaderboard/puzzles` |
| **Query** | 无 |
| **环境** | 需要 `DATABASE_URL` |

**成功** `200`，`ok: true` 时主要字段：

| 字段 | 说明 |
|------|------|
| `snapLabel` / `snapInstantIso` | 与谜题日表相关的快照时间（同对局榜快照语义，仅谜题表） |
| `rows` | `profile_id`、`chess_username`、`display_name`、`avatar_url`、`rating`（当前分）、`attempts`（累计做题）、`passRatePct`、`avgSecondsPerAttempt`；**`ratingDelta7` / `ratingDelta30`**（相对各自「当前日 stat_date」往前第 7 / 30 个 UTC 日历日及以前最近一行分之差）；**`attemptsLast7Days` / `attemptsLast30Days`**（当前日往回共 7 / 30 个 UTC 日内 `attempts` 日列之和） |

```bash
curl -sS "http://localhost:3000/api/leaderboard/puzzles"
```

---

### 3. 开发环境：添加学生（调试用）

与「添加学生」Server Action 共用 `addPlayerCore`，仅 **`NODE_ENV=development`** 时可用。

| 项目 | 说明 |
|------|------|
| **Method / Path** | `POST /api/dev/add-player` |
| **Header** | `Content-Type: application/json` |
| **Body** | JSON，见下表 |

**Body 字段**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `chess_username` | string | 是 | Chess.com 用户名 |
| `display_name` | string | 否 | 展示名 |

**成功 / 业务失败**

| HTTP | 说明 |
|------|------|
| `200` | `addPlayerCore` 返回 `ok: true` |
| `422` | 校验或业务失败（如用户名无效），Body 为 `addPlayerCore` 结果 |
| `404` | 非 development 环境（伪装为 Not found） |
| `500` | 未捕获异常 |

**示例**

```bash
curl -sS -X POST http://localhost:3000/api/dev/add-player \
  -H "Content-Type: application/json" \
  -d '{"chess_username":"erik"}'
```

---

## Go HTTP API（`cmd/api`）

独立进程，需配置与 Worker 相同的 **`DATABASE_URL`**（MySQL）。监听地址由环境变量 **`API_LISTEN`** 控制，默认 **`:8080`**。

**构建与运行**

```bash
cd backend-go
GOTOOLCHAIN=local go build -o bin/api ./cmd/api
DATABASE_URL='mysql://...' API_LISTEN=':8080' ./bin/api
```

### `GET /health`

进程存活检查，**不访问数据库**。

- **响应**：`200`，`{ "ok": true }`

### `GET /v1/ready`

就绪探针，对数据库执行 **`Ping`**。

- **成功**：`200`，`{ "ok": true }`
- **失败**：`503`，`{ "ok": false, "error": "..." }`

### `GET /v1/leaderboard`

只读排行榜 JSON，语义与 **`GET /api/leaderboard`** 对齐（由 `internal/leaderboardjson.Build` 生成）。

**Query 参数**（与 Next 一致）

| 参数 | 说明 |
|------|------|
| `period` | `7` \| `30` \| `90`（天），缺省逻辑与 Next `parseLeaderboardPeriod` 一致 |
| `timeControl` | `rapid` \| `blitz` \| `bullet` \| `puzzle`，默认 `rapid` |

**成功**：`200`，Body 与 Next 成功载荷相同（`ok: true`、 `rows`、`periodDays`、`timeControl` 等）。

**失败**：`500`，`{ "ok": false, "error": "...", "code": "build" }`

**示例**

```bash
curl -sS "http://localhost:8080/v1/leaderboard?period=7&timeControl=rapid"
```

### `GET /v1/leaderboard/puzzles`

与 **`GET /api/leaderboard/puzzles`** 语义一致（`internal/leaderboardjson.BuildPuzzlePayload`），无 Query。

```bash
curl -sS "http://localhost:8080/v1/leaderboard/puzzles"
```

---

## 与 Go Worker 的关系

- Worker 直接连 MySQL，更新 `games`、`daily_game_stats`、`daily_puzzle_stats` 等。
- Next 与 Go **`/v1/leaderboard`** 均**只读**上述数据；聚合逻辑在 TS 与 Go 中分别实现，字段应对齐。

---

## 变更记录

- Next 路由：随 `web/app/api/` 维护。
- Go API：随 `backend-go/cmd/api`、`internal/apihttp`、`internal/leaderboardjson` 维护。
