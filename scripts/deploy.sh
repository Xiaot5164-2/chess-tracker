#!/usr/bin/env bash
# 部署 / 重建 Docker 栈中的 Go Worker（可选带本地 MySQL）。
# 用法：
#   ./scripts/deploy.sh                    # 仅 worker（DATABASE_URL 来自 backend-go/.env）
#   ./scripts/deploy.sh --local-db         # 合并 local-db：起 mysql + worker（库内主机名 mysql）
#   ./scripts/deploy.sh --no-build         # 不重建镜像，仅 up -d
#   ./scripts/deploy.sh --web-build        # 额外执行 web 生产构建（供 Vercel 前自检）
# 需已安装 Docker Compose v2，且在仓库根目录执行（脚本会自行 cd 到根目录）。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOCAL_DB=0
NO_BUILD=0
WEB_BUILD=0

usage() {
	cat <<'EOF'
用法: ./scripts/deploy.sh [选项]
  --local-db   合并 docker-compose.local-db.yml 并启用 profile local-db（mysql + worker）
  --no-build   跳过镜像构建，仅 up -d
  --web-build  先对 web/ 执行生产构建（npm ci|install + npm run build）
  -h, --help   显示本说明
EOF
	exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--local-db) LOCAL_DB=1 ;;
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
	if [[ "$LOCAL_DB" -eq 1 ]]; then
		docker compose -f docker-compose.yml -f docker-compose.local-db.yml --profile local-db "$@"
	else
		docker compose -f docker-compose.yml "$@"
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
	echo "==> docker compose build (worker)"
	compose build --no-cache worker
fi

echo "==> docker compose up -d"
compose up -d worker

echo "==> 状态"
compose ps

echo "完成。Next.js 前端请单独部署（如 Vercel），或本地: cd web && npm run start（需先 npm run build）。"
