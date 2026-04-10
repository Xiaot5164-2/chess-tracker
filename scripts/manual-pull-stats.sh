#!/usr/bin/env bash
# 手动拉取：遍历 profiles，从 Chess.com 拉取分数并 upsert 到 daily_stats（等同 RUN_ONCE=1 的 Worker）。
# 依赖：DATABASE_URL 指向已应用 mysql/migrations 的 MySQL。
# 也可在 web/ 执行：npm run pull-stats（使用 web/.env.local 的 DATABASE_URL）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend-go"

# Repo root .env (optional), then backend-go/.env — latter wins.
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

export RUN_ONCE=1

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "错误：未设置 DATABASE_URL。" >&2
  echo "使用 MySQL 连接串，例如 mysql://user:pass@127.0.0.1:3306/chess_tracker" >&2
  echo "写入 backend-go/.env（可复制 backend-go/.env.example），或仓库根目录 .env，或执行：" >&2
  echo "  export DATABASE_URL='mysql://...'" >&2
  exit 1
fi

exec go run ./cmd/worker
