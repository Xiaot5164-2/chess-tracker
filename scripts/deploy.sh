#!/usr/bin/env bash
# 部署 / 重建 Docker 栈。
# 用法：
#   ./scripts/deploy.sh                    # 默认：MySQL + Worker + Web（docker-compose.yml）
#   ./scripts/deploy.sh --worker-only      # 仅 Worker，连外部库（docker-compose.worker.yml）
#   ./scripts/deploy.sh --no-build         # 不重建镜像，仅 up -d
#   ./scripts/deploy.sh --web-build        # 额外对 web/ 执行 npm run build（宿主机，供 Vercel 前自检）
# 需已安装 Docker Compose v2，且在仓库根目录执行（脚本会自行 cd 到根目录）。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WORKER_ONLY=0
NO_BUILD=0
WEB_BUILD=0

usage() {
	cat <<'EOF'
用法: ./scripts/deploy.sh [选项]
  （默认）     使用 docker-compose.yml：MySQL + Worker + Web
  --worker-only   仅 Worker（docker-compose.worker.yml，DATABASE_URL 见 backend-go/.env）
  --no-build      跳过镜像构建，仅 up -d
  --web-build     先对 web/ 执行生产构建（npm ci|install + npm run build）
  -h, --help      显示本说明
EOF
	exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--worker-only) WORKER_ONLY=1 ;;
	--local-db)
		echo "提示: --local-db 已弃用，默认即全栈（docker-compose.yml）。" >&2
		;;
	--no-build) NO_BUILD=1 ;;
	--web-build) WEB_BUILD=1 ;;
	-h | --help) usage 0 ;;
	*)
		echo "未知参数: $1" >&2
		usage 1
		;;
	esac
	shift
done

compose() {
	if [[ "$WORKER_ONLY" -eq 1 ]]; then
		docker compose -f docker-compose.worker.yml "$@"
	else
		docker compose "$@"
	fi
}

if [[ "$WEB_BUILD" -eq 1 ]]; then
	(
		cd "$ROOT/web"
		if [[ ! -d node_modules ]]; then
			npm ci
		else
			npm install
		fi
		npm run build
	)
fi

if [[ "$NO_BUILD" -eq 0 ]]; then
	if [[ "$WORKER_ONLY" -eq 1 ]]; then
		echo "==> docker compose build (worker)"
		compose build --no-cache worker
	else
		echo "==> docker compose build（mysql 官方镜像；构建 worker + web）"
		compose build --no-cache
	fi
fi

echo "==> docker compose up -d"
compose up -d

echo "==> 状态"
compose ps

if [[ "$WORKER_ONLY" -eq 1 ]]; then
	echo "完成。仅 Worker；前端请单独部署。"
else
	echo "完成。本地前端（docker-compose web）: http://localhost:${WEB_HOST_PORT:-8000}/"
fi
