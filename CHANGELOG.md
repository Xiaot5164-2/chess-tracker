# Changelog

本文件记录 **Chess Tracker** 仓库中值得注意的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

（尚无可写条目；下次发版前在此累积变更，再并入新版本节。）

## [1.0.0] - 2026-04-14

首个对外标注为 **稳定版（1.x）** 的版本；前端 npm 包版本与 `web/package.json` 对齐为 `1.0.0`。

### Added

- Docker Compose：`web` 服务增加 `develop.watch`，在 `web/` 下保存源码后可触发镜像重建；`web/package.json` 增加脚本 `npm run docker:watch`（等价于对根目录 compose 执行 `watch web`）。
- 谜题榜涨跌：导出 `puzzleRatingBaselineWithSparseFallback`（TS）；单测 `web/lib/leaderboard/puzzle-rating-baseline.test.ts`；在配置好 `DATABASE_URL`（或可读 `web/.env.local`）时的集成测试 `get-puzzle-leaderboard-payload.integration.test.ts`；Go 侧 `puzzles_payload_test.go`。
- 根目录 `.env.example`：补充 `WEB_HOST_PORT` 说明（Docker 映射宿主端口，默认建议 `8000`）。

### Changed

- **品牌**：界面与文档中 **Project Checkmate** 统一更名为 **Chess Tracker**（含 `web/app/layout.tsx` 标题、`site-header`、`README.md`、`agents.md`、`docs/TECH_DESIGN.md` 等）。
- **首页**：根路径 `/` 服务端重定向至 Rapid 对局榜 `/leaderboard`；`web/scripts/smoke.cjs` 对 `/` 跟随 3xx 重定向后再校验状态码。
- **添加学生**：`profiles` 插入成功后立即返回成功信息；对局/谜题后续同步通过 `next/server` 的 `after()` 在后台执行；添加页去掉两段说明性副文案；`web/app/players/new/layout.tsx` 移除顶部注释（`maxDuration` 仍保留）。
- **谜题榜**：移除页头关于 Chess.com 谜题指标的长说明；历史 `daily_puzzle_stats` 查询改为按每位棋手自身 `MAX(stat_date)` 回溯窗口；分数字段使用 `COALESCE(rating_day_end, rating_day_start)`；近 7/30 日涨跌在日历锚点无行时，回退为 **早于 `endDate` 的最早一日分** 作基线（短历史时仍可显示涨跌）。
- **身份键**：`normProfileId`（TS）与 `normProfileID`（Go）对 Buffer/字符串做 **trim**，避免 MySQL `CHAR(36)` 尾空格导致 Map 键不一致。
- **生产构建指纹**：`web/.next/` 下指纹文件名由 `project-checkmate-fingerprint.json` 改为 `chess-tracker-fingerprint.json`（`write-build-fingerprint.cjs` / `assert-build-fingerprint.cjs`）。
- **Docker `web` 端口**：compose 使用 `${WEB_HOST_PORT:-8000}:8080`，默认 **8000**，减少与本机 `ssh -R …:80` 等占用 80 端口的冲突；注释说明线上可设 `WEB_HOST_PORT=80` 或由反代监听 80/443。
- **`scripts/deploy.sh`**：完成提示中的访问地址随 `WEB_HOST_PORT` 默认值展示。

### Fixed

- 谜题榜「近 7 / 近 30 日分数涨跌」在多种真实数据形态下长期为空（「—」）的问题（窗口裁剪、`rating_day_end` 为空、日表跨度不足等）。
