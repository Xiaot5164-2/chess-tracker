// 从 games 全量重建 daily_game_stats（与 Worker 每轮 games 同步后逻辑一致）。
// 在应用 `008_daily_game_stats_dashboard.sql` 等迁移后执行一次即可。
//
//	DATABASE_URL=mysql://... GOTOOLCHAIN=local go run ./cmd/refresh-daily-game-stats
package main

import (
	"context"
	"log"
	"os"

	"chess-tracker/backend-go/internal/config"
	"chess-tracker/backend-go/internal/store"
)

func main() {
	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	st, cleanup, err := store.Connect(ctx, cfg.DatabaseURL, cfg.DatabaseURLFallback, cfg.PreferIPv6, cfg.IPv6Only)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer cleanup()
	if err := st.VerifyMySQLSchemaRequired(ctx); err != nil {
		log.Fatalf("mysql migration: %v", err)
	}
	if err := st.RefreshDailyGameStatsFromGames(ctx, 0); err != nil {
		log.Fatalf("refresh: %v", err)
	}
	log.Println("refresh-daily-game-stats: ok")
	os.Exit(0)
}
