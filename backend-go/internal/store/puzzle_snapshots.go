package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"chess-tracker/backend-go/internal/chesscom"
)

// InsertPuzzleSnapshot 追加一条 callback 拉取快照（Worker 每次同步写一行）。
func (s *Store) InsertPuzzleSnapshot(ctx context.Context, profileID uuid.UUID, snap *chesscom.PuzzleCallbackStats) error {
	if snap == nil {
		return nil
	}
	pid := profileID.String()
	const q = `INSERT INTO puzzle_snapshots (
  profile_id, fetched_at,
  rating, highest_rating,
  attempt_count, passed_count, failed_count, total_seconds,
  last_date_raw, puzzle_rank, percentile
) VALUES (?, UTC_TIMESTAMP(6), ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	var hi interface{}
	if snap.HighestRating != nil {
		hi = *snap.HighestRating
	}
	var rank interface{}
	if snap.PuzzleRank != nil {
		rank = *snap.PuzzleRank
	}
	var pct interface{}
	if snap.Percentile != nil {
		pct = *snap.Percentile
	}
	var lastRaw interface{}
	if snap.LastDateRaw != nil {
		lastRaw = *snap.LastDateRaw
	}
	_, err := s.db.ExecContext(ctx, q,
		pid,
		snap.Rating,
		hi,
		snap.AttemptCount,
		snap.PassedCount,
		snap.FailedCount,
		snap.TotalSeconds,
		lastRaw,
		rank,
		pct,
	)
	if err != nil {
		return fmt.Errorf("insert puzzle_snapshots: %w", err)
	}
	return nil
}
