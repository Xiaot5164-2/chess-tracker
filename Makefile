# 本地全栈：MySQL + Worker + Next（http://localhost:3000）
.PHONY: up down logs ps build worker-only
up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

build:
	docker compose build --no-cache

# 仅 Worker，连外部库（见 docker-compose.worker.yml）
worker-only:
	docker compose -f docker-compose.worker.yml up -d --build
