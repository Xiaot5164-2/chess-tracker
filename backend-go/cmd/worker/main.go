package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"chess-tracker/backend-go/internal/chesscom"
	"chess-tracker/backend-go/internal/config"
	"chess-tracker/backend-go/internal/store"
)

const chessAPIQPS = 2.0

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, cleanup, err := store.Connect(ctx, cfg.DatabaseURL, cfg.DatabaseURLFallback, cfg.PreferIPv6, cfg.IPv6Only)
	if err != nil {
		log.Printf("database: %v", err)
		// 避免 Docker restart=unless-stopped 时连接失败刷满日志
		time.Sleep(15 * time.Second)
		os.Exit(1)
	}
	if err := st.VerifyMySQLSchemaRequired(ctx); err != nil {
		cleanup()
		log.Fatalf("mysql migration: %v", err)
	}
	defer cleanup()

	log.Println("worker: schema OK (daily_puzzle_stats, puzzle_snapshots, daily_game_stats; deprecated table daily_stats was removed in migration 005)")

	client := chesscom.NewClient(chessAPIQPS)
	puzzleClient := chesscom.NewPuzzleCallbackClient(cfg.PuzzleHTTPTimeout)

	if cfg.PuzzleOnly {
		log.Println("pull: PUZZLE_ONLY — 仅谜题 callback（daily_puzzle_stats / puzzle_snapshots），不碰 games / daily_game_stats")
		syncPuzzleCurrentOnce(ctx, st, puzzleClient, cfg.PuzzleHTTPTimeout)
	} else {
		// 谜题 callback；棋钟以 games→daily_game_stats 为主，无对局棋钟再 pub /stats 补当日分。
		log.Println("pull: startup (puzzle current; daily_game_stats + optional pub /stats when no games)")
		syncPuzzleCurrentOnce(ctx, st, puzzleClient, cfg.PuzzleHTTPTimeout)
		if err := st.SeedDailyGameStatsWhenNoGames(ctx, client); err != nil {
			log.Printf("daily_game_stats pub fallback: %v", err)
		}
	}

	if !cfg.PuzzleOnly && cfg.SyncGames && cfg.GamesBackfillOnStart {
		if err := syncGamesBackfill(ctx, st, client, cfg); err != nil {
			log.Printf("games backfill: %v", err)
		}
	}

	if cfg.RunOnce {
		if !cfg.PuzzleOnly && cfg.SyncGames && !cfg.GamesBackfillOnStart {
			if err := syncGamesIncremental(ctx, st, client, cfg); err != nil {
				log.Printf("games incremental: %v", err)
			}
		}
		return
	}

	go runPuzzleSyncLoop(ctx, st, puzzleClient, cfg)
	if cfg.SyncGames && !cfg.PuzzleOnly {
		go runGamesSyncLoop(ctx, st, client, cfg)
	}

	<-ctx.Done()
	log.Println("shutting down")
}

func runPuzzleSyncLoop(ctx context.Context, st *store.Store, puzzleClient *chesscom.PuzzleCallbackClient, cfg config.Config) {
	tick := time.NewTicker(cfg.PuzzleSyncEvery)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			syncPuzzleCurrentOnce(ctx, st, puzzleClient, cfg.PuzzleHTTPTimeout)
		}
	}
}

func syncPuzzleCurrentOnce(ctx context.Context, st *store.Store, puzzleClient *chesscom.PuzzleCallbackClient, perRequest time.Duration) {
	profiles, err := st.ListProfiles(ctx)
	if err != nil {
		log.Printf("puzzle sync: list profiles: %v", err)
		return
	}
	if len(profiles) == 0 {
		return
	}
	for _, p := range profiles {
		reqCtx, cancel := context.WithTimeout(ctx, perRequest)
		snap, err := puzzleClient.FetchPuzzleCallbackStats(reqCtx, p.ChessUsername)
		cancel()
		if err != nil {
			log.Printf("puzzle callback %s: %v", p.ChessUsername, err)
			time.Sleep(400 * time.Millisecond)
			continue
		}
		if snap == nil {
			log.Printf("puzzle callback %s: no rating in JSON", p.ChessUsername)
			time.Sleep(400 * time.Millisecond)
			continue
		}
		if err := st.ApplyPuzzleCallbackSync(ctx, p.ID, time.Now().UTC(), snap); err != nil {
			log.Printf("puzzle sync %s: db %v", p.ChessUsername, err)
		}
		time.Sleep(400 * time.Millisecond)
	}
	log.Printf("puzzle current sync finished for %d profiles", len(profiles))
}
