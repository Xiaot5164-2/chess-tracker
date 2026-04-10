package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	DatabaseURL            string
	DatabaseURLFallback    string
	PreferIPv6             bool
	IPv6Only               bool
	PollEvery              time.Duration
	Workers                int
	RunOnce                bool
	// PuzzleOnly 为 true 时：只拉谜题 callback、写 daily_puzzle_stats / puzzle_snapshots；不写 games、不 pub /stats、不跑棋钟日统计补分。
	PuzzleOnly             bool
	PuzzleSyncEvery        time.Duration
	PuzzleHTTPTimeout      time.Duration
	SyncGames              bool
	GamesBackfillDays      int
	GamesBackfillOnStart   bool
	GamesSyncEvery       time.Duration
	GamesIncrementalDays int // 定时增量：只拉取与 [now−N 天, now] 相交的月度归档内、且 end_time 在此窗口内的对局；默认 2
	// DailyGameStatsLookbackDays 保留读入以兼容环境变量；RefreshDailyGameStatsFromGames 当前忽略（自首盘棋日至今日全量重建）
	DailyGameStatsLookbackDays int
}

func Load() (Config, error) {
	db := os.Getenv("DATABASE_URL")
	if db == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	fallback := os.Getenv("DATABASE_URL_FALLBACK")
	// 默认优先 IPv6；仅 IPv4 网络设 DATABASE_PREFER_IPV4=1
	preferV4 := os.Getenv("DATABASE_PREFER_IPV4") == "1" || os.Getenv("DATABASE_PREFER_IPV4") == "true"
	preferV6 := !preferV4
	ipv6Only := os.Getenv("DATABASE_IPV6_ONLY") == "1" || os.Getenv("DATABASE_IPV6_ONLY") == "true"

	poll := 1 * time.Hour
	if v := os.Getenv("POLL_INTERVAL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return Config{}, fmt.Errorf("POLL_INTERVAL: %w", err)
		}
		poll = d
	}

	workers := 2
	if v := os.Getenv("WORKER_CONCURRENCY"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return Config{}, fmt.Errorf("WORKER_CONCURRENCY must be a positive integer")
		}
		workers = n
	}

	runOnce := os.Getenv("RUN_ONCE") == "1" || os.Getenv("RUN_ONCE") == "true"

	puzzleOnly := os.Getenv("PUZZLE_ONLY") == "1" || os.Getenv("PUZZLE_ONLY") == "true"

	puzzleEvery := 10 * time.Minute
	if v := os.Getenv("PUZZLE_SYNC_INTERVAL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return Config{}, fmt.Errorf("PUZZLE_SYNC_INTERVAL: %w", err)
		}
		puzzleEvery = d
	}

	puzzleHTTP := 12 * time.Second
	if v := os.Getenv("PUZZLE_HTTP_TIMEOUT"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return Config{}, fmt.Errorf("PUZZLE_HTTP_TIMEOUT: %w", err)
		}
		puzzleHTTP = d
	}

	syncGames := os.Getenv("SYNC_GAMES") == "1" || os.Getenv("SYNC_GAMES") == "true"

	gamesBackfillDays := 90
	if v := os.Getenv("GAMES_BACKFILL_DAYS"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return Config{}, fmt.Errorf("GAMES_BACKFILL_DAYS must be a positive integer")
		}
		gamesBackfillDays = n
	}

	gamesBackfillOnStart := os.Getenv("GAMES_BACKFILL_ON_START") == "1" || os.Getenv("GAMES_BACKFILL_ON_START") == "true"

	gamesSyncEvery := 10 * time.Minute
	if v := os.Getenv("GAMES_SYNC_INTERVAL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return Config{}, fmt.Errorf("GAMES_SYNC_INTERVAL: %w", err)
		}
		gamesSyncEvery = d
	}

	gamesIncrementalDays := 2
	if v := os.Getenv("GAMES_INCREMENTAL_DAYS"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return Config{}, fmt.Errorf("GAMES_INCREMENTAL_DAYS must be a positive integer")
		}
		gamesIncrementalDays = n
	}

	dailyGameLookback := 120
	if v := os.Getenv("DAILY_GAME_STATS_LOOKBACK_DAYS"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return Config{}, fmt.Errorf("DAILY_GAME_STATS_LOOKBACK_DAYS must be a positive integer")
		}
		dailyGameLookback = n
	}

	return Config{
		DatabaseURL:            db,
		DatabaseURLFallback:    fallback,
		PreferIPv6:             preferV6,
		IPv6Only:               ipv6Only,
		PollEvery:              poll,
		Workers:                workers,
		RunOnce:                runOnce,
		PuzzleOnly:             puzzleOnly,
		PuzzleSyncEvery:        puzzleEvery,
		PuzzleHTTPTimeout:      puzzleHTTP,
		SyncGames:              syncGames,
		GamesBackfillDays:      gamesBackfillDays,
		GamesBackfillOnStart:   gamesBackfillOnStart,
		GamesSyncEvery:       gamesSyncEvery,
		GamesIncrementalDays: gamesIncrementalDays,
		DailyGameStatsLookbackDays: dailyGameLookback,
	}, nil
}
