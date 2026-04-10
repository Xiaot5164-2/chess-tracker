package main

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"chess-tracker/backend-go/internal/chesscom"
	"chess-tracker/backend-go/internal/config"
	"chess-tracker/backend-go/internal/pgnmetrics"
	"chess-tracker/backend-go/internal/store"
)

func runGamesSyncLoop(ctx context.Context, st *store.Store, client *chesscom.Client, cfg config.Config) {
	if !cfg.GamesBackfillOnStart {
		log.Printf("games: incremental sync (initial, last %d day(s) of archives + daily_game_stats refresh)", cfg.GamesIncrementalDays)
		if err := syncGamesIncremental(ctx, st, client, cfg); err != nil {
			log.Printf("games incremental: %v", err)
		}
	}
	tick := time.NewTicker(cfg.GamesSyncEvery)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			log.Printf("games: incremental sync (last %d day(s) + daily_game_stats refresh)", cfg.GamesIncrementalDays)
			if err := syncGamesIncremental(ctx, st, client, cfg); err != nil {
				log.Printf("games incremental: %v", err)
			}
		}
	}
}

func syncGamesBackfill(ctx context.Context, st *store.Store, client *chesscom.Client, cfg config.Config) error {
	log.Printf("games: backfill archives overlapping last %d day(s)", cfg.GamesBackfillDays)
	cutoff := time.Now().UTC().AddDate(0, 0, -cfg.GamesBackfillDays)
	return syncGamesWithPicker(ctx, st, client, cfg, &cutoff, func(archives []string, c config.Config) []string {
		return chesscom.FilterArchivesOverlappingLastDays(archives, c.GamesBackfillDays)
	})
}

func syncGamesIncremental(ctx context.Context, st *store.Store, client *chesscom.Client, cfg config.Config) error {
	days := cfg.GamesIncrementalDays
	if days < 1 {
		days = 1
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -days)
	return syncGamesWithPicker(ctx, st, client, cfg, &cutoff, func(archives []string, c config.Config) []string {
		d := c.GamesIncrementalDays
		if d < 1 {
			d = 1
		}
		return chesscom.FilterArchivesOverlappingLastDays(archives, d)
	})
}

func syncGamesWithPicker(
	ctx context.Context,
	st *store.Store,
	client *chesscom.Client,
	cfg config.Config,
	cutoff *time.Time,
	pick func([]string, config.Config) []string,
) error {
	profiles, err := st.ListProfiles(ctx)
	if err != nil {
		return err
	}
	if len(profiles) == 0 {
		log.Println("games: no profiles")
		return nil
	}

	workers := cfg.Workers
	if workers < 1 {
		workers = 2
	}

	jobs := make(chan store.Profile)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for p := range jobs {
				if err := syncGamesOneProfile(ctx, st, client, cfg, p, cutoff, pick); err != nil {
					log.Printf("games %s: %v", p.ChessUsername, err)
				}
			}
		}()
	}

	for _, p := range profiles {
		select {
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return ctx.Err()
		case jobs <- p:
		}
	}
	close(jobs)
	wg.Wait()
	log.Printf("games sync finished for %d profiles", len(profiles))
	if err := st.RefreshDailyGameStatsFromGames(ctx, cfg.DailyGameStatsLookbackDays); err != nil {
		log.Printf("daily_game_stats refresh: %v", err)
	} else {
		log.Printf("daily_game_stats refreshed (full rebuild from games: first-game date → UTC today per profile/time_class)")
		if err := st.SeedDailyGameStatsWhenNoGames(ctx, client); err != nil {
			log.Printf("daily_game_stats pub fallback: %v", err)
		}
	}
	return nil
}

