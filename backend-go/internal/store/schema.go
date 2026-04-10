package store

import (
	"context"
	"fmt"
)

// VerifyMySQLSchemaRequired 确认已应用迁移（含 `005_split_daily_stats.sql`、`011_puzzle_snapshots_and_daily.sql`）。
// 若未迁移，Worker 不应启动，以免误报与旧版 `daily_stats` 相关的错误。
func (s *Store) VerifyMySQLSchemaRequired(ctx context.Context) error {
	const q = `
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('daily_puzzle_stats', 'daily_game_stats', 'profiles', 'games', 'puzzle_snapshots')
`
	var n int
	if err := s.db.QueryRowContext(ctx, q).Scan(&n); err != nil {
		return fmt.Errorf("schema tables check: %w", err)
	}
	if n != 5 {
		return fmt.Errorf(
			"schema: need tables daily_puzzle_stats, daily_game_stats, profiles, games, puzzle_snapshots (apply mysql/migrations through 011_puzzle_snapshots_and_daily.sql); found %d/5",
			n,
		)
	}
	return nil
}
