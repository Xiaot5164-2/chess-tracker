#!/usr/bin/env bash
# 每日一次：从 games 全量重算棋钟日统计 daily_game_stats（与 Worker 内 RefreshDailyGameStatsFromGames 一致）。
# 谜题日维度（daily_puzzle_stats / puzzle_snapshots）由常驻 Worker 的谜题 callback 写入；本脚本不拉 Chess.com。
#
# 用法：
#   cd scripts && ./daily-compute.sh
#   DATABASE_URL='mysql://user:pass@host:3306/chess_tracker' ./scripts/daily-compute.sh
#
# 可选：同日再跑一次 Worker 全量同步（拉谜题 + 可选对局增量），设环境变量：
#   DAILY_RUN_WORKER_ONCE=1 ./scripts/daily-compute.sh
#
# Cron 示例（UTC 每日 03:15；请把路径改成你的部署目录）：
#   15 3 * * * cd /path/to/chess-tracker && ./scripts/daily-compute.sh >>/var/log/chess-tracker-daily.log 2>&1
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend-go"

_PRESET_DBURL="${DATABASE_URL:-}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
if [[ -n "${_PRESET_DBURL}" ]]; then
  export DATABASE_URL="${_PRESET_DBURL}"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "错误：未设置 DATABASE_URL。" >&2
  echo "示例：export DATABASE_URL='mysql://user:pass@127.0.0.1:3306/chess_tracker'" >&2
  exit 1
fi

export GOTOOLCHAIN="${GOTOOLCHAIN:-local}"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) daily-compute: refresh-daily-game-stats"
go run ./cmd/refresh-daily-game-stats

if [[ "${DAILY_RUN_WORKER_ONCE:-0}" == "1" ]]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) daily-compute: RUN_ONCE worker (Chess.com 同步)"
  export RUN_ONCE=1
  go run ./cmd/worker
fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) daily-compute: ok"