func syncGamesOneProfile(
	ctx context.Context,
	st *store.Store,
	client *chesscom.Client,
	cfg config.Config,
	p store.Profile,
	cutoff *time.Time,
	pick func([]string, config.Config) []string,
) error {
	archives, err := client.FetchGameArchiveURLs(ctx, p.ChessUsername)
	if err != nil {
		return err
	}
	monthURLs := pick(archives, cfg)
	if len(monthURLs) == 0 {
		return nil
	}
	return syncGamesForMonths(ctx, st, client, p, monthURLs, cutoff)
}

func syncGamesForMonths(
	ctx context.Context,
	st *store.Store,
	client *chesscom.Client,
	p store.Profile,
	monthURLs []string,
	cutoff *time.Time,
) error {
	for _, u := range monthURLs {
		games, err := client.FetchGamesForMonthURL(ctx, u)
		if err != nil {
			return err
		}
		for _, g := range games {
			end := chesscom.EndTimeUTC(g)
			if cutoff != nil && (end.IsZero() || end.Before(*cutoff)) {
				continue
			}
			row, ok := buildChesscomGame(g, p.ChessUsername)
			if !ok {
				continue
			}
			if err := st.UpsertChesscomGame(ctx, p.ID, row); err != nil {
				return err
			}
		}
	}
	return nil
}

func buildChesscomGame(g chesscom.FinishedGame, profileChess string) (store.ChesscomGame, bool) {
	uid := chesscom.GameID(g)
	if uid == "" {
		return store.ChesscomGame{}, false
	}
	color := chesscom.PlayerColor(g, profileChess)
	if color == "" {
		return store.ChesscomGame{}, false
	}
	url := strings.TrimSpace(g.URL)
	if url == "" {
		url = "https://www.chess.com/game/unknown"
	}
	url = truncateUTF8(url, 768)

	row := store.ChesscomGame{
		ChesscomUUID:  truncateUTF8(uid, 64),
		GameURL:       url,
		PGN:           g.PGN,
		TimeControl:   store.NullString(g.TimeControl),
		EndTime:       store.EndTimeNull(g.EndTime),
		Rated:         g.Rated,
		TimeClass:     store.NullString(g.TimeClass),
		Rules:         store.NullString(g.Rules),
		WhiteUsername: strings.TrimSpace(g.White.Username),
		BlackUsername: strings.TrimSpace(g.Black.Username),
		WhiteRating:   store.NullInt32FromPtr(g.White.Rating),
		BlackRating:   store.NullInt32FromPtr(g.Black.Rating),
		WhiteResult:   store.NullString(g.White.Result),
		BlackResult:   store.NullString(g.Black.Result),
		PlayerColor:   color,
		PlayerResult:  store.NullString(chesscom.PlayerResult(g, profileChess)),
		TCN:           store.NullString(truncateUTF8(g.TCN, 2048)),
		FEN:           store.NullString(g.Fen),
		InitialSetup:  store.NullString(truncateUTF8(g.InitialSetup, 512)),
		EcoURL:        store.NullString(truncateUTF8(g.Eco, 1024)),
	}
	if row.WhiteUsername == "" {
		row.WhiteUsername = "unknown"
	}
	if row.BlackUsername == "" {
		row.BlackUsername = "unknown"
	}
	if color == "white" {
		row.PlayerRating = row.WhiteRating
	} else {
		row.PlayerRating = row.BlackRating
	}
	if g.Accuracies != nil {
		row.AccuracyWhite = store.NullFloat64FromPtr(g.Accuracies.White)
		row.AccuracyBlack = store.NullFloat64FromPtr(g.Accuracies.Black)
	}
	row.HalfMoves, row.TimeBudgetSec, row.AvgSecondsPerOwnMove = pgnmetrics.DashboardMetricNulls(g.PGN, g.TimeControl, color)
	return row, true
}

func truncateUTF8(s string, maxBytes int) string {
	if maxBytes <= 0 || len(s) <= maxBytes {
		return s
	}
	s = s[:maxBytes]
	for len(s) > 0 && !utf8.ValidString(s) {
		s = s[:len(s)-1]
	}
	return s
}
