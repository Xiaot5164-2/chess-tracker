// 根据 games 表内已存 PGN 重算 half_moves / time_budget_sec / avg_seconds_per_own_move。
// 用于 movetext 解析修正后回填历史行，无需重新请求 Chess.com API。
//
//	DATABASE_URL=mysql://... GOTOOLCHAIN=local go run ./cmd/repair-game-metrics
package main

import (
	"context"
	"log"
	"os"

	"chess-tracker/backend-go/internal/config"
	"chess-tracker/backend-go/internal/pgnmetrics"
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

	rows, err := st.DB().QueryContext(ctx, `
SELECT profile_id, chesscom_uuid, pgn, COALESCE(time_control, '') AS time_control, player_color
FROM games
WHERE pgn IS NOT NULL AND CHAR_LENGTH(TRIM(pgn)) > 0
`)
	if err != nil {
		log.Fatalf("query: %v", err)
	}
	defer rows.Close()

	var scanned, failed int
	for rows.Next() {
		var profileID, uuid, pgn, tc, playerColor string
		if err := rows.Scan(&profileID, &uuid, &pgn, &tc, &playerColor); err != nil {
			log.Fatalf("scan: %v", err)
		}
		scanned++
		hm, tb, tr := pgnmetrics.DashboardMetricNulls(pgn, tc, playerColor)
		_, err := st.DB().ExecContext(ctx, `
UPDATE games
SET half_moves = ?, time_budget_sec = ?, avg_seconds_per_own_move = ?
WHERE profile_id = ? AND chesscom_uuid = ?`,
			hm, tb, tr, profileID, uuid)
		if err != nil {
			failed++
			log.Printf("update %s: %v", uuid, err)
		}
	}
	if err := rows.Err(); err != nil {
		log.Fatalf("rows: %v", err)
	}
	log.Printf("repair-game-metrics: updated metrics for %d game rows (%d errors)", scanned, failed)
	if failed > 0 {
		os.Exit(1)
	}
}
