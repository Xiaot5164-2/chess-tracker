package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"

	"chess-tracker/backend-go/internal/chesscom"
)

type prevPuzzleCum struct {
	attempts int64
	passed   int64
	failed   int64
	seconds  int64
}

func nonnegDelta(curr, prev int64) int64 {
	d := curr - prev
	if d < 0 {
		return 0
	}
	return d
}

// loadPrevDayCumulative 用于计算「当日」增量：优先前一日 daily 行末累计；否则取当日 0 点前的最近一条 puzzle_snapshots。
func (s *Store) loadPrevDayCumulative(ctx context.Context, pid string, todayStartUTC time.Time) (*prevPuzzleCum, error) {
	yesterday := todayStartUTC.AddDate(0, 0, -1)
	var a, p, f, sec sql.NullInt64
	err := s.db.QueryRowContext(ctx,
		`SELECT cum_attempts, cum_passed, cum_failed, cum_total_seconds
		 FROM daily_puzzle_stats
		 WHERE profile_id = ? AND stat_date = ?`,
		pid, yesterday,
	).Scan(&a, &p, &f, &sec)
	if err == nil && a.Valid && p.Valid && f.Valid && sec.Valid {
		return &prevPuzzleCum{a.Int64, p.Int64, f.Int64, sec.Int64}, nil
	}
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	err = s.db.QueryRowContext(ctx,
		`SELECT attempt_count, passed_count, failed_count, total_seconds
		 FROM puzzle_snapshots
		 WHERE profile_id = ? AND fetched_at < ?
		 ORDER BY fetched_at DESC LIMIT 1`,
		pid, todayStartUTC,
	).Scan(&a, &p, &f, &sec)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if a.Valid && p.Valid && f.Valid && sec.Valid {
		return &prevPuzzleCum{a.Int64, p.Int64, f.Int64, sec.Int64}, nil
	}
	return nil, nil
}

// ApplyPuzzleCallbackSync 写入 puzzle_snapshots 并 upsert daily_puzzle_stats（含累计与按日差分）。
func (s *Store) ApplyPuzzleCallbackSync(ctx context.Context, profileID uuid.UUID, nowUTC time.Time, snap *chesscom.PuzzleCallbackStats) error {
	if snap == nil {
		return nil
	}
	pid := profileID.String()
	y, m, d := nowUTC.UTC().Date()
	statDate := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)

	prevCum, err := s.loadPrevDayCumulative(ctx, pid, statDate)
	if err != nil {
		return err
	}
	if err := s.InsertPuzzleSnapshot(ctx, profileID, snap); err != nil {
		return err
	}

	var prevRating sql.NullInt64
	err = s.db.QueryRowContext(ctx,
		`SELECT rating_day_end FROM daily_puzzle_stats
		 WHERE profile_id = ? AND stat_date = DATE_SUB(?, INTERVAL 1 DAY)`,
		pid, statDate,
	).Scan(&prevRating)
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("read prev puzzle rating day: %w", err)
	}
	start := snap.Rating
	if prevRating.Valid {
		start = int(prevRating.Int64)
	}

	var attempts, passed, failed, sec interface{}
	if prevCum != nil {
		attempts = int(nonnegDelta(int64(snap.AttemptCount), prevCum.attempts))
		passed = int(nonnegDelta(int64(snap.PassedCount), prevCum.passed))
		failed = int(nonnegDelta(int64(snap.FailedCount), prevCum.failed))
		sec = nonnegDelta(snap.TotalSeconds, prevCum.seconds)
	}

	const q = `
INSERT INTO daily_puzzle_stats (
  profile_id, stat_date,
  rating_day_start, rating_day_end,
  cum_attempts, cum_passed, cum_failed, cum_total_seconds,
  attempts, passed, failed, seconds_played,
  computed_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, UTC_TIMESTAMP(6))
ON DUPLICATE KEY UPDATE
  rating_day_end = VALUES(rating_day_end),
  rating_day_start = COALESCE(daily_puzzle_stats.rating_day_start, VALUES(rating_day_start)),
  cum_attempts = VALUES(cum_attempts),
  cum_passed = VALUES(cum_passed),
  cum_failed = VALUES(cum_failed),
  cum_total_seconds = VALUES(cum_total_seconds),
  attempts = VALUES(attempts),
  passed = VALUES(passed),
  failed = VALUES(failed),
  seconds_played = VALUES(seconds_played),
  computed_at = UTC_TIMESTAMP(6)`
	_, err = s.db.ExecContext(ctx, q,
		pid, statDate,
		start, snap.Rating,
		snap.AttemptCount, snap.PassedCount, snap.FailedCount, snap.TotalSeconds,
		attempts, passed, failed, sec,
	)
	if err != nil {
		return fmt.Errorf("upsert daily_puzzle_stats callback: %w", err)
	}
	return nil
}

// UpsertDailyPuzzleStat 写入 UTC 某日谜题 rating_day_end；rating_day_start 为前一日的 rating_day_end，无则等于当日 end。
func (s *Store) UpsertDailyPuzzleStat(ctx context.Context, profileID uuid.UUID, statDateUTC time.Time, ratingEnd int) error {
	day := statDateUTC.UTC()
	y, m, d := day.Date()
	statDate := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	pid := profileID.String()

	var prev sql.NullInt64
	err := s.db.QueryRowContext(ctx,
		`SELECT rating_day_end FROM daily_puzzle_stats
		 WHERE profile_id = ? AND stat_date = DATE_SUB(?, INTERVAL 1 DAY)`,
		pid, statDate,
	).Scan(&prev)
	if err == sql.ErrNoRows {
		err = nil
	}
	if err != nil {
		return fmt.Errorf("read prev puzzle day: %w", err)
	}
	start := ratingEnd
	if prev.Valid {
		start = int(prev.Int64)
	}

	const q = `
INSERT INTO daily_puzzle_stats (profile_id, stat_date, rating_day_start, rating_day_end, computed_at)
VALUES (?, ?, ?, ?, UTC_TIMESTAMP(6))
ON DUPLICATE KEY UPDATE
  rating_day_end = VALUES(rating_day_end),
  rating_day_start = COALESCE(daily_puzzle_stats.rating_day_start, VALUES(rating_day_start)),
  computed_at = UTC_TIMESTAMP(6)
`
	_, err = s.db.ExecContext(ctx, q, pid, statDate, start, ratingEnd)
	if err != nil {
		return fmt.Errorf("upsert daily_puzzle_stats: %w", err)
	}
	return nil
}
