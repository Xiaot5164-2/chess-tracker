#!/usr/bin/env bash
# 每日一次：仅拉 Chess.com 谜题 callback，写入 daily_puzzle_stats / puzzle_snapshots。
# 不读、不写 games 表，不重算 daily_game_stats，不调用 pub /stats 补棋钟分。
#
# 依赖 Worker 支持环境变量 PUZZLE_ONLY=1（见 backend-go/cmd/worker）。
#
# 用法：
#   ./scripts/daily-puzzle-sync.sh
#   DATABASE_URL='mysql://user:pass@host:3306/chess_tracker' ./scripts/daily-puzzle-sync.sh
#
# Cron 示例（UTC 每日 02:30）：
#   30 2 * * * cd /path/to/chess-tracker && ./scripts/daily-puzzle-sync.sh >>/var/log/chess-tracker-puzzle-daily.log 2>&1
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend-go"

# 命令行 / 外层 cron 传入的 DATABASE_URL 优先于 .env（避免 Docker 内 hostname `mysql` 在宿主机失效）
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
  exit 1
fi

export GOTOOLCHAIN="${GOTOOLCHAIN:-local}"
export PUZZLE_ONLY=1
export RUN_ONCE=1
export SYNC_GAMES=0

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) daily-puzzle-sync: PUZZLE_ONLY RUN_ONCE (no games)"
go run ./cmd/worker
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) daily-puzzle-sync: ok"
